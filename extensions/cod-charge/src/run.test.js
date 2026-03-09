import { describe, it, expect } from "vitest";
import { run } from "./run";

function makeInput({ amount, paymentMethods }) {
  return {
    paymentCustomization: {
      metafield: amount != null ? { value: String(amount) } : null,
    },
    paymentMethods: paymentMethods ?? [
      { id: "1", name: "Credit Card" },
      { id: "2", name: "Cash on Delivery" },
    ],
  };
}

describe("COD Charge", () => {
  it("renames COD with the charge amount", () => {
    const result = run(makeInput({ amount: 50 }));

    expect(result).toEqual({
      operations: [
        {
          rename: {
            paymentMethodId: "2",
            name: "Cash on Delivery (+ ₹50 COD Charge)",
          },
        },
      ],
    });
  });

  it("formats decimal amounts correctly", () => {
    const result = run(makeInput({ amount: 49.99 }));

    expect(result).toEqual({
      operations: [
        {
          rename: {
            paymentMethodId: "2",
            name: "Cash on Delivery (+ ₹49.99 COD Charge)",
          },
        },
      ],
    });
  });

  it("returns no operations when no metafield is set", () => {
    const result = run({
      paymentCustomization: { metafield: null },
      paymentMethods: [
        { id: "1", name: "Credit Card" },
        { id: "2", name: "Cash on Delivery" },
      ],
    });

    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations when amount is 0", () => {
    const result = run(makeInput({ amount: 0 }));
    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations when amount is negative", () => {
    const result = run(makeInput({ amount: -10 }));
    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations when amount is not a number", () => {
    const result = run(makeInput({ amount: "abc" }));
    expect(result).toEqual({ operations: [] });
  });

  it("matches COD case-insensitively", () => {
    const result = run(
      makeInput({
        amount: 50,
        paymentMethods: [
          { id: "1", name: "Credit Card" },
          { id: "2", name: "CASH ON DELIVERY" },
        ],
      }),
    );

    expect(result).toEqual({
      operations: [
        {
          rename: {
            paymentMethodId: "2",
            name: "CASH ON DELIVERY (+ ₹50 COD Charge)",
          },
        },
      ],
    });
  });

  it("matches payment method containing 'cod'", () => {
    const result = run(
      makeInput({
        amount: 100,
        paymentMethods: [
          { id: "1", name: "Credit Card" },
          { id: "2", name: "COD" },
        ],
      }),
    );

    expect(result).toEqual({
      operations: [
        {
          rename: {
            paymentMethodId: "2",
            name: "COD (+ ₹100 COD Charge)",
          },
        },
      ],
    });
  });

  it("returns no operations when no COD method exists", () => {
    const result = run(
      makeInput({
        amount: 50,
        paymentMethods: [
          { id: "1", name: "Credit Card" },
          { id: "2", name: "PayPal" },
        ],
      }),
    );

    expect(result).toEqual({ operations: [] });
  });

  it("returns no operations when payment methods list is empty", () => {
    const result = run(makeInput({ amount: 50, paymentMethods: [] }));
    expect(result).toEqual({ operations: [] });
  });
});
