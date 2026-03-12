import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import {
	useLoaderData,
	useActionData,
	useSubmit,
	useNavigation,
} from '@remix-run/react';
import {
	Page,
	Layout,
	Text,
	Card,
	BlockStack,
	InlineStack,
	Banner,
	Badge,
	Box,
	Button,
	TextField,
	FormLayout,
} from '@shopify/polaris';
import { TitleBar } from '@shopify/app-bridge-react';
import { authenticate } from '../shopify.server';
import { useState, useCallback, useEffect } from 'react';

const SHOPIFY_FUNCTIONS_QUERY = `#graphql
  query shopifyFunctions {
    shopifyFunctions(first: 25, apiType: "payment_customization") {
      nodes {
        id
        title
        apiType
      }
    }
  }
`;

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

const PAYMENT_CUSTOMIZATION_CREATE = `#graphql
  mutation paymentCustomizationCreate($paymentCustomization: PaymentCustomizationInput!) {
    paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
      paymentCustomization {
        id
        title
        enabled
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PAYMENT_CUSTOMIZATION_UPDATE = `#graphql
  mutation paymentCustomizationUpdate($id: ID!, $paymentCustomization: PaymentCustomizationInput!) {
    paymentCustomizationUpdate(id: $id, paymentCustomization: $paymentCustomization) {
      paymentCustomization {
        id
        title
        enabled
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SHOP_METAFIELD_QUERY = `#graphql
  query shopMetafield {
    shop {
      id
      metafield(namespace: "cod-charge", key: "variant_id") {
        value
      }
      productMetafield: metafield(namespace: "cod-charge", key: "product_id") {
        value
      }
    }
  }
`;

const PRODUCT_CREATE = `#graphql
  mutation productCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE = `#graphql
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_DELETE = `#graphql
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_EXISTS_QUERY = `#graphql
  query productExists($id: ID!) {
    product(id: $id) {
      id
      status
    }
  }
`;

const PUBLICATIONS_QUERY = `#graphql
  query publications {
    publications(first: 20) {
      nodes {
        id
        name
      }
    }
  }
`;

const PUBLISHABLE_PUBLISH = `#graphql
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function publishProductToOnlineStore(admin: any, productId: string) {
	try {
		const pubResponse = await admin.graphql(PUBLICATIONS_QUERY);
		const pubData = await pubResponse.json();
		const publications = pubData.data?.publications?.nodes ?? [];
		const onlineStore = publications.find(
			(p: any) =>
				p.name === 'Online Store' ||
				p.name.toLowerCase().includes('online store'),
		);
		if (!onlineStore) {
			console.log(
				'ensureCODProduct: no Online Store publication found, available:',
				publications.map((p: any) => p.name),
			);
			return;
		}
		const publishResp = await admin.graphql(PUBLISHABLE_PUBLISH, {
			variables: {
				id: productId,
				input: [{ publicationId: onlineStore.id }],
			},
		});
		const publishData = await publishResp.json();
		const publishErrors =
			publishData.data?.publishablePublish?.userErrors ?? [];
		if (publishErrors.length > 0) {
			console.log(
				'ensureCODProduct: publish errors',
				JSON.stringify(publishErrors),
			);
		} else {
			console.log('ensureCODProduct: published to Online Store');
		}
	} catch (e) {
		console.log(
			'ensureCODProduct: failed to publish product',
			e instanceof Error ? e.message : e,
		);
	}
}

async function deleteCODProduct(admin: any, productId: string) {
	try {
		const resp = await admin.graphql(PRODUCT_DELETE, {
			variables: { input: { id: productId } },
		});
		const data = await resp.json();
		const errors = data.data?.productDelete?.userErrors ?? [];
		if (errors.length > 0) {
			console.log('deleteCODProduct: userErrors', JSON.stringify(errors));
		} else {
			console.log('deleteCODProduct: deleted', productId);
		}
	} catch (e) {
		console.log(
			'deleteCODProduct: product may already be deleted',
			e instanceof Error ? e.message : e,
		);
	}
}

async function ensureCODProduct(admin: any, chargeAmount: number) {
	console.log('ensureCODProduct: starting with amount', chargeAmount);
	const shopResponse = await admin.graphql(SHOP_METAFIELD_QUERY);
	const shopData = await shopResponse.json();
	const shopId = shopData.data?.shop?.id;
	const existingProductId = shopData.data?.shop?.productMetafield?.value;

	if (existingProductId) {
		await deleteCODProduct(admin, existingProductId);
	}

	console.log('ensureCODProduct: creating new product');
	const createResponse = await admin.graphql(PRODUCT_CREATE, {
		variables: {
			product: {
				title: 'COD Charge',
				productType: 'fee',
				status: 'ACTIVE',
			},
		},
	});
	const createData = await createResponse.json();
	const product = createData.data?.productCreate?.product;

	if (!product) {
		const errors = createData.data?.productCreate?.userErrors ?? [];
		throw new Error(
			`Failed to create COD Charge product: ${errors.map((e: any) => e.message).join(', ')}`,
		);
	}

	const variantId = product.variants.edges[0]?.node?.id;
	console.log(
		'ensureCODProduct: product created',
		product.id,
		'variant',
		variantId,
	);

	await admin.graphql(PRODUCT_VARIANTS_BULK_UPDATE, {
		variables: {
			productId: product.id,
			variants: [
				{
					id: variantId,
					price: String(chargeAmount),
				},
			],
		},
	});

	await publishProductToOnlineStore(admin, product.id);

	await admin.graphql(METAFIELDS_SET, {
		variables: {
			metafields: [
				{
					ownerId: shopId,
					namespace: 'cod-charge',
					key: 'variant_id',
					type: 'single_line_text_field',
					value: variantId,
				},
				{
					ownerId: shopId,
					namespace: 'cod-charge',
					key: 'product_id',
					type: 'single_line_text_field',
					value: product.id,
				},
				{
					ownerId: shopId,
					namespace: 'cod-charge',
					key: 'charge_amount',
					type: 'single_line_text_field',
					value: String(chargeAmount),
				},
			],
		},
	});

	return variantId;
}

async function checkCODProductExists(admin: any): Promise<boolean> {
	const shopResponse = await admin.graphql(SHOP_METAFIELD_QUERY);
	const shopData = await shopResponse.json();
	const existingProductId = shopData.data?.shop?.productMetafield?.value;

	if (!existingProductId) return false;

	try {
		const resp = await admin.graphql(PRODUCT_EXISTS_QUERY, {
			variables: { id: existingProductId },
		});
		const data = await resp.json();
		return Boolean(data.data?.product?.id);
	} catch {
		return false;
	}
}

async function archiveCODProduct(admin: any) {
	const shopResponse = await admin.graphql(SHOP_METAFIELD_QUERY);
	const shopData = await shopResponse.json();
	const existingProductId = shopData.data?.shop?.productMetafield?.value;

	if (existingProductId) {
		await deleteCODProduct(admin, existingProductId);
	}
}

async function findFunction(admin: any) {
	const functionsResponse = await admin.graphql(SHOPIFY_FUNCTIONS_QUERY);
	const functionsData = await functionsResponse.json();
	const functions = functionsData.data?.shopifyFunctions?.nodes ?? [];
	return functions.find((fn: any) => fn.title === 'COD Charge');
}

async function findExistingCustomization(admin: any, functionId: string) {
	const customizationsResponse = await admin.graphql(
		PAYMENT_CUSTOMIZATIONS_QUERY,
	);
	const customizationsData = await customizationsResponse.json();
	const customizations =
		customizationsData.data?.paymentCustomizations?.nodes ?? [];
	return customizations.find((c: any) => c.functionId === functionId);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const { admin } = await authenticate.admin(request);

	const ourFunction = await findFunction(admin);
	if (!ourFunction) {
		return json({
			status: 'not_deployed' as const,
			enabled: false,
			amount: '',
			message:
				'Could not find the COD Charge function. Make sure the extension is deployed.',
		});
	}

	const existing = await findExistingCustomization(admin, ourFunction.id);

	if (!existing) {
		return json({
			status: 'inactive' as const,
			enabled: false,
			amount: '',
			message:
				'COD Charge has not been activated yet. Set a charge amount and click Activate.',
		});
	}

	const amountMetafield = existing.metafields?.nodes?.find(
		(m: any) => m.namespace === 'cod-charge' && m.key === 'amount',
	);
	const amount = amountMetafield?.value ?? '';

	if (!existing.enabled) {
		return json({
			status: 'disabled' as const,
			enabled: false,
			amount,
			message:
				'COD Charge exists but is currently disabled. Click Activate to enable it.',
		});
	}

	const productExists = await checkCODProductExists(admin);
	if (!productExists && amount) {
		try {
			await ensureCODProduct(admin, parseFloat(amount));
			console.log('loader: auto-recreated deleted COD product');
		} catch (e) {
			console.error('loader: failed to auto-recreate COD product', e);
			return json({
				status: 'active' as const,
				enabled: true,
				amount,
				message: `COD Charge is active but the product was deleted. Click Save to recreate it.`,
				productMissing: true,
			});
		}
	}

	return json({
		status: 'active' as const,
		enabled: true,
		amount,
		message: `COD Charge is active. ₹${amount} will be shown at checkout and automatically added to orders placed with Cash on Delivery.`,
	});
};

export const action = async ({ request }: ActionFunctionArgs) => {
	try {
		const { admin } = await authenticate.admin(request);
		const formData = await request.formData();
		const intent = formData.get('intent');
		const amount = formData.get('amount') as string;

		const ourFunction = await findFunction(admin);
		if (!ourFunction) {
			return json({
				status: 'not_deployed' as const,
				enabled: false,
				amount: '',
				message:
					'Could not find the COD Charge function. Deploy the extension first.',
			});
		}

		const existing = await findExistingCustomization(admin, ourFunction.id);

		if (intent === 'activate') {
			const chargeAmount = parseFloat(amount);
			if (!amount || isNaN(chargeAmount) || chargeAmount <= 0) {
				return json({
					status: existing?.enabled ? 'active' : 'inactive',
					enabled: existing?.enabled ?? false,
					amount: amount ?? '',
					message: 'Please enter a valid charge amount greater than 0.',
				});
			}

			await ensureCODProduct(admin, chargeAmount);

			if (!existing) {
				const createResponse = await admin.graphql(
					PAYMENT_CUSTOMIZATION_CREATE,
					{
						variables: {
							paymentCustomization: {
								functionId: ourFunction.id,
								title: 'COD Charge',
								enabled: true,
								metafields: [
									{
										namespace: 'cod-charge',
										key: 'amount',
										type: 'single_line_text_field',
										value: String(chargeAmount),
									},
								],
							},
						},
					},
				);
				const createData = await createResponse.json();
				const userErrors =
					createData.data?.paymentCustomizationCreate?.userErrors ?? [];
				if (userErrors.length > 0) {
					return json({
						status: 'error' as const,
						enabled: false,
						amount,
						message: userErrors.map((e: any) => e.message).join(', '),
					});
				}
				return json({
					status: 'active' as const,
					enabled: true,
					amount: String(chargeAmount),
					message: `COD Charge activated successfully. Charge: ₹${chargeAmount}`,
				});
			}

			const updateResponse = await admin.graphql(PAYMENT_CUSTOMIZATION_UPDATE, {
				variables: {
					id: existing.id,
					paymentCustomization: {
						enabled: true,
						metafields: [
							{
								namespace: 'cod-charge',
								key: 'amount',
								type: 'single_line_text_field',
								value: String(chargeAmount),
							},
						],
					},
				},
			});
			const updateData = await updateResponse.json();
			const userErrors =
				updateData.data?.paymentCustomizationUpdate?.userErrors ?? [];
			if (userErrors.length > 0) {
				return json({
					status: 'error' as const,
					enabled: false,
					amount,
					message: userErrors.map((e: any) => e.message).join(', '),
				});
			}
			return json({
				status: 'active' as const,
				enabled: true,
				amount: String(chargeAmount),
				message: `COD Charge updated and enabled. Charge: ₹${chargeAmount}`,
			});
		}

		if (intent === 'deactivate' && existing) {
			await archiveCODProduct(admin);

			const updateResponse = await admin.graphql(PAYMENT_CUSTOMIZATION_UPDATE, {
				variables: {
					id: existing.id,
					paymentCustomization: { enabled: false },
				},
			});
			const updateData = await updateResponse.json();
			const userErrors =
				updateData.data?.paymentCustomizationUpdate?.userErrors ?? [];
			if (userErrors.length > 0) {
				return json({
					status: 'error' as const,
					enabled: existing.enabled,
					amount: amount ?? '',
					message: userErrors.map((e: any) => e.message).join(', '),
				});
			}

			const amountMetafield = existing.metafields?.nodes?.find(
				(m: any) => m.namespace === 'cod-charge' && m.key === 'amount',
			);

			return json({
				status: 'disabled' as const,
				enabled: false,
				amount: amountMetafield?.value ?? '',
				message: 'COD Charge has been disabled.',
			});
		}

		return json({
			status: 'error' as const,
			enabled: false,
			amount: '',
			message: 'Unknown action.',
		});
	} catch (error) {
		console.error('Action error:', error);
		if (error instanceof Response) throw error;
		return json({
			status: 'error' as const,
			enabled: false,
			amount: '',
			message:
				error instanceof Error
					? `Error: ${error.message}`
					: 'An unexpected error occurred.',
		});
	}
};

export default function Index() {
	const loaderData = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const submit = useSubmit();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === 'submitting';

	const data = actionData ?? loaderData;
	const { status, enabled, message, amount: savedAmount } = data;

	const [amount, setAmount] = useState(savedAmount || '');

	useEffect(() => {
		if (savedAmount) {
			setAmount(savedAmount);
		}
	}, [savedAmount]);

	const handleAmountChange = useCallback(
		(value: string) => setAmount(value),
		[],
	);

	const handleActivate = () => {
		submit({ intent: 'activate', amount }, { method: 'post' });
	};

	const handleDeactivate = () => {
		submit({ intent: 'deactivate', amount }, { method: 'post' });
	};

	const bannerTone =
		status === 'active'
			? 'success'
			: status === 'not_deployed' || status === 'error'
				? 'critical'
				: 'warning';

	return (
		<Page>
			<TitleBar title="COD Charge" />
			<BlockStack gap="500">
				<Layout>
					<Layout.Section>
						<Card>
							<BlockStack gap="400">
								<InlineStack align="space-between" blockAlign="center">
									<Text as="h2" variant="headingMd">
										COD Charge Settings
									</Text>
									<Badge
										tone={
											status === 'active'
												? 'success'
												: status === 'not_deployed' || status === 'error'
													? 'critical'
													: 'warning'
										}
									>
										{status === 'active'
											? 'Active'
											: status === 'not_deployed'
												? 'Not Deployed'
												: status === 'disabled'
													? 'Disabled'
													: status === 'inactive'
														? 'Inactive'
														: 'Error'}
									</Badge>
								</InlineStack>

								<Text variant="bodyMd" as="p">
									Add a Cash on Delivery surcharge that is automatically applied
									to orders placed with the COD payment method. The charge is
									shown at checkout and added to the order total.
								</Text>

								<Box>
									<Banner tone={bannerTone}>
										<p>{message}</p>
									</Banner>
								</Box>

								{status !== 'not_deployed' && (
									<FormLayout>
										<TextField
											label="COD Charge Amount (₹)"
											type="number"
											value={amount}
											onChange={handleAmountChange}
											autoComplete="off"
											min={0}
											step={1}
											helpText="This amount will be shown on the COD payment method at checkout and automatically added to the order total."
										/>
										<InlineStack align="end" gap="300">
											{enabled ? (
												<>
													<Button
														variant="primary"
														onClick={handleActivate}
														loading={isSubmitting}
													>
														Save
													</Button>
													<Button
														variant="primary"
														tone="critical"
														onClick={handleDeactivate}
														loading={isSubmitting}
													>
														Deactivate
													</Button>
												</>
											) : (
												<Button
													variant="primary"
													onClick={handleActivate}
													loading={isSubmitting}
												>
													Activate
												</Button>
											)}
										</InlineStack>
									</FormLayout>
								)}
							</BlockStack>
						</Card>
					</Layout.Section>
				</Layout>
			</BlockStack>
		</Page>
	);
}
