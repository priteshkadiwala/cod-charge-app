import {
  reactExtension,
  useSelectedPaymentOptions,
  useApplyCartLinesChange,
  useCartLines,
  useAppMetafields,
  Banner,
  Text,
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useState } from "react";

export default reactExtension(
  "purchase.checkout.payment-method-list.render-after",
  () => <Extension />,
);

function Extension() {
  const selectedPaymentOptions = useSelectedPaymentOptions();
  const applyCartLinesChange = useApplyCartLinesChange();
  const cartLines = useCartLines();
  const appMetafields = useAppMetafields();
  const [changing, setChanging] = useState(false);

  const variantIdMeta = appMetafields.find(
    (m) =>
      m.metafield.namespace === "cod-charge" &&
      m.metafield.key === "variant_id",
  );
  const chargeAmountMeta = appMetafields.find(
    (m) =>
      m.metafield.namespace === "cod-charge" &&
      m.metafield.key === "charge_amount",
  );

  const variantId = variantIdMeta?.metafield?.value;
  const chargeAmount = chargeAmountMeta?.metafield?.value
    ? parseFloat(chargeAmountMeta.metafield.value)
    : null;

  const isCODSelected = selectedPaymentOptions.some(
    (option) =>
      option.type === "paymentOnDelivery" || option.type === "manualPayment",
  );

  const codLine = variantId
    ? cartLines.find((line) => line.merchandise?.id === variantId)
    : null;
  const hasCodLine = Boolean(codLine);

  useEffect(() => {
    if (changing || !variantId || !chargeAmount) return;

    if (isCODSelected && !hasCodLine) {
      setChanging(true);
      applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: variantId,
        quantity: 1,
      }).finally(() => setChanging(false));
    } else if (!isCODSelected && hasCodLine) {
      setChanging(true);
      applyCartLinesChange({
        type: "removeCartLine",
        id: codLine.id,
        quantity: codLine.quantity,
      }).finally(() => setChanging(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCODSelected, hasCodLine]);

  if (!isCODSelected || !chargeAmount || !hasCodLine) {
    return null;
  }

  const displayAmount =
    chargeAmount % 1 === 0 ? chargeAmount.toFixed(0) : chargeAmount.toFixed(2);

  return (
    <Banner status="info" title="COD Charge Applied">
      <Text>
        A COD handling fee of ₹{displayAmount} has been added to your order.
      </Text>
    </Banner>
  );
}
