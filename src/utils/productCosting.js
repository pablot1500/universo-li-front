import { roundMoney } from './salePayments';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const computeSimpleProductCosts = (product = {}) => {
  const telas = Array.isArray(product?.componentes?.telas) ? product.componentes.telas : [];
  const otros = Array.isArray(product?.componentes?.otros) ? product.componentes.otros : [];
  const telasTotal = telas.reduce((acc, row) => acc + toNumber(row?.costoMaterial), 0);
  const otrosRows = otros.map(row => {
    const unidades = toNumber(row?.unidades);
    const precioUnitario = toNumber(row?.precioUnitario);
    return {
      total: unidades * precioUnitario,
      isConfeccion: Boolean(row?.tagConfeccion)
    };
  });
  const otrosNoConfeccion = otrosRows
    .filter(row => !row.isConfeccion)
    .reduce((acc, row) => acc + row.total, 0);
  const otrosConfeccion = otrosRows
    .filter(row => row.isConfeccion)
    .reduce((acc, row) => acc + row.total, 0);

  const hasMaterialBreakdown = telas.length > 0 || otros.length > 0;
  const base = hasMaterialBreakdown
    ? (telasTotal + otrosNoConfeccion)
    : toNumber(product?.price);

  const costMaterials = roundMoney(base);
  const estimatedGainRaw = otrosConfeccion > 0 ? otrosConfeccion : toNumber(product?.costoConfeccion);
  const estimatedGain = roundMoney(estimatedGainRaw);

  return {
    costMaterials,
    estimatedGain
  };
};

export const buildProductMap = (products = []) => {
  const map = new Map();
  products.forEach(product => {
    if (!product || product.id === undefined || product.id === null) return;
    map.set(String(product.id), product);
  });
  return map;
};

export const computeProductCostSummary = (product, productMap = new Map(), visited = new Set()) => {
  if (!product) {
    return {
      costMaterials: 0,
      estimatedGain: 0,
      isComposite: false,
      breakdown: []
    };
  }

  const productId = product?.id !== undefined && product?.id !== null
    ? String(product.id)
    : null;
  if (productId && visited.has(productId)) {
    return {
      costMaterials: 0,
      estimatedGain: 0,
      isComposite: (product?.type || 'simple').toLowerCase() === 'composite',
      breakdown: []
    };
  }

  const visitedWithCurrent = new Set(visited);
  if (productId) {
    visitedWithCurrent.add(productId);
  }

  const type = (product?.type || 'simple').toLowerCase();
  if (type === 'composite') {
    const items = Array.isArray(product?.compositeItems) ? product.compositeItems : [];
    let totalCost = 0;
    let totalGain = 0;
    const breakdown = [];

    items.forEach(item => {
      const childId = item?.productId;
      if (!childId && childId !== 0) return;
      const child = productMap.get(String(childId));
      if (!child) return;
      const childSummary = computeProductCostSummary(child, productMap, visitedWithCurrent);
      totalCost += childSummary.costMaterials;
      totalGain += childSummary.estimatedGain;
      breakdown.push({
        id: child?.id,
        name: child?.name || '',
        type: (child?.type || 'simple').toLowerCase(),
        costMaterials: roundMoney(childSummary.costMaterials),
        estimatedGain: roundMoney(childSummary.estimatedGain)
      });
    });

    return {
      costMaterials: roundMoney(totalCost),
      estimatedGain: roundMoney(totalGain),
      isComposite: true,
      breakdown
    };
  }

  const simpleCosts = computeSimpleProductCosts(product);
  return {
    ...simpleCosts,
    isComposite: false,
    breakdown: []
  };
};
