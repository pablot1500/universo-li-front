import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ProductForm from '../components/ProductForm';
import ProductList from '../components/ProductList';

const DEFAULT_PRICE_ADJUSTMENTS = Object.freeze([
  { name: 'Inflación', percent: 2 },
  { name: 'Con cuenta DNI', percent: 2 },
  { name: 'En dos veces', percent: 15 },
  { name: 'Con transferencia', percent: 15 }
]);

const normalizeAdjustmentKey = (value) => (value || '')
  .toString()
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '')
  .toLowerCase();

const RENAME_ADJUSTMENTS = {
  ctadni: 'Con cuenta DNI',
  endosveces: 'En dos veces',
  transferencia: 'Con transferencia'
};

const REMOVED_ADJUSTMENTS = new Set(['efectivo']);

const cloneDefaultAdjustments = () => DEFAULT_PRICE_ADJUSTMENTS.map(item => ({ ...item }));

const hasLegacyAdjustmentNames = (adjustments = []) => {
  return adjustments.some(item => {
    const key = normalizeAdjustmentKey(item?.name);
    return Boolean(RENAME_ADJUSTMENTS[key]) || REMOVED_ADJUSTMENTS.has(key) || !item?.name;
  });
};

const hasLegacyModifiers = (modifiers) => {
  if (!modifiers || typeof modifiers !== 'object') return false;
  return Object.keys(modifiers).some(name => {
    const key = normalizeAdjustmentKey(name);
    return Boolean(RENAME_ADJUSTMENTS[key]) || REMOVED_ADJUSTMENTS.has(key);
  });
};

const shouldEnsureDefaultAdjustments = (adjustments, modifiers) => {
  if (!Array.isArray(adjustments) || adjustments.length === 0) return true;
  if (hasLegacyAdjustmentNames(adjustments)) return true;
  if (hasLegacyModifiers(modifiers)) return true;
  return false;
};

const normalizePriceAdjustments = (list = [], { ensureDefaults = false } = {}) => {
  const normalized = [];
  const seen = new Set();

  list.forEach(item => {
    if (!item) return;
    const rawName = typeof item.name === 'string' ? item.name : '';
    const rawKey = normalizeAdjustmentKey(rawName);
    if (!rawName && !Number.isFinite(Number(item.percent))) return;
    if (REMOVED_ADJUSTMENTS.has(rawKey)) return;

    const renamed = RENAME_ADJUSTMENTS[rawKey];
    const finalName = (renamed || rawName || '').trim();
    if (!finalName) return;

    const finalKey = normalizeAdjustmentKey(finalName);
    if (REMOVED_ADJUSTMENTS.has(finalKey) || seen.has(finalKey)) return;

    let percent = Number(item.percent);
    const defaultTemplate = DEFAULT_PRICE_ADJUSTMENTS.find(tpl => normalizeAdjustmentKey(tpl.name) === finalKey);
    const renamedFromAlias = Boolean(renamed);
    if (!Number.isFinite(percent)) percent = defaultTemplate?.percent ?? 0;
    if (renamedFromAlias && defaultTemplate) {
      percent = defaultTemplate.percent;
    }

    normalized.push({ name: finalName, percent: Number.isFinite(percent) ? percent : 0 });
    seen.add(finalKey);
  });

  if (!ensureDefaults) {
    return normalized;
  }

  const defaultOrder = DEFAULT_PRICE_ADJUSTMENTS.map(item => normalizeAdjustmentKey(item.name));

  DEFAULT_PRICE_ADJUSTMENTS.forEach(template => {
    const key = normalizeAdjustmentKey(template.name);
    if (!seen.has(key)) {
      normalized.push({ ...template });
      seen.add(key);
    }
  });

  const partitioned = normalized.reduce((acc, item) => {
    const key = normalizeAdjustmentKey(item.name);
    const idx = defaultOrder.indexOf(key);
    if (idx === -1) {
      acc.custom.push(item);
    } else {
      if (!acc.defaults[idx]) acc.defaults[idx] = item;
      else acc.custom.push(item);
    }
    return acc;
  }, { defaults: Array(defaultOrder.length).fill(null), custom: [] });

  const orderedDefaults = partitioned.defaults.filter(Boolean);
  return [...orderedDefaults, ...partitioned.custom];
};

const buildModifiersFromAdjustments = (adjustments = []) => {
  return adjustments.reduce((acc, item) => {
    const key = (item?.name || '').trim();
    if (!key) return acc;
    const percent = Number(item?.percent);
    acc[key] = Number.isFinite(percent) ? Number((percent / 100).toFixed(4)) : 0;
    return acc;
  }, {});
};

const round2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
};

const fmt2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '';
};

const norm = (s) => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isConfeccionName = (name) => norm(name).includes('confeccion');

const cloneDetailProduct = (product) => (product ? JSON.parse(JSON.stringify(product)) : null);

