import type { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';

const PAYMENT_CUSTOMIZATIONS_QUERY = `#graphql
  query paymentCustomizations {
    paymentCustomizations(first: 25) {
      nodes {
        id
        title
        enabled
        functionId
        metafields(first: 10) {
          nodes {
            namespace
            key
            value
          }
        }
      }
    }
  }
`;

const ORDER_QUERY = `#graphql
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      tags
      lineItems(first: 50) {
        nodes {
          title
        }
      }
    }
  }
`;

const ORDER_EDIT_BEGIN = `#graphql
  mutation orderEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_EDIT_ADD_CUSTOM_ITEM = `#graphql
  mutation orderEditAddCustomItem(
    $id: ID!
    $title: String!
    $quantity: Int!
    $price: MoneyInput!
    $taxable: Boolean!
    $requiresShipping: Boolean!
  ) {
    orderEditAddCustomItem(
      id: $id
      title: $title
      quantity: $quantity
      price: $price
      taxable: $taxable
      requiresShipping: $requiresShipping
    ) {
      calculatedOrder {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_EDIT_COMMIT = `#graphql
  mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
    orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const TAGS_ADD = `#graphql
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
	const { admin, payload, shop, topic } = await authenticate.webhook(request);

	console.log(`[COD-WEBHOOK] Received ${topic} webhook for ${shop}`);
	console.log(`[COD-WEBHOOK] Payload keys: ${Object.keys(payload).join(', ')}`);

	if (!admin) {
		console.error('[COD-WEBHOOK] BAIL: No admin API access');
		return new Response();
	}

	const paymentGatewayNames: string[] = payload.payment_gateway_names ?? [];
	console.log(
		`[COD-WEBHOOK] Payment gateways: ${JSON.stringify(paymentGatewayNames)}`,
	);

	const isCOD = paymentGatewayNames.some(
		(name: string) =>
			name.toLowerCase().includes('cash on delivery') ||
			name.toLowerCase().includes('cod'),
	);

	if (!isCOD) {
		console.log('[COD-WEBHOOK] BAIL: Not a COD order');
		return new Response();
	}

	const orderId = payload.admin_graphql_api_id as string;
	const currency = payload.currency as string;
	console.log(
		`[COD-WEBHOOK] COD order detected: ${orderId}, currency: ${currency}`,
	);

	try {
		// Step 1: Check if already applied
		console.log('[COD-WEBHOOK] Step 1: Checking existing tags...');
		const orderResponse = await admin.graphql(ORDER_QUERY, {
			variables: { id: orderId },
		});
		const orderData = await orderResponse.json();
		const tags: string[] = orderData.data?.order?.tags ?? [];
		console.log(`[COD-WEBHOOK] Order tags: ${JSON.stringify(tags)}`);

		if (tags.includes('cod-charge-applied')) {
			console.log(
				`[COD-WEBHOOK] BAIL: COD charge already applied to ${orderId}`,
			);
			return new Response();
		}

		const lineItems = orderData.data?.order?.lineItems?.nodes ?? [];
		const alreadyHasCodProduct = lineItems.some(
			(item: any) => item.title === 'COD Charge',
		);
		if (alreadyHasCodProduct) {
			console.log(
				`[COD-WEBHOOK] COD Charge product already in order line items, tagging only`,
			);
			try {
				await admin.graphql(TAGS_ADD, {
					variables: { id: orderId, tags: ['cod-charge-applied'] },
				});
			} catch (e: any) {
				console.error(`[COD-WEBHOOK] WARNING: tagsAdd threw: ${e.message}`);
			}
			return new Response();
		}

		// Step 2: Find customization with amount
		console.log('[COD-WEBHOOK] Step 2: Looking up payment customizations...');
		const customizationsResponse = await admin.graphql(
			PAYMENT_CUSTOMIZATIONS_QUERY,
		);
		const customizationsData = await customizationsResponse.json();
		const customizations =
			customizationsData.data?.paymentCustomizations?.nodes ?? [];
		console.log(
			`[COD-WEBHOOK] Found ${customizations.length} customization(s): ${JSON.stringify(customizations.map((c: any) => ({ id: c.id, title: c.title, enabled: c.enabled })))}`,
		);

		const codCustomization = customizations.find(
			(c: any) => c.title === 'COD Charge' && c.enabled,
		);

		if (!codCustomization) {
			console.log(
				'[COD-WEBHOOK] BAIL: No active COD Charge customization found',
			);
			return new Response();
		}
		console.log(`[COD-WEBHOOK] Using customization: ${codCustomization.id}`);

		const amountMetafield = codCustomization.metafields?.nodes?.find(
			(m: any) => m.namespace === 'cod-charge' && m.key === 'amount',
		);
		console.log(
			`[COD-WEBHOOK] Amount metafield: ${JSON.stringify(amountMetafield)}`,
		);

		if (!amountMetafield?.value) {
			console.log('[COD-WEBHOOK] BAIL: No COD charge amount configured');
			return new Response();
		}

		const chargeAmount = parseFloat(amountMetafield.value);
		if (isNaN(chargeAmount) || chargeAmount <= 0) {
			console.log(
				`[COD-WEBHOOK] BAIL: Invalid charge amount: ${amountMetafield.value}`,
			);
			return new Response();
		}
		console.log(`[COD-WEBHOOK] Charge amount: ${chargeAmount}`);

		// Step 3: Begin order edit
		console.log('[COD-WEBHOOK] Step 3: Beginning order edit...');
		let editBeginData;
		try {
			const editBeginResponse = await admin.graphql(ORDER_EDIT_BEGIN, {
				variables: { id: orderId },
			});
			editBeginData = await editBeginResponse.json();
		} catch (gqlError: any) {
			console.error(
				`[COD-WEBHOOK] FAIL: orderEditBegin threw: ${gqlError.message}`,
			);
			if (gqlError.response) {
				try {
					const body = (await gqlError.response.json?.()) ?? gqlError.body;
					console.error(
						`[COD-WEBHOOK] GraphQL response body: ${JSON.stringify(body)}`,
					);
				} catch {
					/* ignore */
				}
			}
			return new Response();
		}
		console.log(
			`[COD-WEBHOOK] orderEditBegin response: ${JSON.stringify(editBeginData.data)}`,
		);

		const calculatedOrderId =
			editBeginData.data?.orderEditBegin?.calculatedOrder?.id;
		const beginErrors = editBeginData.data?.orderEditBegin?.userErrors ?? [];

		if (beginErrors.length > 0 || !calculatedOrderId) {
			console.error(
				`[COD-WEBHOOK] FAIL: orderEditBegin errors: ${JSON.stringify(beginErrors)}, calculatedOrderId: ${calculatedOrderId}`,
			);
			return new Response();
		}
		console.log(`[COD-WEBHOOK] Calculated order ID: ${calculatedOrderId}`);

		// Step 4: Add custom line item
		console.log('[COD-WEBHOOK] Step 4: Adding COD charge line item...');
		const addItemVars = {
			id: calculatedOrderId,
			title: 'COD Charge',
			quantity: 1,
			price: {
				amount: String(chargeAmount),
				currencyCode: currency,
			},
			taxable: false,
			requiresShipping: false,
		};
		console.log(
			`[COD-WEBHOOK] addCustomItem variables: ${JSON.stringify(addItemVars)}`,
		);

		let addItemData;
		try {
			const addItemResponse = await admin.graphql(ORDER_EDIT_ADD_CUSTOM_ITEM, {
				variables: addItemVars,
			});
			addItemData = await addItemResponse.json();
		} catch (gqlError: any) {
			console.error(
				`[COD-WEBHOOK] FAIL: orderEditAddCustomItem threw: ${gqlError.message}`,
			);
			return new Response();
		}
		console.log(
			`[COD-WEBHOOK] addCustomItem response: ${JSON.stringify(addItemData.data)}`,
		);

		const addItemErrors =
			addItemData.data?.orderEditAddCustomItem?.userErrors ?? [];
		if (addItemErrors.length > 0) {
			console.error(
				`[COD-WEBHOOK] FAIL: addCustomItem errors: ${JSON.stringify(addItemErrors)}`,
			);
			return new Response();
		}

		// Step 5: Commit the edit
		console.log('[COD-WEBHOOK] Step 5: Committing order edit...');
		let commitData;
		try {
			const commitResponse = await admin.graphql(ORDER_EDIT_COMMIT, {
				variables: {
					id: calculatedOrderId,
					notifyCustomer: false,
					staffNote: `Automatically added ₹${chargeAmount} COD charge`,
				},
			});
			commitData = await commitResponse.json();
		} catch (gqlError: any) {
			console.error(
				`[COD-WEBHOOK] FAIL: orderEditCommit threw: ${gqlError.message}`,
			);
			return new Response();
		}
		console.log(
			`[COD-WEBHOOK] orderEditCommit response: ${JSON.stringify(commitData.data)}`,
		);

		const commitErrors = commitData.data?.orderEditCommit?.userErrors ?? [];
		if (commitErrors.length > 0) {
			console.error(
				`[COD-WEBHOOK] FAIL: commit errors: ${JSON.stringify(commitErrors)}`,
			);
			return new Response();
		}

		// Step 6: Tag the order
		console.log('[COD-WEBHOOK] Step 6: Tagging order...');
		try {
			await admin.graphql(TAGS_ADD, {
				variables: { id: orderId, tags: ['cod-charge-applied'] },
			});
		} catch (gqlError: any) {
			console.error(
				`[COD-WEBHOOK] WARNING: tagsAdd threw: ${gqlError.message}`,
			);
		}

		console.log(
			`[COD-WEBHOOK] SUCCESS: Applied ₹${chargeAmount} COD charge to order ${orderId} for ${shop}`,
		);
	} catch (error) {
		console.error(
			'[COD-WEBHOOK] UNEXPECTED ERROR:',
			error instanceof Error ? error.message : error,
		);
		console.error(
			'[COD-WEBHOOK] Stack:',
			error instanceof Error ? error.stack : 'N/A',
		);
	}

	return new Response();
};
