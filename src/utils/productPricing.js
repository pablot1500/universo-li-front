const round2 = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};
const normalizeKey = (value) => (value || '')
  .toString()
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '')
  .toLowerCase();

const getById = (collection, id) => {
  if (!id || !collection) return null;
  if (collection instanceof Map) return collection.get(id) || null;
  return collection[id] || null;
};

const getInflationPercent = (product) => {
  const adjustment = (Array.isArray(product?.priceAdjustments) ? product.priceAdjustments : [])
    .find(row => normalizeKey(row?.name) === 'inflacion');
  const adjustmentPercent = Number(adjustment?.percent);
  if (Number.isFinite(adjustmentPercent)) return adjustmentPercent;

  const modifiers = product?.pricing?.modificadores || product?.modificadores;
  if (!modifiers || typeof modifiers !== 'object') return null;
  const modifier = Object.entries(modifiers)
    .find(([name]) => normalizeKey(name) === 'inflacion');
  const modifierValue = Number(modifier?.[1]);
  return Number.isFinite(modifierValue) ? modifierValue * 100 : null;
};

const calculateFabricCost = (row, telaById) => {
  const component = getById(telaById, row?.componentId);
  const divisor = Number(component?.unitDivisor) > 0 ? Number(component.unitDivisor) : 1;
  const pricePerMeter = component
    ? round2((Number(component.price) || 0) / divisor)
    : (Number(row?.precioPorMetro) || 0);
  const fabricWidth = Number(row?.anchoTelaCm) || 0;
  const width = Number(row?.anchoCm) || 0;
  const length = Number(row?.largoCm) || 0;
  const wastePercent = Number(row?.porcentajeDesperdicio) || 0;

  if (!pricePerMeter || !fabricWidth || !width || !length) {
    return Number(row?.costoMaterial) || 0;
  }

  const valuePerSquareCm = round2(pricePerMeter / fabricWidth);
  const rawMaterialSquareCm = round2((width * length) / 100);
  const totalMaterialSquareCm = round2(rawMaterialSquareCm * (1 + wastePercent / 100));
  return round2(totalMaterialSquareCm * valuePerSquareCm);
};

const calculateOtherRow = (row, otherById) => {
  const component = getById(otherById, row?.componentId);
  const divisor = Number(component?.unitDivisor) > 0 ? Number(component.unitDivisor) : 1;
  const unitPrice = component
    ? round2((Number(component.price) || 0) / divisor)
    : (Number(row?.precioUnitario) || 0);
  const units = Number(row?.unidades) || 0;
  const componentName = component?.name || row?.name || row?.componentName || row?.component?.name || '';
  const isConfeccion = row?.tagConfeccion != null
    ? Boolean(row.tagConfeccion)
    : normalizeKey(componentName).includes('confeccion');

  return { total: units * unitPrice, isConfeccion };
};

export const calculateProductTotals = (product = {}, context = {}, memo = new Map()) => {
  const productId = product?.id;
  if (productId && memo.has(productId)) return memo.get(productId);

  const emptyResult = {
    hasAny: false,
    total: 0,
    confeccionTotal: 0,
    totalConConfeccionBase: 0,
    totalConConfeccion: 0,
    inflationPercent: null
  };
  if (productId) memo.set(productId, emptyResult);

  const productType = (product?.type || 'simple').toLowerCase();
  if (productType === 'composite') {
    const items = Array.isArray(product?.compositeItems) ? product.compositeItems : [];
    let materialTotal = 0;
    let confeccionTotal = 0;
    let hasReferencedProducts = false;

    items.forEach(item => {
      if (!item?.productId || item.productId === productId) return;
      const referencedProduct = getById(context.productById, item.productId);
      if (!referencedProduct) return;
      const childTotals = calculateProductTotals(referencedProduct, context, memo);
      materialTotal += childTotals.total;
      confeccionTotal += childTotals.confeccionTotal;
      hasReferencedProducts = hasReferencedProducts || childTotals.hasAny || childTotals.totalConConfeccionBase > 0;
    });

    const total = round2(materialTotal);
    const roundedConfeccion = round2(confeccionTotal);
    const totalConConfeccionBase = round2(total + roundedConfeccion);
    const inflationPercent = getInflationPercent(product);
    const totalConConfeccion = Number.isFinite(inflationPercent)
      ? round2(totalConConfeccionBase * (1 + inflationPercent / 100))
      : totalConConfeccionBase;
    const result = {
      hasAny: hasReferencedProducts || items.length > 0,
      total,
      confeccionTotal: roundedConfeccion,
      totalConConfeccionBase,
      totalConConfeccion,
      inflationPercent
    };
    if (productId) memo.set(productId, result);
    return result;
  }

  const fabrics = Array.isArray(product?.componentes?.telas) ? product.componentes.telas : [];
  const otherRows = Array.isArray(product?.componentes?.otros) ? product.componentes.otros : [];
  const hasAny = fabrics.length > 0 || otherRows.length > 0;
  const fabricTotal = fabrics.reduce(
    (sum, row) => sum + calculateFabricCost(row, context.telaById),
    0
  );
  const calculatedOtherRows = otherRows.map(row => calculateOtherRow(row, context.otherById));
  const otherMaterialsTotal = calculatedOtherRows
    .filter(row => !row.isConfeccion)
    .reduce((sum, row) => sum + row.total, 0);
  const hasConfeccionRows = calculatedOtherRows.some(row => row.isConfeccion);
  const confeccionTotal = hasConfeccionRows
    ? calculatedOtherRows
        .filter(row => row.isConfeccion)
        .reduce((sum, row) => sum + row.total, 0)
    : (Number(product?.costoConfeccion) || 0);
  const total = round2(hasAny ? fabricTotal + otherMaterialsTotal : (Number(product?.price) || 0));
  const roundedConfeccion = round2(confeccionTotal);
  const totalConConfeccionBase = round2(total + roundedConfeccion);
  const inflationPercent = getInflationPercent(product);
  const totalConConfeccion = Number.isFinite(inflationPercent)
    ? round2(totalConConfeccionBase * (1 + inflationPercent / 100))
    : totalConConfeccionBase;
  const result = {
    hasAny,
    total,
    confeccionTotal: roundedConfeccion,
    totalConConfeccionBase,
    totalConConfeccion,
    inflationPercent
  };
  if (productId) memo.set(productId, result);
  return result;
};
