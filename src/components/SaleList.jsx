

import React, { useState, useEffect, useMemo } from 'react';
import { computeSaleFinancials, normalizePayments, determinePaymentStatus, roundMoney } from '../utils/salePayments';
import { buildProductMap, computeProductCostSummary } from '../utils/productCosting';

const paymentStatusColor = (status) => {
  if (status === 'Pendiente de Pago') return '#b91c1c';
  if (status === 'Pago parcial') return '#f87171';
  return '#111827';
};

const SaleList = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [lastDeletedSale, setLastDeletedSale] = useState(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchAll = async () => {
    try {
      const [resSales, resProducts] = await Promise.all([
        fetch('/api/sales'),
        fetch('/api/products')
      ]);
      if (resSales.ok) setSales(await resSales.json());
      if (resProducts.ok) setProducts(await resProducts.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const capitalize = (s) => {
    if (!s) return s;
    const t = String(s);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const productMap = useMemo(() => buildProductMap(products), [products]);

  const joinedSales = useMemo(() => {
    return sales.map(s => ({
      ...s,
      product: productMap.get(String(s.productId)) || null
    }));
  }, [sales, productMap]);

  const enrichedSales = useMemo(() => {
    return joinedSales.map(sale => ({
      ...sale,
      financials: computeSaleFinancials(sale)
    }));
  }, [joinedSales]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return enrichedSales.filter(s => {
      const name = s.product?.name?.toLowerCase() || '';
      const cust = s.customerName?.toLowerCase() || '';
      const matchesSearch = term ? (name.includes(term) || cust.includes(term)) : true;
      const matchesMethod = method ? s.paymentMethod === method : true;
      const d = s.date ? new Date(s.date) : null;
      const matchesStart = start ? (d && d >= start) : true;
      const matchesEnd = end ? (d && d <= end) : true;
      return matchesSearch && matchesMethod && matchesStart && matchesEnd;
    });
  }, [enrichedSales, search, method, startDate, endDate]);

  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [pageSize, setPageSize] = useState(10);
  const [editingSale, setEditingSale] = useState(null);
  const [editData, setEditData] = useState(null);
  const [initialEditData, setInitialEditData] = useState(null);
  const [editDirty, setEditDirty] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const syncEditData = (updater) => {
    setEditData(prev => {
      const base = prev ? { ...prev } : {};
      const next = updater(base);
      if (!next) return base;
      if (initialEditData) {
        const dirty = Object.keys(next).some(key => (next[key] ?? '') !== (initialEditData[key] ?? ''));
        setEditDirty(dirty);
      } else {
        setEditDirty(true);
      }
      return next;
    });
  };

  const getEditEffectiveTotal = (data) => {
    const qty = Number(data.quantity) || 0;
    const unit = Number(data.unitPrice) || 0;
    const gain = Number(data.gananciaUnit) || 0;
    const computed = Math.max(qty * (unit + gain), 0);
    if (data.realSaleValue !== '' && data.realSaleValue !== null && data.realSaleValue !== undefined) {
      const real = Number(data.realSaleValue);
      if (Number.isFinite(real) && real >= 0) return real;
    }
    if (computed > 0) return computed;
    const fallbackCandidate = editingSale?.financials?.effectiveSaleValue ?? Number(editingSale?.total);
    const fallback = Number.isFinite(fallbackCandidate) ? fallbackCandidate : 0;
    return fallback > 0 ? fallback : 0;
  };

  const toInputString = (value) => {
    const rounded = roundMoney(value);
    return Number.isFinite(rounded) ? String(rounded) : '0';
  };

  const sorted = useMemo(() => {
    const list = [...filtered];
    const directionFactor = sortDirection === 'desc' ? -1 : 1;
    return list.sort((a, b) => {
      const getName = (sale) => sale.product?.name?.toLowerCase() || '';
      const getDate = (sale) => {
        if (!sale.date) return 0;
        const timestamp = new Date(sale.date).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
      };
      const getPrice = (sale) => {
        const value = Number(sale.unitPrice);
        return Number.isNaN(value) ? 0 : value;
      };

      let aValue;
      let bValue;

      switch (sortField) {
        case 'name':
          aValue = getName(a);
          bValue = getName(b);
          break;
        case 'price':
          aValue = getPrice(a);
          bValue = getPrice(b);
          break;
        case 'date':
        default:
          aValue = getDate(a);
          bValue = getDate(b);
          break;
      }

      if (aValue < bValue) return -1 * directionFactor;
      if (aValue > bValue) return 1 * directionFactor;
      return 0;
    });
  }, [filtered, sortField, sortDirection]);

  const displayed = useMemo(() => sorted.slice(0, pageSize), [sorted, pageSize]);

  const displayedRows = useMemo(() => {
    return displayed.map(s => {
      const fin = s.financials || computeSaleFinancials(s);
      const costMaterials = Number.isFinite(fin.unitCost) ? fin.unitCost : 0;
      const estimatedGain = Number.isFinite(fin.estimatedGain) ? fin.estimatedGain : 0;
      const costTotal = fin.computedTotal > 0 ? fin.computedTotal : fin.fallbackTotal;
      const hasRealSale = fin.realSaleValue !== null && fin.realSaleValue !== undefined;
      const realSaleDisplay = hasRealSale ? fin.realSaleValue : null;
      const realSaleAmount = hasRealSale ? fin.realSaleValue : 0;
      const realProfitValue = hasRealSale ? realSaleAmount - costMaterials : 0;
      return {
        sale: s,
        fin,
        costMaterials,
        estimatedGain,
        costTotal,
        hasRealSale,
        realSaleDisplay,
        realSaleAmount,
        realProfitDisplay: hasRealSale ? realProfitValue : null,
        realProfitValue,
        paymentReceived: fin.paymentReceived,
        paymentPending: fin.paymentPending,
        status: fin.paymentStatus
      };
    });
  }, [displayed]);

  const saleTotals = useMemo(() => {
    return displayedRows.reduce((acc, row) => {
      if (row.hasRealSale) {
        acc.realSaleValue += row.realSaleAmount;
        acc.realProfit += row.realProfitValue;
      }
      acc.paymentReceived += row.paymentReceived;
      acc.paymentPending += row.paymentPending;
      return acc;
    }, {
      realSaleValue: 0,
      paymentReceived: 0,
      paymentPending: 0,
      realProfit: 0
    });
  }, [displayedRows]);

  const editProductExists = useMemo(() => {
    if (!editData) return false;
    return products.some(p => String(p.id) === String(editData.productId));
  }, [editData, products]);

  const editSelectedProduct = useMemo(() => {
    if (!editData) return null;
    const direct = productMap.get(String(editData.productId));
    if (direct) return direct;
    if (editingSale?.product && String(editingSale.product.id) === String(editData.productId)) {
      return editingSale.product;
    }
    return null;
  }, [editData, editingSale, productMap]);

  const editSelectedSummary = useMemo(() => {
    if (!editSelectedProduct) return null;
    return computeProductCostSummary(editSelectedProduct, productMap);
  }, [editSelectedProduct, productMap]);

  const isEditComposite = editSelectedSummary?.isComposite || false;
  const editCompositeBreakdown = isEditComposite ? (editSelectedSummary?.breakdown || []) : [];

  const openEdit = (sale) => {
    if (!sale) return;
    const financials = sale.financials || computeSaleFinancials(sale);
    const product = sale.product || productMap.get(String(sale.productId)) || null;
    const summary = product ? computeProductCostSummary(product, productMap) : null;
    const normalized = {
      productId: String(sale.productId || ''),
      quantity: String(sale.quantity ?? ''),
      unitPrice: sale.unitPrice !== undefined && sale.unitPrice !== null ? String(sale.unitPrice) : '',
      gananciaUnit: sale.gananciaUnit !== undefined && sale.gananciaUnit !== null ? String(sale.gananciaUnit) : '',
      realSaleValue: financials.realSaleValue !== null ? String(financials.realSaleValue) : '',
      customerName: sale.customerName || '',
      date: sale.date || '',
      paymentMethod: sale.paymentMethod || '',
      paymentReceived: String(financials.paymentReceived),
      paymentPending: String(financials.paymentPending),
      paymentNotes: sale.paymentNotes || ''
    };
    if (summary?.isComposite) {
      normalized.unitPrice = toInputString(summary.costMaterials);
      normalized.gananciaUnit = toInputString(summary.estimatedGain);
    }
    setEditingSale(product ? { ...sale, product } : sale);
    setEditData(normalized);
    setInitialEditData({ ...normalized });
    setEditDirty(false);
    setSavingEdit(false);
  };

  const handleEditFieldChange = (field) => (e) => {
    const value = e && e.target ? e.target.value : e;
    if (field === 'productId') {
      const nextProduct = productMap.get(String(value));
      const summary = nextProduct ? computeProductCostSummary(nextProduct, productMap) : null;
      syncEditData(prev => {
        const base = { ...prev, productId: value };
        if (summary?.isComposite) {
          return {
            ...base,
            unitPrice: toInputString(summary.costMaterials),
            gananciaUnit: toInputString(summary.estimatedGain)
          };
        }
        return base;
      });
      return;
    }
    if ((field === 'unitPrice' || field === 'gananciaUnit') && isEditComposite) {
      return;
    }
    syncEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleEditPaymentReceivedChange = (e) => {
    const value = e && e.target ? e.target.value : e;
    syncEditData(prev => {
      const base = { ...prev, paymentReceived: value ?? '' };
      const total = getEditEffectiveTotal(base);
      const payments = normalizePayments(total, base.paymentReceived, base.paymentPending ?? 0);
      return {
        ...base,
        paymentReceived: toInputString(payments.paymentReceived),
        paymentPending: toInputString(payments.paymentPending)
      };
    });
  };

  const handleEditPaymentPendingChange = (e) => {
    const value = e && e.target ? e.target.value : e;
    syncEditData(prev => {
      const base = { ...prev, paymentPending: value ?? '' };
      const total = getEditEffectiveTotal(base);
      const payments = normalizePayments(total, base.paymentReceived ?? 0, base.paymentPending);
      return {
        ...base,
        paymentReceived: toInputString(payments.paymentReceived),
        paymentPending: toInputString(payments.paymentPending)
      };
    });
  };

  useEffect(() => {
    if (!editData || !isEditComposite || !editSelectedSummary) return;
    const targetCost = editSelectedSummary.costMaterials;
    const targetGain = editSelectedSummary.estimatedGain;
    const currentCost = Number(editData.unitPrice);
    const currentGain = Number(editData.gananciaUnit);
    const approx = (a, b) => Math.abs((Number.isFinite(a) ? a : 0) - (Number.isFinite(b) ? b : 0)) < 0.01;
    if (approx(currentCost, targetCost) && approx(currentGain, targetGain)) return;
    setEditData(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        unitPrice: toInputString(targetCost),
        gananciaUnit: toInputString(targetGain)
      };
      if (initialEditData) {
        const dirty = Object.keys(next).some(key => (next[key] ?? '') !== (initialEditData[key] ?? ''));
        setEditDirty(dirty);
      } else {
        setEditDirty(true);
      }
      return next;
    });
  }, [editData, isEditComposite, editSelectedSummary, initialEditData]);

  const closeEdit = () => {
    setEditingSale(null);
    setEditData(null);
    setInitialEditData(null);
    setEditDirty(false);
    setSavingEdit(false);
  };

  const requestCloseEdit = () => {
    if (editDirty) {
      const confirmLeave = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm('Hay cambios sin guardar. ¿Querés descartarlos?')
        : true;
      if (!confirmLeave) return;
    }
    closeEdit();
  };

  const numberOrZero = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const isEditValid = useMemo(() => {
    if (!editData) return false;
    const requiredFields = ['productId', 'date', 'paymentMethod'];
    for (const field of requiredFields) {
      if (!editData[field]) return false;
    }
    const qty = Number(editData.quantity);
    const unit = Number(editData.unitPrice);
    const gain = Number(editData.gananciaUnit);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    if (!Number.isFinite(unit) || unit < 0) return false;
    if (!Number.isFinite(gain) || gain < 0) return false;
    if (editData.realSaleValue !== '' && !Number.isFinite(Number(editData.realSaleValue))) return false;
    if (editData.paymentReceived !== undefined && editData.paymentReceived !== '') {
      const received = Number(editData.paymentReceived);
      if (!Number.isFinite(received) || received < 0) return false;
    }
    if (editData.paymentPending !== undefined && editData.paymentPending !== '') {
      const pending = Number(editData.paymentPending);
      if (!Number.isFinite(pending) || pending < 0) return false;
    }
    return true;
  }, [editData]);

  const editPreview = useMemo(() => {
    if (!editData) return null;
    const qtyRaw = Number(editData.quantity);
    const costRaw = Number(editData.unitPrice);
    const gainRaw = Number(editData.gananciaUnit);
    const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
    const cost = Number.isFinite(costRaw) ? costRaw : 0;
    const gain = Number.isFinite(gainRaw) ? gainRaw : 0;
    const totalRaw = qty * (cost + gain);
    const total = Number.isFinite(totalRaw) ? Math.max(totalRaw, 0) : 0;
    const realSaleValRaw = editData.realSaleValue === '' ? null : Number(editData.realSaleValue);
    const realSaleValid = realSaleValRaw !== null && Number.isFinite(realSaleValRaw);
    const realSaleVal = realSaleValid ? realSaleValRaw : null;
    const realProfit = realSaleVal !== null ? realSaleVal - cost : null;
    const rawFallbackTotal = editingSale?.financials?.effectiveSaleValue ?? Number(editingSale?.total);
    const fallbackTotal = rawFallbackTotal || 0;
    const effectiveTotal = realSaleVal !== null
      ? realSaleVal
      : (total > 0 ? total : fallbackTotal);
    const payments = normalizePayments(effectiveTotal, editData.paymentReceived, editData.paymentPending);
    const paymentStatus = determinePaymentStatus(effectiveTotal, payments.paymentReceived, payments.paymentPending);
    return {
      qty,
      cost,
      gain,
      total,
      realSaleVal,
      realProfit,
      effectiveTotal,
      payments,
      paymentStatus
    };
  }, [editData]);

  const getAvailableNumber = (product) => {
    if (!product) return null;
    const value = Number(product.available);
    return Number.isFinite(value) ? value : null;
  };

  const updateProductAvailability = async (product, available) => {
    if (!product || product.id === undefined) return;
    const safeAvailable = available < 0 ? 0 : available;
    const updated = { ...product, available: safeAvailable };
    await fetch(`/api/products/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
  };

  const showAlert = (message) => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    } else {
      console.warn(message);
    }
  };

  const saveEdit = async () => {
    if (!editingSale || !editData || !isEditValid) return;
    const productId = String(editData.productId);
    const qtyNum = Number(editData.quantity) || 0;
    const costNum = numberOrZero(editData.unitPrice);
    const gainNum = numberOrZero(editData.gananciaUnit);
    const totalComputed = Math.max(qtyNum * (costNum + gainNum), 0);
    const realSaleValueRaw = editData.realSaleValue === '' ? null : numberOrZero(editData.realSaleValue);
    const realSaleValue = realSaleValueRaw === null ? null : roundMoney(Math.max(realSaleValueRaw, 0));
    const effectiveTotal = getEditEffectiveTotal(editData);
    const payments = normalizePayments(effectiveTotal, editData.paymentReceived, editData.paymentPending);
    const paymentNotes = editData.paymentNotes && editData.paymentNotes.trim() ? editData.paymentNotes.trim() : null;

    const normalizeName = (n) => {
      if (!n) return null;
      const t = String(n).trim();
      if (!t) return null;
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    const oldProductId = String(editingSale.productId);
    const newProductId = productId;
    const oldQty = Number(editingSale.quantity) || 0;

    const oldProduct = products.find(p => String(p.id) === oldProductId);
    const newProduct = products.find(p => String(p.id) === newProductId);
    const oldAvailable = getAvailableNumber(oldProduct);
    const newAvailableCurrent = getAvailableNumber(newProduct);

    if (oldProductId === newProductId) {
      if (oldAvailable !== null) {
        const projectedAvailable = oldAvailable + oldQty - qtyNum;
        if (projectedAvailable < 0) {
          showAlert('No hay stock suficiente para la cantidad seleccionada.');
          return;
        }
      }
    } else {
      if (oldAvailable !== null) {
        const restoredAvailable = oldAvailable + oldQty;
        if (restoredAvailable < 0) {
          showAlert('Stock inválido al restaurar el producto original.');
          return;
        }
      }
      if (newAvailableCurrent !== null) {
        const projectedNew = newAvailableCurrent - qtyNum;
        if (projectedNew < 0) {
          showAlert('No hay stock suficiente para el producto seleccionado.');
          return;
        }
      }
    }

    const payload = {
      id: editingSale.id,
      productId: newProductId,
      quantity: qtyNum,
      date: editData.date,
      customerName: normalizeName(editData.customerName),
      unitPrice: costNum,
      gananciaUnit: gainNum,
      total: totalComputed,
      paymentMethod: editData.paymentMethod,
      realSaleValue,
      paymentReceived: payments.paymentReceived,
      paymentPending: payments.paymentPending,
      paymentNotes
    };

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/sales/${editingSale.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('No se pudo actualizar la venta');

      if (oldProductId === newProductId) {
        if (oldAvailable !== null) {
          const projectedAvailable = oldAvailable + oldQty - qtyNum;
          await updateProductAvailability(oldProduct, projectedAvailable);
        }
      } else {
        if (oldAvailable !== null) {
          const restoredAvailable = oldAvailable + oldQty;
          await updateProductAvailability(oldProduct, restoredAvailable);
        }
        if (newAvailableCurrent !== null) {
          const projectedNew = newAvailableCurrent - qtyNum;
          await updateProductAvailability(newProduct, projectedNew);
        }
      }

      await fetchAll();
      closeEdit();
    } catch (error) {
      console.error('Error al actualizar la venta:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  // Confirmación de borrado
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState(null);
  const openConfirm = (sale) => { setSaleToDelete(sale); setConfirmOpen(true); };
  const closeConfirm = () => { setSaleToDelete(null); setConfirmOpen(false); };

  const doDelete = async () => {
    const sale = saleToDelete;
    if (!sale?.id) return;
    try {
      const quantityNumber = Number(sale.quantity) || 0;
      const { financials, ...saleWithoutFinancials } = sale;
      const product = products.find(p => String(p.id) === String(sale.productId));
      const previousAvailable = product && typeof product.available === 'number'
        ? Number(product.available)
        : null;
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar la venta');
      if (product && previousAvailable !== null) {
        const updatedAvailable = previousAvailable + quantityNumber;
        const updated = { ...product, available: updatedAvailable };
        await fetch(`/api/products/${product.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
        });
        setProducts(prev => prev.map(p => (String(p.id) === String(product.id) ? updated : p)));
        setLastDeletedSale({ sale: saleWithoutFinancials, productSnapshot: { id: product.id, availableBefore: previousAvailable } });
      } else {
        setLastDeletedSale({ sale: saleWithoutFinancials, productSnapshot: null });
      }
      setSales(prev => prev.filter(s => s.id !== sale.id));
      if (editingSale && String(editingSale.id) === String(sale.id)) {
        closeEdit();
      }
      closeConfirm();
    } catch (err) {
      console.error(err);
    }
  };

  const undoDelete = async () => {
    if (!lastDeletedSale) return;
    try {
      const { sale, productSnapshot } = lastDeletedSale;
      const { product, financials, ...saleData } = sale;
      let res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData)
      });

      if (!res.ok) {
        const saleId = saleData.id || sale.id;
        res = await fetch(`/api/sales/${saleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saleData)
        });
        if (!res.ok) throw new Error('No se pudo restaurar la venta');
      }

      await res.json();

      if (productSnapshot) {
        const currentProduct = products.find(p => String(p.id) === String(productSnapshot.id));
        if (currentProduct) {
          const updatedProduct = { ...currentProduct, available: productSnapshot.availableBefore };
          await fetch(`/api/products/${currentProduct.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProduct)
          });
          setProducts(prev => prev.map(p => (String(p.id) === String(updatedProduct.id) ? updatedProduct : p)));
        }
      }

      await fetchAll();
      setLastDeletedSale(null);
    } catch (error) {
      console.error('Error al deshacer el borrado:', error);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Buscar por producto o cliente"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, flex: '1 1 240px' }}
        />
        <select value={method} onChange={e => setMethod(e.target.value)} style={{ padding: 8 }}>
          <option value="">Todos los medios</option>
          <option>Efectivo</option>
          <option>Transferencia</option>
          <option>Tarjeta</option>
          <option>Tarjeta de Regalo</option>
          <option>Otro</option>
        </select>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: 8 }} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: 8 }} />
        <select value={sortField} onChange={e => setSortField(e.target.value)} style={{ padding: 8 }}>
          <option value="date">Ordenar por fecha</option>
          <option value="name">Ordenar por nombre</option>
          <option value="price">Ordenar por precio</option>
        </select>
        <select value={sortDirection} onChange={e => setSortDirection(e.target.value)} style={{ padding: 8 }}>
          <option value="asc">Ascendente</option>
          <option value="desc">Descendente</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={undoDelete} disabled={!lastDeletedSale}>
          Deshacer borrado de venta
        </button>
      </div>

      <hr />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Fecha</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Producto</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Cant.</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Costo materiales</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Ganancia estimada (confección)</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Costo total producto</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Estado</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Valor venta real</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Pago recibido</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Pago pendiente</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Ganancia real</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Cliente</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Medio de pago</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Observaciones forma de pago</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(row => {
              const s = row.sale;
              const statusStyle = {
                color: paymentStatusColor(row.status),
                fontWeight: row.status === 'Pendiente de Pago' ? 600 : 500
              };
              const observations = s.paymentNotes && s.paymentNotes.trim() ? s.paymentNotes.trim() : '—';

              return (
                <tr
                  key={s.id}
                  onClick={() => openEdit(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Space') {
                      e.preventDefault();
                      openEdit(s);
                    }
                  }}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 8px' }}>{s.date}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {s.product?.image ? (
                        <img
                          src={s.product.image}
                          alt={s.product.name || `Producto ${s.productId}`}
                          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
                        />
                      ) : (
                        <div style={{ width: 64, height: 64, borderRadius: 6, border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666' }}>
                          Sin imagen
                        </div>
                      )}
                      <span>{s.product?.name || `#${s.productId}`}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{s.quantity}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{row.costMaterials ? `$${row.costMaterials.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{row.estimatedGain ? `$${row.estimatedGain.toFixed(2)}` : '$0.00'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>$ {row.costTotal.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={statusStyle}>{row.status}</span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{row.hasRealSale ? `$${row.realSaleDisplay.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{`$${row.paymentReceived.toFixed(2)}`}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{`$${row.paymentPending.toFixed(2)}`}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{row.realProfitDisplay !== null ? `$${row.realProfitDisplay.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px' }}>{capitalize(s.customerName) || '—'}</td>
                  <td style={{ padding: '12px 8px' }}>{s.paymentMethod || '—'}</td>
                  <td style={{ padding: '12px 8px' }}>{observations}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>
                Subtotales ({displayedRows.length} ventas)
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                ${roundMoney(saleTotals.realSaleValue).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                ${roundMoney(saleTotals.paymentReceived).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                ${roundMoney(saleTotals.paymentPending).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                ${roundMoney(saleTotals.realProfit).toFixed(2)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {editingSale && editData && (
        <>
          <div
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.45)', zIndex: 1500 }}
            onClick={requestCloseEdit}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fff',
              padding: 20,
              borderRadius: 8,
              width: '90%',
              maxWidth: 520,
              zIndex: 1501,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Modificar venta</h3>
            <form onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Producto</label>
                  <select
                    value={editData.productId}
                    onChange={handleEditFieldChange('productId')}
                    required
                    style={{ padding: 8 }}
                  >
                    {!editProductExists && editData.productId && (
                      <option value={editData.productId}>
                        {editingSale.product?.name || `#${editingSale.productId}`}
                      </option>
                    )}
                    {products.map(p => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name || `#${p.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={editData.quantity}
                    onChange={handleEditFieldChange('quantity')}
                    style={{ padding: 8 }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Costo materiales</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.unitPrice}
                    onChange={handleEditFieldChange('unitPrice')}
                    readOnly={isEditComposite}
                    style={{
                      padding: 8,
                      ...(isEditComposite ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {})
                    }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Ganancia estimada (confección)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.gananciaUnit}
                    onChange={handleEditFieldChange('gananciaUnit')}
                    readOnly={isEditComposite}
                    style={{
                      padding: 8,
                      ...(isEditComposite ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {})
                    }}
                  />
                </div>

                {isEditComposite && editCompositeBreakdown.length > 0 && (
                  <div
                    style={{
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      padding: 12,
                      display: 'grid',
                      gap: 8
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>Desglose por producto (valores unitarios)</div>
                    {editCompositeBreakdown.map((item, index) => (
                      <div
                        key={`${item.id ?? item.name ?? 'item'}-${index}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                      >
                        <span>{item.name || `Producto ${item.id}`}</span>
                        <span style={{ fontSize: 13, color: '#4b5563' }}>
                          Costo materiales: ${roundMoney(item.costMaterials).toFixed(2)} — Ganancia estimada: ${roundMoney(item.estimatedGain).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Valor venta real</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.realSaleValue}
                    onChange={handleEditFieldChange('realSaleValue')}
                    style={{ padding: 8 }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Pago recibido</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.paymentReceived ?? '0'}
                    onChange={handleEditPaymentReceivedChange}
                    style={{ padding: 8 }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Pago pendiente</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.paymentPending ?? '0'}
                    onChange={handleEditPaymentPendingChange}
                    style={{ padding: 8 }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Observaciones forma de pago</label>
                  <textarea
                    rows={2}
                    style={{ padding: 8, resize: 'vertical' }}
                    value={editData.paymentNotes || ''}
                    onChange={handleEditFieldChange('paymentNotes')}
                    placeholder="Notas sobre cobros, plazos, etc."
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Cliente</label>
                  <input
                    type="text"
                    value={editData.customerName}
                    onChange={handleEditFieldChange('customerName')}
                    style={{ padding: 8 }}
                    placeholder="Nombre del cliente"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={editData.date}
                    onChange={handleEditFieldChange('date')}
                    style={{ padding: 8 }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label>Medio de pago</label>
                  <select
                    value={editData.paymentMethod}
                    onChange={handleEditFieldChange('paymentMethod')}
                    style={{ padding: 8 }}
                    required
                  >
                    <option value="">Seleccione un medio</option>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Tarjeta</option>
                    <option>Tarjeta de Regalo</option>
                    <option>Otro</option>
                  </select>
                </div>

                <div style={{ background: '#f8f8f8', padding: 12, borderRadius: 6, display: 'grid', gap: 4 }}>
                  <div><strong>Costo total producto:</strong> ${editPreview ? editPreview.total.toFixed(2) : '0.00'}</div>
                  <div><strong>Valor venta real:</strong> {editPreview?.realSaleVal !== null
                    ? `$${editPreview.realSaleVal.toFixed(2)}`
                    : '—'}</div>
                  <div><strong>Ganancia real:</strong> {editPreview?.realProfit !== null
                    ? `$${editPreview.realProfit.toFixed(2)}`
                    : '—'}</div>
                  <div><strong>Pago recibido:</strong> ${editPreview ? editPreview.payments.paymentReceived.toFixed(2) : '0.00'}</div>
                  <div><strong>Pago pendiente:</strong> ${editPreview ? editPreview.payments.paymentPending.toFixed(2) : '0.00'}</div>
                  <div><strong>Estado del pago:</strong> <span style={{ color: paymentStatusColor(editPreview?.paymentStatus || 'Pagado') }}>{editPreview?.paymentStatus || 'Pagado'}</span></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (editDirty) {
                        const confirmDelete = (typeof window !== 'undefined' && typeof window.confirm === 'function')
                          ? window.confirm('Hay cambios sin guardar. ¿Querés descartarlos y borrar la venta?')
                          : true;
                        if (!confirmDelete) return;
                      }
                      openConfirm(editingSale);
                    }}
                    disabled={savingEdit}
                    style={{ background: '#e5e7eb', color: '#1f2937', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 4 }}
                  >
                    Borrar registro de venta
                  </button>
                  <button type="button" onClick={requestCloseEdit} disabled={savingEdit}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!editDirty || !isEditValid || savingEdit}
                  >
                    {savingEdit ? 'Guardando...' : 'Modificar registro de venta'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={{ marginRight: 8 }}>Mostrar:</label>
        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
        <span style={{ marginLeft: 8 }}>filas</span>
      </div>
      {/* Popup confirmación borrado */}
      {confirmOpen && (
        <>
          <div style={{ position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', zIndex: 1600 }} onClick={closeConfirm} />
          <div style={{ position: 'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'#fff', padding:20, borderRadius:8, zIndex: 1601, width:'90%', maxWidth:420 }}>
            <h3 style={{ marginTop: 0 }}>Confirmar borrado</h3>
            <p>¿Querés borrar la venta de <strong>{saleToDelete?.product?.name || `#${saleToDelete?.productId}`}</strong> del día {saleToDelete?.date}?</p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <button onClick={closeConfirm}>Cancelar</button>
              <button onClick={doDelete}>Borrar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SaleList;
