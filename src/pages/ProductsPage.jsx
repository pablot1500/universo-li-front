import React, { useState, useEffect, useMemo, useRef } from 'react';
import ProductForm from '../components/ProductForm';
import ProductList from '../components/ProductList';

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
  const closeDetailModal = () => { setDetailClosing(true); setTimeout(() => { setShowDetailModal(false); setDetailClosing(false); }, 180); };
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
    backgroundColor: 'rgba(0,153,255,0.7)',
    color: '#fff',
    fontSize: '36px',
    border: 'none',
    cursor: 'pointer',
    zIndex: 1001,
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
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    setRefresh(prev => prev + 1);
    setShowModal(false);
  };

  const handleSelectProduct = (product) => {
    const base = {
      componentes: { telas: [], otros: [] },
      costoConfeccion: 0,
    };
    // Normaliza estructura mínima para evitar errores
    // Construye ajustes a partir de priceAdjustments y pricing.modificadores
    const existingAdjustments = Array.isArray(product?.priceAdjustments) ? product.priceAdjustments : [];
    const modifiersObj = (product?.pricing && product.pricing.modificadores) || product?.modificadores || null;
    const modifierAdjustments = modifiersObj && typeof modifiersObj === 'object'
      ? Object.entries(modifiersObj).map(([name, frac]) => ({
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

    const normalized = {
      ...product,
      componentes: {
        telas: product?.componentes?.telas ? [...product.componentes.telas] : [],
        otros: product?.componentes?.otros ? [...product.componentes.otros] : [],
      },
      priceAdjustments: mergedAdjustments
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

  // Helpers de formato/redondeo
  const round2 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
  };
  const fmt2 = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '';
  };

  // Normaliza string para búsqueda sin tildes y case-insensitive
  const norm = (s) => (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const isConfeccionName = (name) => norm(name).includes('confeccion');

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
    setDetailProduct(prev => {
      if (!prev) return prev;
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
    setDetailProduct(prev => {
      if (!prev) return prev;
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
    setDetailProduct(prev => {
      if (!prev) return prev;
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
    setDetailProduct(prev => {
      if (!prev) return prev;
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

  const applySelectorOption = (component) => {
    if (!component) return;
    if (selectorMode === 'tela') {
      handleTelaChange(selectorIndex, 'componentId', component.id);
    } else {
      handleOtroChange(selectorIndex, 'componentId', component.id);
    }
    closeSelector();
  };

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
    setDetailProduct(prev => {
      // copy existing telas, allow adding new row when editing last
      let newTelas = [...(prev.componentes?.telas || [])];
      // Redondeos de inputs a 2 decimales
      const numericFields = ['anchoTelaCm','anchoCm','largoCm','porcentajeDesperdicio'];
      const newValue = numericFields.includes(field) ? round2(value) : value;
      const tela = { ...newTelas[idx], [field]: newValue };
      // When componentId changes, import precioPorMetro from selected component
      if (field === 'componentId') {
        const comp = telaComponents.find(c => c.id === value);
        tela.precioPorMetro = comp?.price || 0;
      }
      // Compute valorCm2 when precioPorMetro and anchoTelaCm exist
      if (tela.precioPorMetro && tela.anchoTelaCm) {
        tela.valorCm2 = round2(tela.precioPorMetro / tela.anchoTelaCm);
      }
      // Compute materialPuroCm2 when anchoCm and largoCm exist
      if (tela.anchoCm && tela.largoCm) {
        tela.materialPuroCm2 = round2((tela.anchoCm * tela.largoCm) / 100);
      }
      // Compute totalMaterialCm2 when materialPuroCm2 and porcentajeDesperdicio exist
      if (tela.materialPuroCm2 != null && tela.porcentajeDesperdicio != null) {
        tela.totalMaterialCm2 = round2(tela.materialPuroCm2 * (1 + tela.porcentajeDesperdicio / 100));
      }
      // Compute costoMaterial when totalMaterialCm2 and valorCm2 exist
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
  };

  const addTelaRow = () => {
    setDetailProduct(prev => ({
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
    setDetailProduct(prev => {
      let newOtros = [...(prev.componentes?.otros || [])];
      let newVal = value;
      if (field === 'precioUnitario') newVal = round2(value);
      const otro = { ...newOtros[idx], [field]: newVal };
      if (field === 'componentId') {
        const comp = otherComponents.find(c => c.id === value);
        if (comp?.price != null) {
          otro.precioUnitario = round2(comp.price);
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
  };

  const addOtroRow = () => {
    setDetailProduct(prev => ({
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

  const handleRemoveOtro = async (idx) => {
    try {
      const newOtros = (detailProduct.componentes?.otros || []).filter((_, i) => i !== idx);
      const payload = {
        ...detailProduct,
        componentes: {
          ...detailProduct.componentes,
          otros: newOtros,
        }
      };
      await fetch(`/api/products/${detailProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setDetailProduct(prev => ({
        ...prev,
        componentes: {
          ...prev.componentes,
          otros: newOtros,
        }
      }));
      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error('Error removing otro material:', err);
    }
  };

  // Handler to remove a tela row and persist deletion immediately
  const handleRemoveTela = async (idx) => {
    try {
      const newTelas = detailProduct.componentes.telas.filter((_, i) => i !== idx);
      const payload = {
        ...detailProduct,
        componentes: {
          ...detailProduct.componentes,
          telas: newTelas
        }
      };
      await fetch(`/api/products/${detailProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setDetailProduct(prev => ({
        ...prev,
        componentes: {
          ...prev.componentes,
          telas: newTelas
        }
      }));
      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error('Error removing tela:', err);
    }
  };

  // Save updated product detail to backend
  const saveDetail = async () => {
    try {
      // exclude any tela rows without a chosen component
      // Build modifiers object from priceAdjustments (percent → fraction)
      const modifiersObj = (detailProduct?.priceAdjustments || [])
        .filter(a => (a?.name || '').trim().length > 0)
        .reduce((acc, a) => {
          const key = String(a.name).trim();
          const frac = Number.isFinite(Number(a.percent)) ? Number(a.percent) / 100 : 0;
          acc[key] = Number(frac.toFixed(4));
          return acc;
        }, {});

      const payload = {
        ...detailProduct,
        componentes: {
          ...detailProduct.componentes,
          telas: (detailProduct.componentes?.telas || []).filter(t => t.componentId),
          otros: (detailProduct.componentes?.otros || [])
            .filter(o => o.componentId)
            .map(o => ({
              ...o,
              // Persistimos una marca para evitar doble conteo en listados/ventas
              tagConfeccion: isConfeccionName(otherById[o.componentId]?.name)
            }))
        },
        // Normaliza estructura de ajustes para guardar en DB
        priceAdjustments: (detailProduct?.priceAdjustments || []).map(a => ({
          name: a?.name || '',
          percent: Number.isFinite(Number(a?.percent)) ? Number(a.percent) : 0
        })),
        // Sincroniza también los modificadores dentro de pricing y a nivel raíz (compatibilidad)
        pricing: {
          ...(detailProduct?.pricing || {}),
          modificadores: modifiersObj
        },
        // Guarda costoConfeccion efectivo (sumatoria si hay filas de confección)
        costoConfeccion: costoConfeccionEffective,
        modificadores: modifiersObj
      };
      await fetch(`/api/products/${detailProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // Close modal and refresh product list
      setShowDetailModal(false);
      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error('Error saving detail:', err);
    }
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
    setDetailProduct(prev => ({
      ...prev,
      priceAdjustments: [ ...(prev?.priceAdjustments || []), { name: '', percent: 0 } ]
    }));
  };
  const removeAdjustment = (idx) => {
    setDetailProduct(prev => ({
      ...prev,
      priceAdjustments: (prev?.priceAdjustments || []).filter((_, i) => i !== idx)
    }));
  };
  const updateAdjustment = (idx, field, value) => {
    setDetailProduct(prev => ({
      ...prev,
      priceAdjustments: (prev?.priceAdjustments || []).map((row, i) => {
        if (i !== idx) return row;
        if (field === 'percent') return { ...row, percent: round2(value) };
        return { ...row, [field]: value };
      })
    }));
  };

  return (
    <div>
      <h1>Gestor de Productos</h1>
      <ProductList
        key={refresh}
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
          <div style={overlayFade(detailClosing)} onClick={closeDetailModal} />
          <div style={detailModalAnimStyle}>
            <button style={closeButtonStyle} onClick={closeDetailModal}>X</button>
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
                      {(detailProduct.componentes?.telas || []).map((tela, idx) => (
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
                                    {cap(telaById[tela.componentId]?.name || '') || tela.componentId}
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
                                  onChange={e => handleTelaChange(idx, 'anchoTelaCm', parseFloat(e.target.value))}
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
                                  onChange={e => handleTelaChange(idx, 'anchoCm', parseFloat(e.target.value))}
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
                                  onChange={e => handleTelaChange(idx, 'largoCm', parseFloat(e.target.value))}
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
                                  onChange={e => handleTelaChange(idx, 'porcentajeDesperdicio', parseFloat(e.target.value))}
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
                      ))}
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
                                      {cap(otherById[otro.componentId]?.name || '') || otro.componentId}
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="number" min="0" step="1" value={otro.unidades ?? ''} onChange={e => handleOtroChange(idx, 'unidades', parseFloat(e.target.value))} />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input type="number" min="0" step="0.01" value={otro.precioUnitario ?? ''} onChange={e => handleOtroChange(idx, 'precioUnitario', parseFloat(e.target.value))} />
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
                                      {cap(otherById[otro.componentId]?.name || '') || otro.componentId}
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={otro.unidades ?? ''}
                                    onChange={e => handleOtroChange(idx, 'unidades', parseFloat(e.target.value))}
                                  />
                                </td>
                                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={otro.precioUnitario ?? ''}
                                    onChange={e => handleOtroChange(idx, 'precioUnitario', parseFloat(e.target.value))}
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
                        maxWidth: isCompactDesktop ? '100%' : 280,
                        margin: isCompactDesktop ? '0 auto' : 0,
                        justifySelf: isCompactDesktop ? 'center' : 'end'
                      }}
                    >
                      {detailProduct?.image ? (
                        <div style={{
                          width: '100%',
                          border: '1px solid #ccc',
                          borderRadius: 6,
                          background: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8
                        }}>
                          <img
                            src={detailProduct.image}
                            alt={detailProduct.name}
                            style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 4 }}
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
                  {/* Costo de confección */}
                  <div style={{ width: '100%', marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontWeight: 'bold' }}>Costo Confección</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={costoConfeccionEffective ?? ''}
                      onChange={e => {
                        const v = e.target.value;
                        setDetailProduct(prev => ({
                          ...prev,
                          costoConfeccion: v === '' ? null : round2(parseFloat(v))
                        }));
                      }}
                      disabled={hasConfeccionRows}
                      style={{ width: '100%', opacity: hasConfeccionRows ? 0.6 : 1 }}
                    />
                  </div>

                  {/* Totales */}
                  <div style={{ width: '100%', marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total otros materiales</label>
                      <input type="text" value={`$ ${fmt2(otrosNoConfeccionTotal)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total del producto</label>
                      <input type="text" value={`$ ${fmt2(productoTotal)}`} disabled style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: '1 1 260px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold' }}>Total del producto + Confección</label>
                      <input type="text" value={`$ ${fmt2(totalConConfeccion)}`} disabled style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Ajustes porcentuales */}
                  <h3 style={{ width: '100%', margin: 0, textAlign: 'left', marginTop: '8px', marginBottom: '8px' }}>Precio corregido porcentualmente</h3>
                  <div style={{ overflowX: (isMobile || isCompactDesktop) ? 'auto' : 'visible' }}>
                    <table style={{
                      width: isMobile ? '620px' : '100%',
                      minWidth: (!isMobile && isCompactDesktop) ? '720px' : undefined,
                      marginBottom: '16px',
                      borderCollapse: 'separate',
                      borderSpacing: '4px',
                      border: '1px solid #ccc'
                    }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #ccc', padding: '6px' }}>Nombre</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right', width: '120px' }}>%</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right', width: '180px' }}>Precio</th>
                        <th style={{ border: '1px solid #ccc', padding: '6px', width: '120px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailProduct?.priceAdjustments || []).map((row, idx) => {
                        const corrected = round2(productoTotal * (1 + (Number(row.percent) || 0) / 100));
                        return (
                          <tr key={`adj-${idx}`}>
                            <td style={{ border: '1px solid #ccc', padding: '6px' }}>
                              <input type="text" value={row.name} onChange={e => updateAdjustment(idx, 'name', e.target.value)} style={{ width: '100%' }} />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right' }}>
                              <input type="number" step="0.01" value={row.percent} onChange={e => updateAdjustment(idx, 'percent', parseFloat(e.target.value))} />
                            </td>
                            <td style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'right' }}>
                              <input type="text" value={`$ ${fmt2(corrected)}`} disabled />
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
                  <div style={{ width: '100%', marginBottom: '16px' }}>
                    <button onClick={addAdjustment}>+ Agregar ajuste</button>
                  </div>

                  <div style={{ width: '100%' }}>
                    <button onClick={saveDetail}>Guardar Cambios</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
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
                    <div style={{ fontSize: 12, color: '#777' }}>{c.category} · ${Number(c.price).toFixed(2)}</div>
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
