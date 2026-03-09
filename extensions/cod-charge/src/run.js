// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @type {FunctionRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const amountStr = input.paymentCustomization?.metafield?.value;

  if (!amountStr) {
    return NO_CHANGES;
  }

  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return NO_CHANGES;
  }

  const codMethod = input.paymentMethods.find((method) =>
    method.name.toLowerCase().includes("cash on delivery") ||
    method.name.toLowerCase().includes("cod")
  );

  if (!codMethod) {
    return NO_CHANGES;
  }

  const displayAmount = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);

  return {
    operations: [
      {
        rename: {
          paymentMethodId: codMethod.id,
          name: `${codMethod.name} (+ ₹${displayAmount} COD Charge)`,
        },
      },
    ],
  };
}
