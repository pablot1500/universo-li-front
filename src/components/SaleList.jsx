

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { computeSaleFinancials, normalizePayments, determinePaymentStatus, roundMoney } from '../utils/salePayments';
import { buildProductMap, computeProductCostSummary } from '../utils/productCosting';
import { getAllProducts, getProductThumbnails } from '../services/productService';

const paymentStatusColor = (status) => {
  if (status === 'Pendiente de Pago') return '#b91c1c';
  if (status === 'Pago parcial') return '#f87171';
  return '#111827';
};

const DEFAULT_SALE_QUANTITY = 1;
const THUMBNAIL_BATCH_SIZE = 4;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 25, 50, 100, 150, 200];

const SaleList = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [lastDeletedSale, setLastDeletedSale] = useState(null);
  const requestedThumbnailIdsRef = useRef(new Set());

  // Filtros
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchAll = async () => {
    try {
      const [resSales, productsData] = await Promise.all([
        fetch('/api/sales'),
        getAllProducts()
      ]);
      if (resSales.ok) setSales(await resSales.json());
      requestedThumbnailIdsRef.current.clear();
      setProducts(productsData);
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

  const mergeProductThumbnails = useCallback((thumbnails = []) => {
    const thumbnailMap = new Map(
      thumbnails
        .filter(item => item?.id && item?.image)
        .map(item => [String(item.id), item])
    );
    if (!thumbnailMap.size) return;

    setProducts(prevProducts => prevProducts.map(product => {
      const thumbnail = thumbnailMap.get(String(product.id));
      if (!thumbnail) return product;
      return {
        ...product,
        image: thumbnail.image,
        posX: thumbnail.posX ?? product.posX,
        posY: thumbnail.posY ?? product.posY
      };
    }));
  }, []);

  const loadVisibleProductThumbnails = useCallback(async (visibleProducts = []) => {
    const ids = [];
    visibleProducts.forEach(product => {
      if (!product?.id || product.image) return;
      const id = String(product.id);
      if (requestedThumbnailIdsRef.current.has(id)) return;
      requestedThumbnailIdsRef.current.add(id);
      ids.push(id);
    });
    if (!ids.length) return;

    for (let index = 0; index < ids.length; index += THUMBNAIL_BATCH_SIZE) {
      const batch = ids.slice(index, index + THUMBNAIL_BATCH_SIZE);
      try {
        const thumbnails = await getProductThumbnails(batch);
        mergeProductThumbnails(thumbnails);
      } catch (error) {
        batch.forEach(id => requestedThumbnailIdsRef.current.delete(id));
        console.error('Error fetching sale product thumbnails:', error);
      }
    }
  }, [mergeProductThumbnails]);

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

  const [sortState, setSortState] = useState({ column: 'date', direction: 'desc' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingSale, setEditingSale] = useState(null);
  const [editData, setEditData] = useState(null);
  const [initialEditData, setInitialEditData] = useState(null);
  const [editDirty, setEditDirty] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const resolveQuantity = useCallback((rawValue, fallbackValue = editingSale?.quantity) => {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const fallback = Number(fallbackValue);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
    return DEFAULT_SALE_QUANTITY;
  }, [editingSale?.quantity]);

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
    const qty = resolveQuantity(data?.quantity);
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

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearch(value);
    if (value) {
      setMethod('');
      setStartDate('');
      setEndDate('');
    }
    setCurrentPage(1);
  };

  const handleMethodChange = (event) => {
    const value = event.target.value;
    setMethod(value);
    if (value) {
      setSearch('');
      setStartDate('');
      setEndDate('');
    }
    setCurrentPage(1);
  };

  const handleStartDateChange = (event) => {
    const value = event.target.value;
    setStartDate(value);
    if (value) {
      setSearch('');
      setMethod('');
    }
    setCurrentPage(1);
  };

  const handleEndDateChange = (event) => {
    const value = event.target.value;
    setEndDate(value);
    if (value) {
      setSearch('');
      setMethod('');
    }
    setCurrentPage(1);
  };

  const handlePageSizeChange = (event) => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed) && parsed > 0) {
      setPageSize(parsed);
    } else {
      setPageSize(10);
    }
    setCurrentPage(1);
  };

  const handleColumnSort = (columnKey) => {
    setSortState(prev => {
      if (prev.column === columnKey) {
        if (prev.direction === 'asc') return { column: columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { column: null, direction: 'default' };
        return { column: columnKey, direction: 'asc' };
      }
      return { column: columnKey, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  const handleHeaderKeyDown = (event, columnKey) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
      event.preventDefault();
      handleColumnSort(columnKey);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, method, startDate, endDate, pageSize]);

  const getRowData = useCallback((sale) => {
    const fin = sale.financials || computeSaleFinancials(sale);
    const costMaterials = Number.isFinite(fin.unitCost) ? fin.unitCost : 0;
    const estimatedGain = Number.isFinite(fin.estimatedGain) ? fin.estimatedGain : 0;
    const costTotal = fin.computedTotal > 0 ? fin.computedTotal : fin.fallbackTotal;
    const hasRealSale = fin.realSaleValue !== null && fin.realSaleValue !== undefined;
    const realSaleDisplay = hasRealSale ? fin.realSaleValue : null;
    const realSaleAmount = hasRealSale ? fin.realSaleValue : 0;
    const realProfitValue = hasRealSale ? realSaleAmount - costMaterials : 0;
    return {
      sale,
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
  }, []);

  const resolveSortValue = useCallback((row, columnKey) => {
    switch (columnKey) {
      case 'date': {
        if (!row.sale.date) return 0;
        const timestamp = new Date(row.sale.date).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
      }
      case 'product':
        return row.sale.product?.name?.toLowerCase() || '';
      case 'costMaterials':
        return Number.isFinite(row.costMaterials) ? row.costMaterials : 0;
      case 'estimatedGain':
        return Number.isFinite(row.estimatedGain) ? row.estimatedGain : 0;
      case 'costTotal':
        return Number.isFinite(row.costTotal) ? row.costTotal : 0;
      case 'status':
        return row.status?.toLowerCase() || '';
      case 'realSaleValue':
        return Number.isFinite(row.realSaleAmount) ? row.realSaleAmount : 0;
      case 'paymentReceived':
        return Number.isFinite(row.paymentReceived) ? row.paymentReceived : 0;
      case 'paymentPending':
        return Number.isFinite(row.paymentPending) ? row.paymentPending : 0;
      case 'realProfit':
        return Number.isFinite(row.realProfitValue) ? row.realProfitValue : 0;
      case 'customerName':
        return row.sale.customerName?.toLowerCase() || '';
      case 'paymentMethod':
        return row.sale.paymentMethod?.toLowerCase() || '';
      case 'paymentNotes':
        return row.sale.paymentNotes?.toLowerCase() || '';
      default:
        return 0;
    }
  }, []);

  const getSortIcon = useCallback((columnKey) => {
    if (sortState.column !== columnKey || sortState.direction === 'default') return null;
    return sortState.direction === 'asc' ? '↑' : '↓';
  }, [sortState]);

  const renderHeaderCell = (label, columnKey, align = 'left') => {
    const icon = getSortIcon(columnKey);
    const ariaSort = sortState.column === columnKey
      ? (sortState.direction === 'asc' ? 'ascending' : 'descending')
      : 'none';
    return (
      <th
        style={{
          textAlign: align,
          borderBottom: '1px solid #ddd',
          padding: '12px 8px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => handleColumnSort(columnKey)}
        onKeyDown={(event) => handleHeaderKeyDown(event, columnKey)}
        role="button"
        tabIndex={0}
        aria-sort={ariaSort}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {label}
          {icon ? <span>{icon}</span> : null}
        </span>
      </th>
    );
  };

  const filteredRows = useMemo(() => filtered.map(getRowData), [filtered, getRowData]);

  const sortedRows = useMemo(() => {
    const column = sortState.column || 'date';
    const direction = sortState.direction === 'default' ? 'desc' : sortState.direction;
    const directionFactor = direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const aValueRaw = resolveSortValue(a, column);
      const bValueRaw = resolveSortValue(b, column);

      if (typeof aValueRaw === 'string' || typeof bValueRaw === 'string') {
        const aValue = typeof aValueRaw === 'string' ? aValueRaw : '';
        const bValue = typeof bValueRaw === 'string' ? bValueRaw : '';
        const comparison = aValue.localeCompare(bValue);
        return comparison * directionFactor;
      }

      const aValueNum = Number(aValueRaw);
      const bValueNum = Number(bValueRaw);
      const aNumeric = Number.isFinite(aValueNum) ? aValueNum : 0;
      const bNumeric = Number.isFinite(bValueNum) ? bValueNum : 0;

      if (aNumeric < bNumeric) return -1 * directionFactor;
      if (aNumeric > bNumeric) return 1 * directionFactor;
      return 0;
    });
  }, [filteredRows, sortState, resolveSortValue]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  const handlePageChange = useCallback((targetPage) => {
    if (!Number.isFinite(targetPage)) return;
    const clamped = Math.min(Math.max(targetPage, 1), totalPages);
    setCurrentPage(clamped);
  }, [totalPages]);

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const safePage = Math.min(currentPage, totalPages);

  const displayedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return sortedRows.slice(startIndex, startIndex + pageSize);
  }, [sortedRows, safePage, pageSize]);

  useEffect(() => {
    loadVisibleProductThumbnails(displayedRows.map(row => row.sale.product).filter(Boolean));
  }, [displayedRows, loadVisibleProductThumbnails]);

  const firstItemIndex = sortedRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItemIndex = sortedRows.length === 0 ? 0 : firstItemIndex + displayedRows.length - 1;
  const totalItems = sortedRows.length;

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

  const subtotalLabelStyle = {
    display: 'block',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    color: '#4b5563',
    fontWeight: 500,
    marginBottom: 4
  };

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
    const unit = Number(editData.unitPrice);
    const gain = Number(editData.gananciaUnit);
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
    const costRaw = Number(editData.unitPrice);
    const gainRaw = Number(editData.gananciaUnit);
    const qty = resolveQuantity(editData.quantity);
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
  }, [editData, editingSale?.financials?.effectiveSaleValue, editingSale?.total, resolveQuantity]);

  const saveEdit = async () => {
    if (!editingSale || !editData || !isEditValid) return;
    const productId = String(editData.productId);
    const qtyNum = resolveQuantity(editData.quantity, editingSale.quantity);
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

    const payload = {
      id: editingSale.id,
      productId,
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
      const saleWithoutRuntimeFields = { ...sale };
      delete saleWithoutRuntimeFields.financials;
      delete saleWithoutRuntimeFields.product;
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar la venta');
      setLastDeletedSale({ sale: saleWithoutRuntimeFields });
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
      const { sale } = lastDeletedSale;
      const saleData = { ...sale };
      delete saleData.product;
      delete saleData.financials;
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
          onChange={handleSearchChange}
          style={{ padding: 8, flex: '1 1 240px' }}
        />
        <select value={method} onChange={handleMethodChange} style={{ padding: 8 }}>
          <option value="">Todos los medios</option>
          <option>Efectivo</option>
          <option>Transferencia</option>
          <option>Tarjeta</option>
          <option>Tarjeta de Regalo</option>
          <option>Otro</option>
        </select>
        <input type="date" value={startDate} onChange={handleStartDateChange} style={{ padding: 8 }} />
        <input type="date" value={endDate} onChange={handleEndDateChange} style={{ padding: 8 }} />
        <select value={pageSize} onChange={handlePageSizeChange} style={{ padding: 8 }}>
          {PAGE_SIZE_OPTIONS.map(option => (
            <option key={option} value={option}>{option} filas</option>
          ))}
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
              {renderHeaderCell('Fecha', 'date')}
              {renderHeaderCell('Producto', 'product')}
              {renderHeaderCell('Costo materiales', 'costMaterials', 'right')}
              {renderHeaderCell('Ganancia estimada (confección)', 'estimatedGain', 'right')}
              {renderHeaderCell('Costo total producto', 'costTotal', 'right')}
              {renderHeaderCell('Estado', 'status')}
              {renderHeaderCell('Valor venta real', 'realSaleValue', 'right')}
              {renderHeaderCell('Pago recibido', 'paymentReceived', 'right')}
              {renderHeaderCell('Pago pendiente', 'paymentPending', 'right')}
              {renderHeaderCell('Ganancia real', 'realProfit', 'right')}
              {renderHeaderCell('Cliente', 'customerName')}
              {renderHeaderCell('Medio de pago', 'paymentMethod')}
              {renderHeaderCell('Observaciones forma de pago', 'paymentNotes')}
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
              <td colSpan={6} style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>
                Subtotales ({displayedRows.length} ventas)
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                <span style={subtotalLabelStyle}>Valor venta real</span>
                ${roundMoney(saleTotals.realSaleValue).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                <span style={subtotalLabelStyle}>Pago recibido</span>
                ${roundMoney(saleTotals.paymentReceived).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                <span style={subtotalLabelStyle}>Pago pendiente</span>
                ${roundMoney(saleTotals.paymentPending).toFixed(2)}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>
                <span style={subtotalLabelStyle}>Ganancia real</span>
                ${roundMoney(saleTotals.realProfit).toFixed(2)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginTop: 16
        }}
      >
        <span style={{ fontSize: 14, color: '#4b5563' }}>
          {totalItems === 0
            ? 'No hay ventas para mostrar'
            : `Mostrando ${firstItemIndex} - ${lastItemIndex} de ${totalItems} ventas`}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => handlePageChange(safePage - 1)} disabled={safePage <= 1}>
            Anterior
          </button>

          {pageNumbers.map(number => (
            <button
              key={number}
              onClick={() => handlePageChange(number)}
              style={{
                minWidth: 36,
                padding: '4px 8px',
                borderRadius: 4,
                border: number === safePage ? '1px solid #111827' : '1px solid #d1d5db',
                backgroundColor: number === safePage ? '#111827' : '#fff',
                color: number === safePage ? '#fff' : '#111827',
                fontWeight: number === safePage ? 600 : 500
              }}
              aria-current={number === safePage ? 'page' : undefined}
            >
              {number}
            </button>
          ))}

          <button onClick={() => handlePageChange(safePage + 1)} disabled={safePage >= totalPages}>
            Siguiente
          </button>
        </div>
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
        <select value={pageSize} onChange={handlePageSizeChange}>
          {PAGE_SIZE_OPTIONS.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
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
