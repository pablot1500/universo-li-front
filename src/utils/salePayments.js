const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
};

export const roundMoney = (value) => {
  const num = toFiniteNumber(value, 0);
  const rounded = Math.round(num * 100) / 100;
  if (!Number.isFinite(rounded)) return 0;
  return rounded;
};

const clampNonNegative = (value) => {
  const num = roundMoney(value);
  return num < 0 ? 0 : num;
};

export const approxEqual = (a, b, tolerance = 0.01) => Math.abs(a - b) < tolerance;

const parseMoneyOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = toFiniteNumber(value, NaN);
  if (!Number.isFinite(num)) return null;
  return roundMoney(num);
};

export const normalizePayments = (total, received, pending) => {
  const safeTotal = clampNonNegative(total);
  let safeReceived = clampNonNegative(received);
  let safePending = clampNonNegative(pending);

  if (safeTotal > 0) {
    const sum = safeReceived + safePending;
    if (approxEqual(sum, safeTotal)) {
      safePending = clampNonNegative(safeTotal - safeReceived);
    } else if (approxEqual(safePending, safeTotal) && approxEqual(safeReceived, 0)) {
      safePending = clampNonNegative(safeTotal);
      safeReceived = clampNonNegative(safeTotal - safePending);
    } else {
      safeReceived = Math.min(safeReceived, safeTotal);
      safePending = clampNonNegative(safeTotal - safeReceived);
    }
  }

  return {
    total: safeTotal,
    paymentReceived: safeReceived,
    paymentPending: safePending
  };
};

export const determinePaymentStatus = (total, received, pending = null) => {
  const safeTotal = clampNonNegative(total);
  const safeReceived = clampNonNegative(received);
  if (safeTotal <= 0) {
    if (safeReceived > 0) return 'Pagado';
    if (pending !== null && clampNonNegative(pending) > 0) return 'Pendiente de Pago';
    return 'Pagado';
  }
  if (approxEqual(safeReceived, safeTotal)) return 'Pagado';
  if (approxEqual(safeReceived, 0)) return 'Pendiente de Pago';
  return 'Pago parcial';
};

export const computeSaleFinancials = (sale = {}) => {
  const qty = Number(sale.quantity) || 0;
  const unitCost = Number(sale.unitPrice) || 0;
  const estimatedGain = Number(sale.gananciaUnit) || 0;
  const costMaterials = clampNonNegative(qty * unitCost);
  const computedTotal = clampNonNegative(qty * (unitCost + estimatedGain));
  const fallbackTotal = clampNonNegative(sale.total);
  const realSaleValue = parseMoneyOrNull(sale.realSaleValue);
  const effectiveSaleValue = realSaleValue !== null && realSaleValue >= 0
    ? realSaleValue
    : (computedTotal > 0 ? computedTotal : fallbackTotal);

  const hasReceived = sale.paymentReceived !== undefined && sale.paymentReceived !== null && sale.paymentReceived !== '';
  const hasPending = sale.paymentPending !== undefined && sale.paymentPending !== null && sale.paymentPending !== '';
  const baseReceived = hasReceived
    ? sale.paymentReceived
    : (hasPending ? 0 : effectiveSaleValue);
  const basePending = hasPending
    ? sale.paymentPending
    : (hasReceived ? 0 : 0);

  const { paymentReceived, paymentPending } = normalizePayments(
    effectiveSaleValue,
    baseReceived,
    basePending
  );

  const paymentStatus = determinePaymentStatus(effectiveSaleValue, paymentReceived, paymentPending);

  return {
    quantity: qty,
    unitCost,
    estimatedGain,
    costMaterials,
    computedTotal,
    fallbackTotal,
    realSaleValue,
    effectiveSaleValue,
    paymentReceived,
    paymentPending,
    paymentStatus
  };
};

export const isSaleFullyPaid = (sale) => {
  const { paymentStatus } = computeSaleFinancials(sale);
  return paymentStatus === 'Pagado';
};
