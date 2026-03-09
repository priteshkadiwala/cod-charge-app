import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

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

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) {
    console.error("No admin API access for orders/create webhook");
    return new Response();
  }

  const paymentGatewayNames: string[] = payload.payment_gateway_names ?? [];
  const isCOD = paymentGatewayNames.some(
    (name: string) =>
      name.toLowerCase().includes("cash on delivery") ||
      name.toLowerCase().includes("cod"),
  );

  if (!isCOD) {
    return new Response();
  }

  const orderId = payload.admin_graphql_api_id as string;
  const currency = payload.currency as string;

  try {
    const orderResponse = await admin.graphql(ORDER_QUERY, {
      variables: { id: orderId },
    });
    const orderData = await orderResponse.json();
    const tags: string[] = orderData.data?.order?.tags ?? [];

    if (tags.includes("cod-charge-applied")) {
      console.log(`COD charge already applied to ${orderId}, skipping`);
      return new Response();
    }

    const customizationsResponse = await admin.graphql(
      PAYMENT_CUSTOMIZATIONS_QUERY,
    );
    const customizationsData = await customizationsResponse.json();
    const customizations =
      customizationsData.data?.paymentCustomizations?.nodes ?? [];

    const codCustomization = customizations.find(
      (c: any) => c.title === "COD Charge" && c.enabled,
    );

    if (!codCustomization) {
      console.log("No active COD Charge customization found, skipping");
      return new Response();
    }

    const amountMetafield = codCustomization.metafields?.nodes?.find(
      (m: any) => m.namespace === "cod-charge" && m.key === "amount",
    );

    if (!amountMetafield?.value) {
      console.log("No COD charge amount configured, skipping");
      return new Response();
    }

    const chargeAmount = parseFloat(amountMetafield.value);
    if (isNaN(chargeAmount) || chargeAmount <= 0) {
      console.log("Invalid COD charge amount, skipping");
      return new Response();
    }

    const editBeginResponse = await admin.graphql(ORDER_EDIT_BEGIN, {
      variables: { id: orderId },
    });
    const editBeginData = await editBeginResponse.json();
    const calculatedOrderId =
      editBeginData.data?.orderEditBegin?.calculatedOrder?.id;
    const beginErrors =
      editBeginData.data?.orderEditBegin?.userErrors ?? [];

    if (beginErrors.length > 0 || !calculatedOrderId) {
      console.error("Failed to begin order edit:", beginErrors);
      return new Response();
    }

    const addItemResponse = await admin.graphql(
      ORDER_EDIT_ADD_CUSTOM_ITEM,
      {
        variables: {
          id: calculatedOrderId,
          title: "COD Charge",
          quantity: 1,
          price: {
            amount: String(chargeAmount),
            currencyCode: currency,
          },
          taxable: false,
          requiresShipping: false,
        },
      },
    );
    const addItemData = await addItemResponse.json();
    const addItemErrors =
      addItemData.data?.orderEditAddCustomItem?.userErrors ?? [];

    if (addItemErrors.length > 0) {
      console.error("Failed to add COD charge line item:", addItemErrors);
      return new Response();
    }

    const commitResponse = await admin.graphql(ORDER_EDIT_COMMIT, {
      variables: {
        id: calculatedOrderId,
        notifyCustomer: false,
        staffNote: `Automatically added ₹${chargeAmount} COD charge`,
      },
    });
    const commitData = await commitResponse.json();
    const commitErrors =
      commitData.data?.orderEditCommit?.userErrors ?? [];

    if (commitErrors.length > 0) {
      console.error("Failed to commit order edit:", commitErrors);
      return new Response();
    }

    await admin.graphql(TAGS_ADD, {
      variables: { id: orderId, tags: ["cod-charge-applied"] },
    });

    console.log(
      `Applied ₹${chargeAmount} COD charge to order ${orderId} for ${shop}`,
    );
  } catch (error) {
    console.error("Error processing COD charge for order:", error);
  }

  return new Response();
};