const ProductsPage = () => {
  const [refresh, setRefresh] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailClosing, setDetailClosing] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [showProductComments, setShowProductComments] = useState(false);
  const [productComment, setProductComment] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const HISTORY_LIMIT = 50;
  const detailHistoryRef = useRef([]);
  const isUndoingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmUnsavedOpen, setConfirmUnsavedOpen] = useState(false);

  const statusMessage = saveError
    ? 'No se pudo guardar automáticamente. Intentá de nuevo.'
    : isSaving
      ? 'Guardando cambios...'
      : lastSavedAt
        ? `Último guardado ${new Date(lastSavedAt).toLocaleTimeString()}`
        : (isDirty ? 'Cambios detectados' : 'Todavía no se detectó ningún cambio');

  const statusVariant = saveError ? 'error' : (isSaving ? 'saving' : (isDirty ? 'dirty' : 'idle'));
  const showStatusBubble = showDetailModal;

  // Prevenir recarga/cierre con cambios sin aplicar
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    if (isDirty) window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // Listas de componentes disponibles para dropdowns
  const [telaComponents, setTelaComponents] = useState([]);
  const [otherComponents, setOtherComponents] = useState([]);

  // Helpers
  const cap = (s) => (typeof s === 'string' && s.length) ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  // Maps por id para acceso rápido a nombres
  const telaById = useMemo(() => Object.fromEntries((telaComponents || []).map(c => [c.id, c])), [telaComponents]);
  const otherById = useMemo(() => Object.fromEntries((otherComponents || []).map(c => [c.id, c])), [otherComponents]);

  // Selector de componentes (popup)
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorMode, setSelectorMode] = useState(null); // 'tela' | 'otro'
  const [selectorIndex, setSelectorIndex] = useState(null);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [draggingTelaIndex, setDraggingTelaIndex] = useState(null);
  const [draggingOtroIndex, setDraggingOtroIndex] = useState(null);
  const [selectorHighlight, setSelectorHighlight] = useState(-1);
  const selectorInputRef = useRef(null);
  const selectorListRef = useRef(null);
  const selectorOptionRefs = useRef([]);
  const selectorAllowExitRef = useRef(false);
  const latestDetailRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const pendingSaveRef = useRef(false);
  const detailUpdatedRef = useRef(false);

  const selectorOptions = useMemo(() => {
    if (!selectorOpen) return [];
    const pool = selectorMode === 'tela' ? telaComponents : otherComponents;
    return (pool || [])
      .slice()
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
      .filter(c => (c?.name || '').toLowerCase().includes(selectorSearch.toLowerCase()));
  }, [selectorOpen, selectorMode, telaComponents, otherComponents, selectorSearch]);
  selectorOptionRefs.current = selectorOptionRefs.current.slice(0, selectorOptions.length);

  // Responsive: detectar mobile (iPhone vertical) para rediseñar la vista de detalle
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactDesktop, setIsCompactDesktop] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const width = typeof window !== 'undefined' ? window.innerWidth : 0;
        const mobile = width <= 640;
        setIsMobile(mobile);
        setIsCompactDesktop(!mobile && width <= 1600);
      } catch {
        setIsMobile(false);
        setIsCompactDesktop(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch de componentes (Telas y Otros)
  useEffect(() => {
    const fetchTelas = async () => {
      try {
        // Trae todos y filtra case-insensitive por categoría 'telas'
        const res = await fetch('/api/components');
        if (res.ok) {
          const data = await res.json();
          const telas = (data || []).filter(c => (c.category || '').toLowerCase() === 'telas');
          setTelaComponents(telas);
        }
      } catch (err) {
        console.error('Error fetching tela components:', err);
      }
    };
    const fetchOtros = async () => {
      try {
        const res = await fetch('/api/components');
        if (res.ok) {
          const data = await res.json();
          setOtherComponents((data || []).filter(c => (c.category || '').toLowerCase() !== 'telas'));
        }
      } catch (err) {
        console.error('Error fetching other components:', err);
      }
    };
    fetchTelas();
    fetchOtros();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      try {
        const y = typeof window !== 'undefined' ? window.scrollY : 0;
        setShowScrollTop(y > 320);
      } catch {
        setShowScrollTop(false);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);


  useEffect(() => {
    if (selectorOpen) {
      setSelectorHighlight(-1);
      selectorOptionRefs.current = [];
      selectorAllowExitRef.current = false;
      // focus input after render so user puede filtrar directamente
      setTimeout(() => {
        selectorInputRef.current?.focus({ preventScroll: true });
        selectorInputRef.current?.select?.();
      }, 0);
    } else {
      setSelectorHighlight(-1);
      selectorAllowExitRef.current = false;
    }
  }, [selectorOpen, selectorMode]);

  useEffect(() => {
    if (!selectorOpen) return;
    setSelectorHighlight(-1);
    selectorAllowExitRef.current = false;
  }, [selectorSearch, selectorOpen]);

  useEffect(() => {
    if (!selectorOpen) return;
    if (selectorHighlight >= selectorOptions.length) {
      setSelectorHighlight(selectorOptions.length ? selectorOptions.length - 1 : -1);
    }
  }, [selectorHighlight, selectorOptions.length, selectorOpen]);

  useEffect(() => {
    if (!selectorOpen) return;
    if (selectorHighlight >= 0) {
      selectorAllowExitRef.current = false;
      selectorListRef.current?.focus({ preventScroll: true });
      const el = selectorOptionRefs.current?.[selectorHighlight];
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ block: 'nearest' });
      }
    } else {
      selectorInputRef.current?.focus({ preventScroll: true });
    }
  }, [selectorHighlight, selectorOpen]);

  // Inline styles for modal and FAB
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(2px)',
    zIndex: 1000,
  };
  const detailModalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    // padding simétrico en mobile/desktop con espacio extra inferior
    padding: isMobile ? '12px 12px 40px' : '20px 20px 40px',
    // paddingLeft: '40px',  <-- removed this line
    borderRadius: '8px',
    zIndex: 1001,
    width: isMobile ? '96%' : '95%',
    maxWidth: isMobile ? '96%' : '95%',
    maxHeight: '85vh',
    overflowY: 'auto',
    boxSizing: 'border-box'
  };
  const addModalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    zIndex: 1001,
    width: '80%',
    maxWidth: '500px',
  };
  // Animaciones para popups (detalle y alta/edición)
  const detailModalAnimStyle = {
    ...detailModalStyle,
    opacity: detailClosing ? 0 : 1,
    transform: `${detailModalStyle.transform} ${detailClosing ? 'scale(0.98)' : 'scale(1)'}`,
    transition: 'opacity 180ms ease, transform 180ms ease'
  };
  const overlayFade = (closing) => ({
    ...overlayStyle,
    opacity: closing ? 0 : 1,
    transition: 'opacity 180ms ease'
  });
  const [addClosing, setAddClosing] = useState(false);
  const doCloseDetailModal = () => {
    setDetailClosing(true);
    setTimeout(() => {
      setShowDetailModal(false);
      setDetailClosing(false);
      detailHistoryRef.current = [];
      setCanUndo(false);
      isUndoingRef.current = false;
      setIsDirty(false);
    }, 180);
  };
  const requestCloseDetailModal = () => {
    if (isDirty) {
      setConfirmUnsavedOpen(true);
    } else {
      doCloseDetailModal();
    }
  };
  const closeAddModal = () => { setAddClosing(true); setTimeout(() => { setShowModal(false); setAddClosing(false); }, 180); };
  const commentModalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    zIndex: 1002,
    width: '80%',
    maxWidth: '600px',
  };
  const commentOverlayStyle = { ...overlayStyle, zIndex: 1001 };
  const selectorOverlayStyle = { ...overlayStyle, zIndex: 1100 };
  const selectorModalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    zIndex: 1101,
    width: '80%',
    maxWidth: '720px',
    maxHeight: '70vh',
    overflowY: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
  };
  const closeButtonStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
  };
  const fabStyle = {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'rgba(248,168,201,0.7)',
    color: '#fff',
    fontSize: '36px',
    border: 'none',
    cursor: 'pointer',
    zIndex: 1601,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const scrollTopButtonStyle = {
    ...fabStyle,
    bottom: '90px',
    transition: 'opacity 0.25s ease, transform 0.25s ease'
  };

  const handleOpenAdd = () => {
    setModalMode('add');
    setSelectedProduct(null);
    setShowModal(true);
  };
  const handleEditProduct = (product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    setShowModal(true);
  };
  const handleCopyProduct = (product) => {
    setModalMode('copy');
    setSelectedProduct(product);
    setShowModal(true);
  };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const handleDeleteProduct = (product) => {
    setProductToDelete(product);
    setConfirmOpen(true);
  };
  const doDeleteProduct = async () => {
    if (!productToDelete?.id) return;
    await fetch(`/api/products/${productToDelete.id}`, { method: 'DELETE' });
    setConfirmOpen(false);
    setProductToDelete(null);
    setRefresh(prev => prev + 1);
  };
  const handleProductSubmit = async (data) => {
    if (modalMode === 'edit') {
      const baseEdit = selectedProduct ? JSON.parse(JSON.stringify(selectedProduct)) : {};
      const payload = {
        ...baseEdit,
        ...data,
      };
      if (!payload.componentes) {
        payload.componentes = { telas: [], otros: [] };
      }
      if (!payload.priceAdjustments) {
        payload.priceAdjustments = [];
      }
      const ensureDefaults = shouldEnsureDefaultAdjustments(payload.priceAdjustments, payload?.pricing?.modificadores || payload?.modificadores);
      payload.priceAdjustments = normalizePriceAdjustments(payload.priceAdjustments, { ensureDefaults });
      payload.defaultsMigrated = true;
      const modifiersObj = buildModifiersFromAdjustments(payload.priceAdjustments);
      const existingPricing = payload.pricing && typeof payload.pricing === 'object' ? payload.pricing : {};
      payload.pricing = { ...existingPricing, modificadores: modifiersObj };
      payload.modificadores = modifiersObj;
      await fetch(`/api/products/${selectedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else if (modalMode === 'copy') {
      const baseCopy = selectedProduct ? JSON.parse(JSON.stringify(selectedProduct)) : {};
      const payload = {
        ...baseCopy,
        name: data.name,
        category: data.category,
        available: data.available,
      };
      delete payload.id;
      if (!payload.componentes) {
        payload.componentes = { telas: [], otros: [] };
      }
      if (!payload.priceAdjustments) {
        payload.priceAdjustments = [];
      }
      const ensureDefaults = shouldEnsureDefaultAdjustments(payload.priceAdjustments, payload?.pricing?.modificadores || payload?.modificadores);
      payload.priceAdjustments = normalizePriceAdjustments(payload.priceAdjustments, { ensureDefaults });
      payload.defaultsMigrated = true;
      const modifiersObj = buildModifiersFromAdjustments(payload.priceAdjustments);
      const existingPricing = payload.pricing && typeof payload.pricing === 'object' ? payload.pricing : {};
      payload.pricing = { ...existingPricing, modificadores: modifiersObj };
      payload.modificadores = modifiersObj;
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      const priceAdjustments = normalizePriceAdjustments(cloneDefaultAdjustments(), { ensureDefaults: true });
      const modifiersObj = buildModifiersFromAdjustments(priceAdjustments);
      const payload = {
        ...data,
        componentes: { telas: [], otros: [] },
        priceAdjustments,
        pricing: { modificadores: modifiersObj },
        modificadores: modifiersObj,
        defaultsMigrated: true
      };
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    setRefresh(prev => prev + 1);
    setShowModal(false);
  };

  const handleSelectProduct = async (product) => {
    const base = {
      componentes: { telas: [], otros: [] },
      costoConfeccion: 0,
    };
    setSaveError(null);
    setLastSavedAt(null);
    detailHistoryRef.current = [];
    setCanUndo(false);
    isUndoingRef.current = false;
    detailUpdatedRef.current = false;
    // Intentar traer la versión más reciente del producto desde la API
    let freshProduct = product;
    try {
      if (product?.id) {
        const res = await fetch(`/api/products/${product.id}`);
        if (res.ok) {
          freshProduct = await res.json();
        }
      }
    } catch {}
    const productData = freshProduct || product || {};

    // Traer componentes actualizados para recalcular precios efectivos
    let latestTelas = null;
    let latestOtros = null;
    try {
      const res = await fetch('/api/components');
      if (res.ok) {
        const data = await res.json();
        latestTelas = (data || []).filter(c => (c.category || '').toLowerCase() === 'telas');
        latestOtros = (data || []).filter(c => (c.category || '').toLowerCase() !== 'telas');
        setTelaComponents(latestTelas);
        setOtherComponents(latestOtros);
      }
    } catch {}

    // Normaliza estructura mínima para evitar errores
    // Construye ajustes a partir de priceAdjustments y pricing.modificadores
    const existingAdjustments = Array.isArray(productData?.priceAdjustments) ? productData.priceAdjustments : [];
    const rawModifiers = (productData?.pricing && productData.pricing.modificadores) || productData?.modificadores || null;
    const modifierAdjustments = rawModifiers && typeof rawModifiers === 'object'
      ? Object.entries(rawModifiers).map(([name, frac]) => ({
          name,
          percent: Number(isFinite(frac) ? (frac * 100).toFixed(2) : 0)
        }))
      : [];
    // Merge por nombre (case-insensitive), prioriza existentes
    const mergedByName = new Map();
    existingAdjustments.forEach(a => mergedByName.set(String(a.name || '').toLowerCase(), { name: a.name || '', percent: Number(a.percent) || 0 }));
    modifierAdjustments.forEach(a => {
      const key = String(a.name || '').toLowerCase();
      if (!mergedByName.has(key)) mergedByName.set(key, a);
    });
    const mergedAdjustments = Array.from(mergedByName.values());
    const ensureDefaults = shouldEnsureDefaultAdjustments(mergedAdjustments, rawModifiers) && !productData?.defaultsMigrated;
    const normalizedAdjustments = normalizePriceAdjustments(mergedAdjustments, { ensureDefaults });
    const finalAdjustments = (normalizedAdjustments.length > 0)
      ? normalizedAdjustments
      : (ensureDefaults ? cloneDefaultAdjustments() : []);
    const modifiersObj = buildModifiersFromAdjustments(finalAdjustments);

    // Recalcular precios de filas (telas/otros) con precios/divisor actuales
    const telasRaw = productData?.componentes?.telas ? [...productData.componentes.telas] : [];
    const otrosRaw = productData?.componentes?.otros ? [...productData.componentes.otros] : [];
    const telasRecalc = telasRaw.map(t => {
      if (!t?.componentId) return { ...t };
      const comp = (latestTelas || telaComponents || []).find(c => c.id === t.componentId);
      if (!comp) return { ...t };
      const divisor = Number(comp?.unitDivisor) > 0 ? Number(comp.unitDivisor) : 1;
      const basePrice = Number(comp?.price) || 0;
      const precioPorMetro = round2(basePrice / (divisor || 1));
      const next = { ...t, precioPorMetro };
      if (next.precioPorMetro && next.anchoTelaCm) {
        next.valorCm2 = round2(next.precioPorMetro / next.anchoTelaCm);
      }
      if (next.anchoCm && next.largoCm) {
        next.materialPuroCm2 = round2((next.anchoCm * next.largoCm) / 100);
      }
      if (next.materialPuroCm2 != null && next.porcentajeDesperdicio != null) {
        next.totalMaterialCm2 = round2(next.materialPuroCm2 * (1 + next.porcentajeDesperdicio / 100));
      }
      if (next.totalMaterialCm2 != null && next.valorCm2 != null) {
        next.costoMaterial = round2(next.totalMaterialCm2 * next.valorCm2);
      }
      return next;
    });
    const otrosRecalc = otrosRaw.map(o => {
      if (!o?.componentId) return { ...o };
      const comp = (latestOtros || otherComponents || []).find(c => c.id === o.componentId);
      if (!comp) return { ...o };
      const divisor = Number(comp?.unitDivisor) > 0 ? Number(comp.unitDivisor) : 1;
      const basePrice = Number(comp?.price) || 0;
      const precioUnitario = round2(basePrice / (divisor || 1));
      return { ...o, precioUnitario };
    });

    const normalized = {
      ...productData,
      componentes: {
        telas: telasRecalc,
        otros: otrosRecalc,
      },
      priceAdjustments: finalAdjustments,
      pricing: {
        ...(productData?.pricing && typeof productData.pricing === 'object' ? productData.pricing : {}),
        modificadores: modifiersObj
      },
      modificadores: modifiersObj,
      defaultsMigrated: productData?.defaultsMigrated || ensureDefaults
    };
    setDetailProduct({ ...base, ...normalized });
    setShowDetailModal(true);
  };

  const openProductComments = () => {
    setProductComment(detailProduct?.comment || '');
    setShowProductComments(true);
  };
  const closeProductComments = () => setShowProductComments(false);
  const saveProductComments = async () => {
    if (!detailProduct?.id) return;
    try {
      const payload = { ...detailProduct, comment: productComment };
      await fetch(`/api/products/${detailProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setDetailProduct(payload);
      setShowProductComments(false);
      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error('Error guardando comentario del producto:', err);
    }
  };

  const buildPersistPayload = useCallback((product) => {
    if (!product) return null;
    const telas = (product.componentes?.telas || []).filter(t => t.componentId);
    const otrosRaw = product.componentes?.otros || [];
    const otrosRows = otrosRaw.map(o => {
      const compName = otherById[o.componentId]?.name;
      const isConf = isConfeccionName(compName);
      const unidades = Number(o.unidades) || 0;
      const precio = Number(o.precioUnitario) || 0;
      return { ref: o, isConf, total: unidades * precio };
    });
    const otrosConfeccionTotal = otrosRows.filter(r => r.isConf).reduce((acc, r) => acc + r.total, 0);
    const hasConfeccion = otrosRows.some(r => r.isConf);
    const costoConfeccionValue = hasConfeccion
      ? round2(otrosConfeccionTotal)
      : (Number(product?.costoConfeccion) || 0);

    const sanitizedAdjustments = normalizePriceAdjustments(product?.priceAdjustments || []);
    const modifiersObj = buildModifiersFromAdjustments(sanitizedAdjustments);

    return {
      ...product,
      componentes: {
        ...product.componentes,
        telas,
        otros: otrosRaw
          .filter(o => o.componentId)
          .map(o => ({
            ...o,
            tagConfeccion: isConfeccionName(otherById[o.componentId]?.name)
          }))
      },
      priceAdjustments: sanitizedAdjustments.map(a => ({
        name: a.name,
        percent: round2(Number(a.percent))
      })),
      pricing: {
        ...(product?.pricing || {}),
        modificadores: modifiersObj
      },
      costoConfeccion: costoConfeccionValue,
      modificadores: modifiersObj,
      defaultsMigrated: true
    };
  }, [otherById, isConfeccionName]);

  const persistDetail = useCallback(async () => {
    const current = latestDetailRef.current;
    if (!current?.id) return;
    const payload = buildPersistPayload(current);
    if (!payload) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingSaveRef.current = false;
    setIsSaving(true);
    setSaveError(null);
    try {
      await fetch(`/api/products/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      detailUpdatedRef.current = true;
      setDetailProduct(prev => {
        if (!prev) return prev;
        if (prev.id !== current.id) return prev;
        return {
          ...prev,
          pricing: {
            ...(prev.pricing || {}),
            modificadores: payload.pricing.modificadores
          },
          modificadores: payload.modificadores,
          defaultsMigrated: true
        };
      });
      setLastSavedAt(Date.now());
      setIsDirty(false);
    } catch (err) {
      console.error('Error auto-guardando detalle:', err);
      setSaveError(err);
    } finally {
      setIsSaving(false);
    }
  }, [buildPersistPayload]);

  const schedulePersist = useCallback(() => {
    if (!latestDetailRef.current?.id) return;
    setSaveError(null);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    pendingSaveRef.current = true;
    autosaveTimerRef.current = setTimeout(() => {
      persistDetail();
    }, 800);
  }, [persistDetail]);

  const withHistory = useCallback((updateFn, options = {}) => {
    let snapshot = null;
    let changed = false;
    setDetailProduct(prev => {
      if (!prev) return prev;
      const next = updateFn(prev);
      if (!next || next === prev) return prev;
      changed = true;
      if (!isUndoingRef.current) {
        snapshot = cloneDetailProduct(prev);
      }
      return next;
    });
    if (!changed) return;
    if (snapshot) {
      detailHistoryRef.current.push(snapshot);
      if (detailHistoryRef.current.length > HISTORY_LIMIT) {
        detailHistoryRef.current.shift();
      }
      setCanUndo(true);
    }
    setIsDirty(true);
  }, [schedulePersist]);

  const handleUndo = useCallback(() => {
    if (!canUndo || detailHistoryRef.current.length === 0) return;
    const snapshot = detailHistoryRef.current.pop();
    if (!snapshot) return;
    isUndoingRef.current = true;
    setDetailProduct(snapshot);
    isUndoingRef.current = false;
    if (detailHistoryRef.current.length === 0) {
      setCanUndo(false);
    }
    schedulePersist();
  }, [canUndo, schedulePersist]);

  useEffect(() => {
    latestDetailRef.current = detailProduct;
  }, [detailProduct]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        persistDetail();
      }
    };
  }, [persistDetail]);

  useEffect(() => {
    if (!showDetailModal && pendingSaveRef.current) {
      pendingSaveRef.current = false;
      persistDetail();
    }
  }, [showDetailModal, persistDetail]);

  useEffect(() => {
    if (showDetailModal) return;
    if (pendingSaveRef.current) return;
    if (!detailUpdatedRef.current) return;
    if (isSaving) return;
    // El detalle guardó cambios que ya fueron persistidos, refrescamos la lista para reflejar nuevos precios
    detailUpdatedRef.current = false;
    setRefresh(prev => prev + 1);
  }, [showDetailModal, isSaving]);

  const reorderItems = (list = [], fromIdx, toIdx) => {
    if (fromIdx == null || toIdx == null || fromIdx === toIdx) return list;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx > list.length) return list;
    const next = list.slice();
    const [moved] = next.splice(fromIdx, 1);
    const insertIndex = fromIdx < toIdx ? Math.max(0, toIdx - 1) : toIdx;
    next.splice(insertIndex, 0, moved);
    return next;
  };

  const handleTelaReorder = (toIndex) => {
    withHistory(prev => {
      const telas = prev.componentes?.telas || [];
      const reordered = reorderItems(telas, draggingTelaIndex, toIndex);
      if (reordered === telas) return prev;
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          telas: reordered
        }
      };
    });
    setDraggingTelaIndex(null);
  };

  const handleOtroReorder = (toIndex) => {
    withHistory(prev => {
      const otros = prev.componentes?.otros || [];
      const reordered = reorderItems(otros, draggingOtroIndex, toIndex);
      if (reordered === otros) return prev;
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          otros: reordered
        }
      };
    });
    setDraggingOtroIndex(null);
  };

  const sortTelasAlphabetically = () => {
    withHistory(prev => {
      const telas = (prev.componentes?.telas || []).slice();
      telas.sort((a, b) => {
        const nameA = a?.componentId ? norm(telaById[a.componentId]?.name || '') : 'zzzz';
        const nameB = b?.componentId ? norm(telaById[b.componentId]?.name || '') : 'zzzz';
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          telas
        }
      };
    });
  };

  const sortOtrosAlphabetically = () => {
    withHistory(prev => {
      const otros = (prev.componentes?.otros || []).slice();
      otros.sort((a, b) => {
        const nameA = a?.componentId ? norm(otherById[a.componentId]?.name || '') : 'zzzz';
        const nameB = b?.componentId ? norm(otherById[b.componentId]?.name || '') : 'zzzz';
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          otros
        }
      };
    });
  };

  function applySelectorOption(component) {
    if (!component) return;
    if (selectorMode === 'tela') {
      handleTelaChange(selectorIndex, 'componentId', component.id);
    } else {
      handleOtroChange(selectorIndex, 'componentId', component.id);
    }
    closeSelector();
  }

  const handleSelectorKeyDown = (event) => {
    if (!selectorOpen) return;
    const { key, shiftKey } = event;
    if (key === 'Tab') {
      const inputEl = selectorInputRef.current;
      const activeEl = document.activeElement;
      if (shiftKey) {
        if (selectorHighlight > 0) {
          event.preventDefault();
          setSelectorHighlight(prev => Math.max(0, prev - 1));
        } else if (selectorHighlight === 0) {
          event.preventDefault();
          setSelectorHighlight(-1);
          selectorAllowExitRef.current = false;
        }
      } else {
        if (selectorHighlight === -1) {
          if (activeEl !== inputEl) {
            event.preventDefault();
            inputEl?.focus({ preventScroll: true });
            inputEl?.select?.();
          } else if (selectorOptions.length > 0) {
            if (selectorAllowExitRef.current) {
              selectorAllowExitRef.current = false;
              return; // Permite continuar al siguiente enfoque
            }
            event.preventDefault();
            setSelectorHighlight(0);
          }
        } else {
          event.preventDefault();
          if (selectorHighlight < selectorOptions.length - 1) {
            setSelectorHighlight(prev => prev + 1);
          } else {
            setSelectorHighlight(-1);
            selectorAllowExitRef.current = true;
          }
        }
      }
    } else if (key === 'Enter') {
      if (selectorHighlight >= 0 && selectorOptions[selectorHighlight]) {
        event.preventDefault();
        applySelectorOption(selectorOptions[selectorHighlight]);
      }
    }
  };

  // Handler to update tela fields and compute dependent values
  const handleTelaChange = (idx, field, value) => {
    withHistory(prev => {
      const newTelas = [...(prev.componentes?.telas || [])];
      if (!newTelas[idx]) return prev;
      const numericFields = ['anchoTelaCm', 'anchoCm', 'largoCm', 'porcentajeDesperdicio'];
      const newValue = numericFields.includes(field)
        ? (Number.isFinite(value) ? round2(value) : null)
        : value;
      const tela = { ...newTelas[idx], [field]: newValue };
      if (field === 'componentId') {
        const comp = telaComponents.find(c => c.id === value);
        const divisor = Number(comp?.unitDivisor) > 0 ? Number(comp.unitDivisor) : 1;
        const basePrice = Number(comp?.price) || 0;
        tela.precioPorMetro = round2(basePrice / (divisor || 1));
      }
      if (tela.precioPorMetro && tela.anchoTelaCm) {
        tela.valorCm2 = round2(tela.precioPorMetro / tela.anchoTelaCm);
      }
      if (tela.anchoCm && tela.largoCm) {
        tela.materialPuroCm2 = round2((tela.anchoCm * tela.largoCm) / 100);
      }
      if (tela.materialPuroCm2 != null && tela.porcentajeDesperdicio != null) {
        tela.totalMaterialCm2 = round2(tela.materialPuroCm2 * (1 + tela.porcentajeDesperdicio / 100));
      }
      if (tela.totalMaterialCm2 != null && tela.valorCm2 != null) {
        tela.costoMaterial = round2(tela.totalMaterialCm2 * tela.valorCm2);
      }
      newTelas[idx] = tela;
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          telas: newTelas
        }
      };
    });
    // Marcar cambios inmediatamente ante cualquier edición
    setIsDirty(true);
  };

  const addTelaRow = () => {
    withHistory(prev => ({
      ...prev,
      componentes: {
        ...prev.componentes,
        telas: [
          ...(prev.componentes?.telas || []),
          {
            componentId: '',
            anchoTelaCm: null,
            precioPorMetro: null,
            valorCm2: null,
            anchoCm: null,
            largoCm: null,
            materialPuroCm2: null,
            porcentajeDesperdicio: null,
            totalMaterialCm2: null,
            costoMaterial: null
          }
        ]
      }
    }));
  };

  const openSelector = (mode, idx) => {
    setSelectorMode(mode);
    setSelectorIndex(idx);
    setSelectorSearch('');
    setSelectorOpen(true);
  };
  const closeSelector = () => setSelectorOpen(false);

  // Handler para otros materiales
  const handleOtroChange = (idx, field, value) => {
    withHistory(prev => {
      const newOtros = [...(prev.componentes?.otros || [])];
      if (!newOtros[idx]) return prev;
      let newVal = value;
      if (field === 'precioUnitario' || field === 'unidades') {
        newVal = Number.isFinite(value) ? round2(value) : null;
      }
      const otro = { ...newOtros[idx], [field]: newVal };
      if (field === 'componentId') {
        const comp = otherComponents.find(c => c.id === value);
        if (comp?.price != null) {
          const divisor = Number(comp?.unitDivisor) > 0 ? Number(comp.unitDivisor) : 1;
          const basePrice = Number(comp.price) || 0;
          otro.precioUnitario = round2(basePrice / (divisor || 1));
        }
        if (otro.unidades == null) {
          otro.unidades = 1;
        }
      }
      newOtros[idx] = otro;
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          otros: newOtros,
        }
      };
    });
    // Marcar cambios inmediatamente ante cualquier edición
    setIsDirty(true);
  };

  const addOtroRow = () => {
    withHistory(prev => ({
      ...prev,
      componentes: {
        ...prev.componentes,
        otros: [
          ...(prev.componentes?.otros || []),
          {
            componentId: '',
            unidades: null,
            precioUnitario: null,
          }
        ]
      }
    }));
  };

  const handleRemoveOtro = (idx) => {
    withHistory(prev => {
      const newOtros = (prev.componentes?.otros || []).filter((_, i) => i !== idx);
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          otros: newOtros
        }
      };
    });
    setIsDirty(true);
  };

  // Handler to remove a tela row and persist deletion inmediatamente
  const handleRemoveTela = (idx) => {
    withHistory(prev => {
      const newTelas = (prev.componentes?.telas || []).filter((_, i) => i !== idx);
      return {
        ...prev,
        componentes: {
          ...prev.componentes,
          telas: newTelas
        }
      };
    });
    setIsDirty(true);
  };

  // Totales calculados (excluyendo confección de "otros" si corresponde)
  const telasTotal = (detailProduct?.componentes?.telas || [])
    .reduce((acc, t) => acc + (Number(t.costoMaterial) || 0), 0);
  const otrosRows = (detailProduct?.componentes?.otros || []).map(o => {
    const compName = otherById[o.componentId]?.name;
    const tagConf = isConfeccionName(compName);
    const unidades = Number(o.unidades) || 0;
    const precio = Number(o.precioUnitario) || 0;
    const total = unidades * precio;
    return { ref: o, _isConfeccion: tagConf, _total: total };
  });
  const otrosNoConfeccionTotal = otrosRows
    .filter(r => !r._isConfeccion)
    .reduce((acc, r) => acc + r._total, 0);
  const otrosConfeccionTotal = otrosRows
    .filter(r => r._isConfeccion)
    .reduce((acc, r) => acc + r._total, 0);
  const hasConfeccionRows = otrosRows.some(r => r._isConfeccion);
  const productoTotal = round2(telasTotal + otrosNoConfeccionTotal);
  const costoConfeccionEffective = hasConfeccionRows
    ? round2(otrosConfeccionTotal)
    : (Number(detailProduct?.costoConfeccion) || 0);
  const totalConConfeccion = round2(productoTotal + costoConfeccionEffective);

  // Ajustes porcentuales por producto (persistentes)
  const addAdjustment = () => {
    withHistory(prev => ({
      ...prev,
      priceAdjustments: [ ...(prev?.priceAdjustments || []), { name: '', percent: 0 } ]
    }));
  };
  const removeAdjustment = (idx) => {
    withHistory(prev => ({
      ...prev,
      priceAdjustments: (prev?.priceAdjustments || []).filter((_, i) => i !== idx)
    }));
  };
  const updateAdjustment = (idx, field, value) => {
    withHistory(prev => ({
      ...prev,
      priceAdjustments: (prev?.priceAdjustments || []).map((row, i) => {
        if (i !== idx) return row;
        if (field === 'percent') return { ...row, percent: round2(value) };
        return { ...row, [field]: value };
      })
    }));
    // Marcar cambios inmediatamente ante cualquier edición
    setIsDirty(true);
  };

  return (
    <div>
      <h1>Gestor de Productos</h1>
      <ProductList
        key={refresh}
        viewMode={'rows'}
        onSelectProduct={handleSelectProduct}
        onEditProduct={handleEditProduct}
        onCopyProduct={handleCopyProduct}
        onDeleteProduct={handleDeleteProduct}
      />
      {showModal && (
        <>
          <div style={overlayFade(addClosing)} onClick={closeAddModal} />
          <div style={{ ...addModalStyle, opacity: addClosing ? 0 : 1, transform: `translate(-50%, -50%) ${addClosing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' }}>
            <button style={closeButtonStyle} onClick={closeAddModal}>X</button>
            <ProductForm
              mode={modalMode}
              initialValues={
                modalMode === 'copy'
                  ? { ...selectedProduct, name: `Copia de ${selectedProduct.name}` }
                  : modalMode === 'edit'
                  ? selectedProduct
                  : {}
              }
              onProductSubmit={handleProductSubmit}
            />
          </div>
        </>
      )}
      {showDetailModal && (
        <>
          <div style={overlayFade(detailClosing)} onClick={requestCloseDetailModal} />
          <div style={detailModalAnimStyle} className="product-detail-modal">
            <button style={closeButtonStyle} onClick={requestCloseDetailModal}>X</button>
            <div style={{ width: '90%', margin: '0 auto', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, textAlign: 'left' }}>{detailProduct.name}</h2>
              <button onClick={openProductComments}>Ver comentarios</button>
            </div>
            <div>
                {/* Sección TELAS - ancho 80% escritorio / 100% mobile; en mobile, tabla scrolleable horizontal */}
                <div style={{
                  width: isMobile ? '100%' : (isCompactDesktop ? '100%' : '80%'),
                  margin: '0 auto',
                  padding: (isMobile || isCompactDesktop) ? '0 10px' : 0
                }}>
                  <h3 style={{ marginTop: '16px', marginBottom: '8px', textAlign: 'left' }}>Materiales - Telas</h3>
                  <div style={{ overflowX: (isMobile || isCompactDesktop) ? 'auto' : 'visible' }}>
                    <table style={{
                      width: isMobile ? '760px' : '100%',
                      minWidth: (!isMobile && isCompactDesktop) ? '1024px' : undefined,
                      marginBottom: '24px',
                      borderCollapse: 'separate',
                      borderSpacing: '4px',
                      border: '1px solid #ccc'
                    }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ccc', padding: '8px' }}>Componente</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Ancho tela (cm)</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Precio/m</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Valor cm²</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Ancho (cm)</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Largo (cm)</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Material puro (cm²)</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>% Desperdicio</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Total material (cm²)</th>
                        <th style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>Costo material ($)</th>
                        <th style={{ border: '1px solid #ccc', padding: '8px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody
                      onDragOver={e => {
                        if (draggingTelaIndex != null) e.preventDefault();
                      }}
                      onDrop={e => {
                        if (draggingTelaIndex != null) {
                          e.preventDefault();
                          handleTelaReorder((detailProduct.componentes?.telas || []).length);
                        }
                      }}
                    >
                      {(detailProduct.componentes?.telas || []).map((tela, idx) => {
                        const telaRecord = tela.componentId ? telaById[tela.componentId] : null;
                        return (
                            <tr
                              key={idx}
                              draggable
                              onDragStart={() => setDraggingTelaIndex(idx)}
                              onDragEnd={() => setDraggingTelaIndex(null)}
                              onDragOver={e => {
                                if (draggingTelaIndex != null) e.preventDefault();
                              }}
                              onDrop={e => {
                                if (draggingTelaIndex != null) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleTelaReorder(idx);
                                }
                              }}
                              style={{
                                height: '48px',
                                cursor: 'move',
                                backgroundColor: draggingTelaIndex === idx ? '#f0f8ff' : undefined
                              }}
                            >
                              {/* Componente selector */}
                              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                <button onClick={() => openSelector('tela', idx)}>Seleccione Tela</button>
                                {tela.componentId ? (
                                  <div style={{ marginTop: 6, color: '#555', fontSize: 12 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      {telaRecord?.autoPriceFailed ? (
                                        <span
                                          style={{ color: '#f4b400', fontSize: 14, display: 'inline-flex', alignItems: 'center' }}
                                          title="Falló la actualización automática del precio"
                                        >
                                          ⚠️
                                        </span>
                                      ) : null}
                                      {cap(telaRecord?.name || '') || tela.componentId}
                                    </span>
                                  </div>
                                ) : null}
                              </td>
                              {/* Ancho tela editable */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tela.anchoTelaCm ?? ''}
                                  onChange={e => handleTelaChange(idx, 'anchoTelaCm', e.target.valueAsNumber)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              {/* Precio/m disable */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input type="text" value={fmt2(tela.precioPorMetro)} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
                              </td>
                              {/* Valor cm2 disabled */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input type="text" value={fmt2(tela.valorCm2)} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
                              </td>
                              {/* Ancho editable */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tela.anchoCm ?? ''}
                                  onChange={e => handleTelaChange(idx, 'anchoCm', e.target.valueAsNumber)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              {/* Largo editable */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tela.largoCm ?? ''}
                                  onChange={e => handleTelaChange(idx, 'largoCm', e.target.valueAsNumber)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              {/* Material puro disabled */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input type="text" value={fmt2(tela.materialPuroCm2)} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
                              </td>
                              {/* % Desperdicio editable */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tela.porcentajeDesperdicio ?? ''}
                                  onChange={e => handleTelaChange(idx, 'porcentajeDesperdicio', e.target.valueAsNumber)}
                                  style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              {/* Total material disabled */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input type="text" value={fmt2(tela.totalMaterialCm2)} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
                              </td>
                              {/* Costo material disabled */}
                              <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'right', width: '84px' }}>
                                <input type="text" value={fmt2(tela.costoMaterial)} disabled style={{ width: '100%', boxSizing: 'border-box' }} />
                              </td>
                              {/* Acciones cell */}
                              <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                <button onClick={() => handleRemoveTela(idx)}>- Eliminar</button>
                              </td>
                            </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      marginTop: '-8px',
                      marginBottom: '24px',
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between'
                    }}
                  >
                    <button onClick={addTelaRow}>+ Agregar Tela</button>
                    <button
                      onClick={sortTelasAlphabetically}
                      disabled={(detailProduct.componentes?.telas || []).length < 2}
                    >
                      Ordenar alfabéticamente
                    </button>
                  </div>
                </div>

                {/* Sección OTROS + IMAGEN: en escritorio dos columnas; en mobile, apilado y tablas scrolleables */}
                {isMobile ? (
                  <div style={{ width: '100%', margin: '0 auto', padding: '0 10px' }}>
                    {/* Imagen (si hay) */}
                    {detailProduct?.image ? (
                      <div style={{ width: '100%', margin: '8px 0 16px 0', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: '70%', maxWidth: 320, border: '1px solid #ccc', borderRadius: 6, background: '#f5f5f5', padding: 8 }}>
                          <img src={detailProduct.image} alt={detailProduct.name} style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 4 }} />
                        </div>
                      </div>
                    ) : null}
                    <h3 style={{ marginTop: '4px', marginBottom: '8px', textAlign: 'left' }}>Materiales - Otros Materiales</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        width: '680px',
                        margin: 0,
                        marginBottom: '16px',
                        borderCollapse: 'separate',
                        borderSpacing: '8px',
                        border: '1px solid #ccc'
                      }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Componente</th>
                            <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Unidades</th>
                            <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Precio Unitario ($)</th>
                            <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Total ($)</th>
                            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody
                          onDragOver={e => {
                            if (draggingOtroIndex != null) e.preventDefault();
                          }}
                          onDrop={e => {
                            if (draggingOtroIndex != null) {
                              e.preventDefault();
                              handleOtroReorder((detailProduct.componentes?.otros || []).length);
                            }
                          }}
                        >
                        {(detailProduct.componentes?.otros || []).map((otro, idx) => {
                          const total = (Number(otro.unidades) || 0) * (Number(otro.precioUnitario) || 0);
                          const otherRecord = otro.componentId ? otherById[otro.componentId] : null;
                          return (
                              <tr
                                key={`otro-${idx}`}
                                draggable
                                onDragStart={() => setDraggingOtroIndex(idx)}
                                onDragEnd={() => setDraggingOtroIndex(null)}
                                onDragOver={e => {
                                  if (draggingOtroIndex != null) e.preventDefault();
                                }}
                                onDrop={e => {
                                  if (draggingOtroIndex != null) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleOtroReorder(idx);
                                  }
                                }}
                                style={{
                                  cursor: 'move',
                                  backgroundColor: draggingOtroIndex === idx ? '#f0f8ff' : undefined
                                }}
                              >
                                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                  <button onClick={() => openSelector('otro', idx)}>Seleccione Componente</button>
                                  {otro.componentId ? (
                                    <div style={{ marginTop: 6, color: '#555', fontSize: 12 }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {otherRecord?.autoPriceFailed ? (
                                          <span
                                            style={{ color: '#f4b400', fontSize: 14, display: 'inline-flex', alignItems: 'center' }}
                                            title="Falló la actualización automática del precio"
                                          >
                                            ⚠️
                                          </span>
                                        ) : null}
                                        {cap(otherRecord?.name || '') || otro.componentId}
                                      </span>
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="number" min="0" step="0.01" value={otro.unidades ?? ''} onChange={e => handleOtroChange(idx, 'unidades', e.target.valueAsNumber)} />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="number" min="0" step="0.01" value={otro.precioUnitario ?? ''} onChange={e => handleOtroChange(idx, 'precioUnitario', e.target.valueAsNumber)} />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="text" value={fmt2(total)} disabled />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                  <button onClick={() => handleRemoveOtro(idx)}>- Eliminar</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        marginTop: '-8px',
                        marginBottom: '16px',
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between'
                      }}
                    >
                      <button onClick={addOtroRow}>+ Agregar Material</button>
                      <button
                        onClick={sortOtrosAlphabetically}
                        disabled={(detailProduct.componentes?.otros || []).length < 2}
                      >
                        Ordenar alfabéticamente
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      width: isCompactDesktop ? '100%' : '80%',
                      margin: '0 auto',
                      padding: isCompactDesktop ? '0 10px' : 0,
                      display: 'grid',
                      gridTemplateColumns: isCompactDesktop ? '1fr' : '1fr auto',
                      columnGap: isCompactDesktop ? 0 : '16px',
                      rowGap: isCompactDesktop ? '16px' : 0,
                      alignItems: 'start'
                    }}
                  >
                    <div style={{ minWidth: 0, overflowX: isCompactDesktop ? 'auto' : 'visible' }}>
                      <h3 style={{ width: '90%', margin: '0 auto', textAlign: 'left', marginTop: '16px', marginBottom: '8px' }}>Materiales - Otros Materiales</h3>
                      <table style={{
                        width: '100%',
                        minWidth: isCompactDesktop ? '920px' : undefined,
                        margin: '0',
                        marginBottom: '24px',
                        borderCollapse: 'separate',
                        borderSpacing: '8px',
                        border: '1px solid #ccc'
                      }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #ccc', padding: '8px' }}>Componente</th>
                          <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Unidades</th>
                          <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Precio Unitario ($)</th>
                          <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>Total ($)</th>
                          <th style={{ border: '1px solid #ccc', padding: '8px' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody
                        onDragOver={e => {
                          if (draggingOtroIndex != null) e.preventDefault();
                        }}
                        onDrop={e => {
                          if (draggingOtroIndex != null) {
                            e.preventDefault();
                            handleOtroReorder((detailProduct.componentes?.otros || []).length);
                          }
                        }}
                      >
                        {(detailProduct.componentes?.otros || []).map((otro, idx) => {
                          const total = (Number(otro.unidades) || 0) * (Number(otro.precioUnitario) || 0);
                          const otherRecord = otro.componentId ? otherById[otro.componentId] : null;
                          return (
                              <tr
                                key={`otro-${idx}`}
                                draggable
                                onDragStart={() => setDraggingOtroIndex(idx)}
                                onDragEnd={() => setDraggingOtroIndex(null)}
                                onDragOver={e => {
                                  if (draggingOtroIndex != null) e.preventDefault();
                                }}
                                onDrop={e => {
                                  if (draggingOtroIndex != null) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleOtroReorder(idx);
                                  }
                                }}
                                style={{
                                  cursor: 'move',
                                  backgroundColor: draggingOtroIndex === idx ? '#f0f8ff' : undefined
                                }}
                              >
                                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                  <button onClick={() => openSelector('otro', idx)}>Seleccione Componente</button>
                                  {otro.componentId ? (
                                    <div style={{ marginTop: 6, color: '#555', fontSize: 12 }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {otherRecord?.autoPriceFailed ? (
                                          <span
                                            style={{ color: '#f4b400', fontSize: 14, display: 'inline-flex', alignItems: 'center' }}
                                            title="Falló la actualización automática del precio"
                                          >
                                            ⚠️
                                          </span>
                                        ) : null}
                                        {cap(otherRecord?.name || '') || otro.componentId}
                                      </span>
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={otro.unidades ?? ''}
                                    onChange={e => handleOtroChange(idx, 'unidades', e.target.valueAsNumber)}
                                  />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={otro.precioUnitario ?? ''}
                                    onChange={e => handleOtroChange(idx, 'precioUnitario', e.target.valueAsNumber)}
                                  />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="text" value={fmt2(total)} disabled />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                                  <button onClick={() => handleRemoveOtro(idx)}>- Eliminar</button>
                                </td>
                              </tr>
                            );
                        })}
                      </tbody>
                    </table>
                    <div
                      style={{
                        width: '100%',
                        marginTop: '-8px',
                        marginBottom: '24px',
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between'
                      }}
                    >
                      <button onClick={addOtroRow}>+ Agregar Material</button>
                      <button
                        onClick={sortOtrosAlphabetically}
                        disabled={(detailProduct.componentes?.otros || []).length < 2}
                      >
                        Ordenar alfabéticamente
                      </button>
                    </div>

                  </div>

                    {/* Imagen del producto en el popup de detalle, alineada al borde derecho del bloque */}
                    <div
                      style={{
                        width: isCompactDesktop ? '100%' : 260,
                        maxWidth: isCompactDesktop ? 360 : 280,
                        margin: isCompactDesktop ? '0 auto' : 0,
                        justifySelf: isCompactDesktop ? 'center' : 'end',
                        display: 'flex',
                        justifyContent: 'center'
                      }}
                    >
                      {detailProduct?.image ? (
                        <div style={{
                          width: '100%',
                          maxWidth: '100%',
                          border: '1px solid #ccc',
                          borderRadius: 6,
                          background: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                          maxHeight: 340
                        }}>
                          <img
                            src={detailProduct.image}
                            alt={detailProduct.name}
                            style={{ width: '100%', height: 'auto', maxHeight: 320, objectFit: 'contain', borderRadius: 4 }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          height: 200,
                          border: '1px solid #ccc',
                          borderRadius: 6,
                          background: '#fafafa',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#999'
                        }}>
                          Sin imagen
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sección Costo Confección + Totales + Ajustes, ancho 80% escritorio / 100% mobile */}
                <div style={{
                  width: isMobile ? '100%' : (isCompactDesktop ? '100%' : '80%'),
                  margin: '0 auto',
                  padding: (isMobile || isCompactDesktop) ? '0 10px' : 0
                }}>
                  {/* Totales */}
                  <div style={{ width: '100%', marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total (confección)</label>
                      <input type="text" value={`$ ${fmt2(costoConfeccionEffective)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total (telas)</label>
                      <input type="text" value={`$ ${fmt2(telasTotal)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total (otros materiales)</label>
                      <input type="text" value={`$ ${fmt2(otrosNoConfeccionTotal)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total (telas + otros materiales)</label>
                      <input type="text" value={`$ ${fmt2(productoTotal)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total (telas + otros materiales + confección)</label>
                      <input type="text" value={`$ ${fmt2(totalConConfeccion)}`} disabled style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Ajustes porcentuales */}
                  <h3 style={{ width: '100%', margin: 0, textAlign: 'left', marginTop: '8px', marginBottom: '8px' }}>Precio corregido porcentualmente</h3>
                  <div style={{ overflowX: (isMobile || isCompactDesktop) ? 'auto' : 'visible' }}>
                    <table style={{
                      width: isMobile ? '820px' : '100%',
                      minWidth: (!isMobile && isCompactDesktop) ? '920px' : undefined,
                      marginBottom: '16px',
                      borderCollapse: 'separate',
                      borderSpacing: '4px',
                      border: '1px solid #ccc'
                    }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ccc', padding: '6px' }}>Nombre</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right', width: '120px' }}>%</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right', width: '210px' }}>Precio (telas + otros materiales)</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right', width: '230px' }}>Precio (telas + otros materiales + confección)</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', width: '140px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailProduct?.priceAdjustments || []).map((row, idx) => {
                        const percentValue = Number(row.percent) || 0;
                        const multiplier = 1 + percentValue / 100;
                        const corrected = round2(productoTotal * multiplier);
                        const correctedWithConfeccion = round2(totalConConfeccion * multiplier);
                        return (
                          <tr key={`adj-${idx}`}>
                            <td style={{ border: '1px solid #ccc', padding: '6px' }}>
                              <input type="text" value={row.name} onChange={e => updateAdjustment(idx, 'name', e.target.value)} style={{ width: '100%' }} />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right' }}>
                              <input type="number" step="0.01" value={row.percent} onChange={e => updateAdjustment(idx, 'percent', e.target.valueAsNumber)} />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right' }}>
                              <input type="text" value={`$ ${fmt2(corrected)}`} disabled />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right' }}>
                              <input type="text" value={`$ ${fmt2(correctedWithConfeccion)}`} disabled />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px' }}>
                              <button onClick={() => removeAdjustment(idx)}>- Eliminar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                  <div style={{ width: '100%', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <button onClick={addAdjustment}>+ Agregar ajuste</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 4,
                          border: '1px solid #ccc',
                          backgroundColor: canUndo ? '#f3f3f3' : '#e0e0e0',
                          cursor: canUndo ? 'pointer' : 'not-allowed'
                        }}
                      >
                        Deshacer último cambio
                      </button>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmUnsavedOpen && (
        <>
          <div style={overlayStyle} onClick={() => setConfirmUnsavedOpen(false)} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'#fff', padding:20, borderRadius:8, zIndex: 1200, width:'90%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Se detectaron cambios</h3>
            <p>¿Querés aplicar los cambios antes de cerrar?</p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <button onClick={() => setConfirmUnsavedOpen(false)}>Seguir editando</button>
              <button onClick={() => { setConfirmUnsavedOpen(false); doCloseDetailModal(); }}>Descartar</button>
              <button onClick={async () => { setConfirmUnsavedOpen(false); await persistDetail(); doCloseDetailModal(); }}>Aplicar y cerrar</button>
            </div>
          </div>
        </>
      )}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1500,
          pointerEvents: 'none',
          opacity: showStatusBubble ? 1 : 0,
          transform: showStatusBubble ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 220ms ease, transform 220ms ease'
        }}
        >
          <div
            style={{
              minWidth: 260,
              maxWidth: 320,
              background: statusVariant === 'error' ? '#ffecec' : '#ffffff',
              border: '1px solid ' + (statusVariant === 'error' ? '#d32f2f' : '#d0d0d0'),
              color: statusVariant === 'error' ? '#b00020' : '#333',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              lineHeight: 1.4,
              pointerEvents: 'auto',
              backdropFilter: 'blur(4px)',
              backgroundClip: 'padding-box'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {statusVariant === 'error' ? 'Error de guardado' : statusVariant === 'saving' ? 'Guardando...' : statusVariant === 'dirty' ? 'Cambios detectados' : 'Guardado automático'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{statusMessage}</span>
              {statusVariant === 'dirty' && (
                <button
                  onClick={() => { persistDetail(); }}
                  style={{ marginLeft: 8 }}
                >
                  Aplicar
                </button>
              )}
            </div>
          </div>
        </div>

      {confirmOpen && (
        <>
          <div style={overlayStyle} onClick={() => { setConfirmOpen(false); setProductToDelete(null); }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform:'translate(-50%, -50%)', background:'#fff', padding: 20, borderRadius: 8, zIndex: 1002, width: '90%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Confirmar borrado</h3>
            <p>¿Querés borrar el producto <strong>{productToDelete?.name}</strong>?</p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <button onClick={() => { setConfirmOpen(false); setProductToDelete(null); }}>Cancelar</button>
              <button onClick={doDeleteProduct}>Borrar</button>
            </div>
          </div>
        </>
      )}
      {showProductComments && (
        <>
          <div style={commentOverlayStyle} onClick={closeProductComments} />
          <div style={commentModalStyle}>
            <button style={closeButtonStyle} onClick={closeProductComments}>X</button>
            <h3 style={{ marginTop: 0 }}>Comentarios de producto</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Comentario</label>
              <textarea
                rows={6}
                value={productComment}
                onChange={e => setProductComment(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}
                placeholder={`Notas sobre ${detailProduct?.name || 'este producto'}...`}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={saveProductComments}>Guardar</button>
              <button onClick={closeProductComments}>Cerrar</button>
            </div>
          </div>
        </>
      )}
      <button
        style={{
          ...scrollTopButtonStyle,
          pointerEvents: showScrollTop ? 'auto' : 'none',
          opacity: showScrollTop ? 1 : 0,
          transform: showScrollTop ? 'translateY(0)' : 'translateY(12px)'
        }}
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        title="Volver arriba"
      >
        ↑
      </button>
      <button style={fabStyle} onClick={handleOpenAdd}>+</button>

      {/* Popup selector de componentes/telas */}
      {selectorOpen && (
        <>
          <div style={selectorOverlayStyle} onClick={closeSelector} />
          <div style={selectorModalStyle} onKeyDown={handleSelectorKeyDown}>
            <button style={closeButtonStyle} onClick={closeSelector}>X</button>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {selectorMode === 'tela' ? 'Seleccionar Tela' : 'Seleccionar Componente'}
            </h3>
            <input
              type="text"
              placeholder={selectorMode === 'tela' ? 'Buscar tela...' : 'Buscar componente...'}
              value={selectorSearch}
              onChange={e => setSelectorSearch(e.target.value)}
              ref={selectorInputRef}
              style={{ width: '100%', padding: 8, boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div
              ref={selectorListRef}
              tabIndex={-1}
              style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid #eee', padding: 8, outline: 'none' }}
            >
              {selectorOptions.map((c, idx) => {
                const isActive = idx === selectorHighlight;
                const priceNumber = Number(c?.price);
                const priceFormatted = Number.isFinite(priceNumber) ? priceNumber.toFixed(2) : '0.00';
                const availableNumber = Number(c?.available);
                const availableValue = Number.isFinite(availableNumber) ? availableNumber.toFixed(2) : '0.00';
                const availabilityLabel = selectorMode === 'tela' ? 'Disponible (m)' : 'Disponible';
                return (
                  <div
                    key={c.id}
                    ref={el => { selectorOptionRefs.current[idx] = el; }}
                    onMouseEnter={() => setSelectorHighlight(idx)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: isActive ? '#e6f4ff' : 'transparent'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{cap(c.name)}</div>
                      <div style={{ fontSize: 12, color: '#777' }}>{c.category} · ${priceFormatted}</div>
                      <div style={{ fontSize: 12, color: '#777' }}>{availabilityLabel}: {availableValue}</div>
                    </div>
                    <button
                      onClick={() => applySelectorOption(c)}
                      tabIndex={-1}
                    >
                      Seleccionar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductsPage;
