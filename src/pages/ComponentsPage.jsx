import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ComponentList from '../components/ComponentList';
import ComponentForm from '../components/ComponentForm';
import {
  getCasanachoNightlySyncStatus,
  triggerCasanachoNightlySync,
  cancelCasanachoNightlySync
} from '../services/casanachoNightlySyncService';
import { fetchCasanachoPrice, sleep } from '../utils/casanachoScraper';

const SCRAPER_BATCH_DELAY_MS = 1800;
const buildManualPriceSyncSuccess = (component, price, meta = {}) => ({
  ...component,
  price,
  autoPriceFailed: false,
  lastPriceSyncAt: new Date().toISOString(),
  lastPriceSyncStatus: meta.stale === true ? 'stale' : 'success',
  lastPriceSyncSource: 'manual',
  lastPriceSyncError: null,
  lastPriceSyncCached: meta.cached === true,
  lastPriceSyncStale: meta.stale === true
});

const buildManualPriceSyncError = (component, errorMessage) => ({
  ...component,
  autoPriceFailed: true,
  lastPriceSyncAt: new Date().toISOString(),
  lastPriceSyncStatus: 'error',
  lastPriceSyncSource: 'manual',
  lastPriceSyncError: errorMessage
});

const NIGHTLY_ACTIVE_STATUSES = ['queued', 'running', 'retry-wait', 'partial', 'cancelling'];

const formatJobDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getTriggerSourceLabel = (value) => {
  if (value === 'scheduled') return 'Nocturna';
  if (value === 'manual') return 'Manual';
  return value || '—';
};

const getStatusLabel = (value) => {
  if (value === 'queued') return 'En cola';
  if (value === 'running') return 'Corriendo';
  if (value === 'retry-wait') return 'Esperando reintento';
  if (value === 'partial') return 'Parcial';
  if (value === 'cancelling') return 'Cancelando';
  if (value === 'cancelled') return 'Cancelado';
  if (value === 'idle') return 'Sin actividad';
  return value || 'Sin datos';
};

const getReportStatusLabel = (value) => {
  if (value === 'success') return 'Actualizado';
  if (value === 'stale') return 'Actualizado con cache vieja';
  if (value === 'error') return 'Falló';
  return value || '—';
};

const getNightlyPollInterval = (status) => {
  if (status === 'queued' || status === 'running' || status === 'cancelling') {
    return 10000;
  }
  if (status === 'retry-wait') {
    return 45000;
  }
  if (status === 'partial') {
    return 15000;
  }
  return null;
};

const getApiErrorMessage = async (response, fallbackMessage) => {
  const body = await response.json().catch(() => null);
  return body?.error || body?.message || fallbackMessage;
};

const ComponentsPage = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  const [components, setComponents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const [componentToDelete, setComponentToDelete] = useState(null);
  const [visibleLinks, setVisibleLinks] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showUpdatingPopup, setShowUpdatingPopup] = useState(false);
  const [updatingClosing, setUpdatingClosing] = useState(false);
  const [results, setResults] = useState([]);
  const [showResultsPopup, setShowResultsPopup] = useState(false);
  const [resultsClosing, setResultsClosing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [nightlyJobState, setNightlyJobState] = useState(null);
  const [nightlyJobLoading, setNightlyJobLoading] = useState(false);
  const [nightlyJobError, setNightlyJobError] = useState('');
  const [nightlyJobTriggering, setNightlyJobTriggering] = useState(false);
  const [nightlyJobCancelling, setNightlyJobCancelling] = useState(false);
  const [showNightlyJobModal, setShowNightlyJobModal] = useState(false);
  const [nightlyJobModalClosing, setNightlyJobModalClosing] = useState(false);
  const [nightlyJobModalView, setNightlyJobModalView] = useState('nightly');
  const [hideNightlyJobToast, setHideNightlyJobToast] = useState(false);
  const [bulkCategory, setBulkCategory] = useState(null); // categoría activa en actualización
  // Progreso detallado de actualización en masa
  const [progressItems, setProgressItems] = useState([]); // {id, name, category, status, oldPrice, newPrice, error}
  const [currentIndex, setCurrentIndex] = useState(-1);
  const cancelRequested = React.useRef(false);
  const activeControllers = React.useRef({ price: null, save: null });
  const nightlyToastWasActiveRef = React.useRef(false);
  const previousNightlyStatusRef = React.useRef(null);
  const retryAutoResumeRef = React.useRef(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = origin ? `${origin}/api` : '/api';
  const scraperEndpoint = `${apiBase}/precio-casanacho`;
  const isNightlyJobActive = NIGHTLY_ACTIVE_STATUSES.includes(nightlyJobState?.status);
  const isNightlyJobCancellable = ['queued', 'running', 'retry-wait', 'partial', 'cancelling'].includes(nightlyJobState?.status);
  const latestNightlyReport = nightlyJobState?.lastNightReport || null;
  const currentJobReport = nightlyJobState?.lastReport || null;

  const refreshTimeoutRef = React.useRef(null);

  const fetchNightlyJobStatus = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setNightlyJobLoading(true);
    }

    try {
      const state = await getCasanachoNightlySyncStatus();
      setNightlyJobState(state);
      setNightlyJobError('');
      return state;
    } catch (error) {
      const message = String(error?.message || error);
      setNightlyJobError(message);
      return null;
    } finally {
      if (!silent) {
        setNightlyJobLoading(false);
      }
    }
  }, []);

  const closeNightlyJobModal = () => {
    setNightlyJobModalClosing(true);
    setTimeout(() => {
      setShowNightlyJobModal(false);
      setNightlyJobModalClosing(false);
    }, 180);
  };

  const fetchComponents = async () => {
    try {
      const res = await fetch(`${apiBase}/components`);
      if (res.ok) {
        const data = await res.json();
        setComponents(data);
      } else {
        console.error('Error fetching components');
      }
    } catch (error) {
      console.error('Error fetching components:', error);
    }
  };

  const scheduleComponentsRefresh = (delay = 12000) => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      fetchComponents().catch(console.error);
      refreshTimeoutRef.current = null;
    }, delay);
  };

  useEffect(() => () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
  }, []);

  useEffect(() => {
    fetchComponents();
    fetchNightlyJobStatus();
  }, [fetchNightlyJobStatus]);

  useEffect(() => {
    if (!isNightlyJobActive) {
      nightlyToastWasActiveRef.current = false;
      return;
    }

    if (!nightlyToastWasActiveRef.current) {
      setHideNightlyJobToast(false);
      nightlyToastWasActiveRef.current = true;
    }
  }, [isNightlyJobActive]);

  useEffect(() => {
    const pollInterval = getNightlyPollInterval(nightlyJobState?.status);
    if (!pollInterval) return undefined;

    const intervalId = setInterval(() => {
      fetchNightlyJobStatus({ silent: true }).catch(console.error);
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [fetchNightlyJobStatus, nightlyJobState?.status]);

  useEffect(() => {
    const previousStatus = previousNightlyStatusRef.current;
    if (NIGHTLY_ACTIVE_STATUSES.includes(previousStatus) && !isNightlyJobActive) {
      fetchComponents().catch(console.error);
    }
    previousNightlyStatusRef.current = nightlyJobState?.status || null;
  }, [isNightlyJobActive, nightlyJobState?.status]);

  useEffect(() => {
    if (retryAutoResumeRef.current) {
      clearTimeout(retryAutoResumeRef.current);
      retryAutoResumeRef.current = null;
    }

    const nextRetryAt = nightlyJobState?.nextRetryAt ? new Date(nightlyJobState.nextRetryAt).getTime() : 0;
    const isWaitingRetry = nightlyJobState?.status === 'retry-wait' && nextRetryAt > 0;
    const isPartial = nightlyJobState?.status === 'partial';
    if ((!isWaitingRetry && !isPartial) || nightlyJobTriggering || nightlyJobCancelling) {
      return undefined;
    }

    const scheduleResume = async () => {
      try {
        setHideNightlyJobToast(false);
        await triggerCasanachoNightlySync();
      } catch (error) {
        setNightlyJobError(String(error?.message || error));
      } finally {
        fetchNightlyJobStatus({ silent: true }).catch(console.error);
      }
    };

    const delay = isPartial ? 2000 : Math.max(0, nextRetryAt - Date.now());
    retryAutoResumeRef.current = setTimeout(() => {
      retryAutoResumeRef.current = null;
      scheduleResume().catch(console.error);
    }, delay + 250);

    return () => {
      if (retryAutoResumeRef.current) {
        clearTimeout(retryAutoResumeRef.current);
        retryAutoResumeRef.current = null;
      }
    };
  }, [
    nightlyJobState?.status,
    nightlyJobState?.nextRetryAt,
    nightlyJobTriggering,
    nightlyJobCancelling,
    fetchNightlyJobStatus
  ]);


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

  const toggleLinkVisibility = (id) => {
    setVisibleLinks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Estilos en línea para el overlay, modal, cierre y FAB
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  };
  const overlayFade = (closing) => ({ ...overlayStyle, opacity: closing ? 0 : 1, transition: 'opacity 180ms ease' });

  const modalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    padding: isMobile ? '20px' : '28px',
    borderRadius: '8px',
    zIndex: 1001,
    width: isMobile ? '86%' : '90%',
    maxWidth: isMobile ? '360px' : '760px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxSizing: 'border-box'
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
    zIndex: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const scrollTopButtonStyle = {
    ...fabStyle,
    bottom: '90px',
    backgroundColor: 'rgba(248,168,201,0.7)',
    transition: 'opacity 0.25s ease, transform 0.25s ease'
  };

  const handleEditComponent = (component) => {
    setModalMode('edit');
    setSelectedComponent(component);
    setShowModal(true);
  };

  const handleCopyComponent = (component) => {
    setModalMode('copy');
    setSelectedComponent(component);
    setShowModal(true);
  };

  const handleDeleteComponent = (component) => {
    setComponentToDelete(component);
    setConfirmOpen(true);
  };

  const doDeleteComponent = async () => {
    if (!componentToDelete) return;
    try {
      const res = await fetch(`${apiBase}/components/${componentToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setComponents(prev => prev.filter(c => c.id !== componentToDelete.id));
        scheduleComponentsRefresh();
        setConfirmOpen(false);
        setComponentToDelete(null);
      } else {
        console.error('Error al eliminar el componente');
      }
    } catch (error) {
      console.error('Error al eliminar el componente:', error);
    }
  };

  const handleAddComponent = () => {
    setModalMode('add');
    setSelectedComponent(null);
    setShowModal(true);
  };

  const handleOpenNightlyJobModal = async () => {
    setNightlyJobModalView('nightly');
    setShowNightlyJobModal(true);
    await fetchNightlyJobStatus();
  };

  const handleOpenCurrentJobModal = async () => {
    setNightlyJobModalView('current');
    setShowNightlyJobModal(true);
    await fetchNightlyJobStatus();
  };

  const handleTriggerNightlyJob = async () => {
    setNightlyJobTriggering(true);
    try {
      await triggerCasanachoNightlySync();
      setHideNightlyJobToast(false);
      await fetchNightlyJobStatus();
    } catch (error) {
      setNightlyJobError(String(error?.message || error));
    } finally {
      setNightlyJobTriggering(false);
    }
  };

  const handleCancelNightlyJob = async () => {
    setNightlyJobCancelling(true);
    try {
      await cancelCasanachoNightlySync();
      await fetchNightlyJobStatus();
    } catch (error) {
      setNightlyJobError(String(error?.message || error));
    } finally {
      setNightlyJobCancelling(false);
    }
  };

  const handleBulkAutocomplete = async () => {
    setBulkCategory(null);
    setShowUpdatingPopup(true);
    setIsLoading(true);
    cancelRequested.current = false;
    setCurrentIndex(-1);

    const componentsWithLink = components.filter(c => c.link);
    // Inicializar progreso en "pending"
    const initial = componentsWithLink.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      status: 'pending',
      oldPrice: c.price,
      newPrice: null,
      error: null
    }));
    setProgressItems(initial);

    const localResults = [];

    for (let i = 0; i < componentsWithLink.length; i++) {
      const comp = componentsWithLink[i];
      if (cancelRequested.current) break;

      setCurrentIndex(i);
      setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'updating' } : p));

      const priceController = new AbortController();
      const saveController = new AbortController();
      activeControllers.current.price = priceController;
      activeControllers.current.save = saveController;

      try {
        if (i > 0) {
          await sleep(SCRAPER_BATCH_DELAY_MS, priceController.signal);
        }
        const { price: newPrice, meta } = await fetchCasanachoPrice(
          scraperEndpoint,
          comp.link,
          { signal: priceController.signal }
        );
        // Guardar en backend
        const saveRes = await fetch(
          `${apiBase}/components/${comp.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildManualPriceSyncSuccess(comp, newPrice, meta)),
            signal: saveController.signal
          }
        );
        if (!saveRes.ok) throw new Error('Error al guardar el precio');

        // Exito
        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'success', newPrice } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice,
          status: 'success',
          error: null
        });
      } catch (error) {
        console.error(`Error autocompletando precio para ${comp.name} (${comp.id}) [${comp.link}]:`, error);
        const errorMessage = String(error?.message || error);
        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: errorMessage } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice: null,
          status: 'error',
          error: errorMessage
        });
        const aborted = error?.name === 'AbortError' || cancelRequested.current;
        if (!aborted) {
          try {
            await fetch(
              `${apiBase}/components/${comp.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildManualPriceSyncError(comp, errorMessage))
              }
            );
          } catch (flagError) {
            console.error('No se pudo marcar el componente con error de autocompletado de precio:', flagError);
          }
        }
      } finally {
        // Limpiar controladores activos para evitar aborts posteriores
        activeControllers.current.price = null;
        activeControllers.current.save = null;
      }
    }

    await fetchComponents();
    setIsLoading(false);
    setUpdatingClosing(true);
    setTimeout(() => { setShowUpdatingPopup(false); setUpdatingClosing(false); }, 180);
    setResults(localResults);
    setShowResultsPopup(true);
  };

  // Actualización masiva solo para una categoría específica
  const handleBulkAutocompleteCategory = async (category) => {
    setBulkCategory(category || null);
    setShowUpdatingPopup(true);
    setIsLoading(true);
    cancelRequested.current = false;
    setCurrentIndex(-1);

    // Mapear "Sin categoría" a componentes sin categoría real
    const isSinCategoria = category === 'Sin categoría';
    const componentsInCategory = components.filter(c => (isSinCategoria ? !c.category : c.category === category));
    const componentsWithLink = componentsInCategory.filter(c => c.link);

    const initial = componentsWithLink.map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      status: 'pending',
      oldPrice: c.price,
      newPrice: null,
      error: null
    }));
    setProgressItems(initial);

    const localResults = [];

    for (let i = 0; i < componentsWithLink.length; i++) {
      const comp = componentsWithLink[i];
      if (cancelRequested.current) break;

      setCurrentIndex(i);
      setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'updating' } : p));

      const priceController = new AbortController();
      const saveController = new AbortController();
      activeControllers.current.price = priceController;
      activeControllers.current.save = saveController;

      try {
        if (i > 0) {
          await sleep(SCRAPER_BATCH_DELAY_MS, priceController.signal);
        }
        const { price: newPrice, meta } = await fetchCasanachoPrice(
          scraperEndpoint,
          comp.link,
          { signal: priceController.signal }
        );
        const saveRes = await fetch(
          `${apiBase}/components/${comp.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildManualPriceSyncSuccess(comp, newPrice, meta)),
            signal: saveController.signal
          }
        );
        if (!saveRes.ok) throw new Error('Error al guardar el precio');

        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'success', newPrice } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice,
          status: 'success',
          error: null
        });
      } catch (error) {
        console.error(`Error autocompletando precio para ${comp.name} (${comp.id}) [${comp.link}]:`, error);
        const errorMessage = String(error?.message || error);
        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: errorMessage } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice: null,
          status: 'error',
          error: errorMessage
        });
        const aborted = error?.name === 'AbortError' || cancelRequested.current;
        if (!aborted) {
          try {
            await fetch(
              `${apiBase}/components/${comp.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildManualPriceSyncError(comp, errorMessage))
              }
            );
          } catch (flagError) {
            console.error('No se pudo marcar el componente con error de autocompletado de precio:', flagError);
          }
        }
      } finally {
        activeControllers.current.price = null;
        activeControllers.current.save = null;
      }
    }

    await fetchComponents();
    setIsLoading(false);
    setUpdatingClosing(true);
    setTimeout(() => { setShowUpdatingPopup(false); setUpdatingClosing(false); }, 180);
    setResults(localResults);
    setShowResultsPopup(true);
    setBulkCategory(null);
  };

  // Individual autocomplete handler, unified with bulk flow
  const handleSingleAutocomplete = async (comp) => {
    setShowUpdatingPopup(true);
    const result = [];
    try {
      const { price, meta } = await fetchCasanachoPrice(scraperEndpoint, comp.link);
      const oldPrice = comp.price;
      await fetch(
        `${apiBase}/components/${comp.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildManualPriceSyncSuccess(comp, price, meta))
        }
      );
      result.push({ name: comp.name, category: comp.category, oldPrice, newPrice: price, status: 'success', error: null });
    } catch (error) {
      console.error(`Error autocompletando precio para ${comp.name} (${comp.id}) [${comp.link}]:`, error);
      const errorMessage = String(error?.message || error);
      result.push({ name: comp.name, category: comp.category, oldPrice: comp.price, newPrice: null, status: 'error', error: errorMessage });
      const aborted = error?.name === 'AbortError' || cancelRequested.current;
      if (!aborted) {
        try {
          await fetch(
            `${apiBase}/components/${comp.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildManualPriceSyncError(comp, errorMessage))
            }
          );
        } catch (flagError) {
          console.error('No se pudo marcar el componente con error de autocompletado de precio:', flagError);
        }
      }
    }
    await fetchComponents();
    setUpdatingClosing(true);
    setTimeout(() => { setShowUpdatingPopup(false); setUpdatingClosing(false); }, 180);
    setResults(result);
    setShowResultsPopup(true);
  };

  // Helper: disable buttons when updating or showing results
  const isDisabled = showUpdatingPopup || showResultsPopup;

  const renderNightlyReportList = (title, items, emptyMessage) => (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 14, background: '#fafafa' }}>
      <h4 style={{ margin: '0 0 10px 0' }}>{title}</h4>
      {items?.length ? (
        <div style={{ display: 'grid', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
          {items.map((item) => (
            <div key={`${title}-${item.id}`} style={{ paddingBottom: 10, borderBottom: '1px solid #e9e9e9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <strong>{item.name}</strong>
                <span style={{ fontSize: 12, color: '#666' }}>{getReportStatusLabel(item.status)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#444', lineHeight: 1.45 }}>
                <div>Categoría: {item.category || 'Sin categoría'}</div>
                {'oldPrice' in item && 'newPrice' in item ? (
                  <div>Precio: {item.oldPrice ?? '—'} → {item.newPrice ?? '—'}</div>
                ) : null}
                {item.error ? <div>Error: {item.error}</div> : null}
                <div>Fecha: {formatJobDateTime(item.at)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: 14 }}>{emptyMessage}</div>
      )}
    </div>
  );

  return (
    <div>
      <h1>Gestor de Componentes</h1>
      {showUpdatingPopup && (
        <>
          <div style={overlayFade(updatingClosing)} />
          <div style={{ ...modalStyle, opacity: updatingClosing ? 0 : 1, transform: `translate(-50%, -50%) ${updatingClosing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0 }}>
                Actualizando precios Casa Nacho{bulkCategory ? ` — Categoría: ${bulkCategory}` : ''}
              </p>
              <button
                onClick={() => {
                  cancelRequested.current = true;
                  try { activeControllers.current.price?.abort(); } catch {}
                  try { activeControllers.current.save?.abort(); } catch {}
                }}
                style={{ padding: '6px 10px', background: '#eee', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>

            {currentIndex >= 0 && progressItems[currentIndex] && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8f8f8', borderRadius: 6 }}>
                Procesando: <strong>{progressItems[currentIndex].name}</strong> ({currentIndex + 1} de {progressItems.length})
              </div>
            )}

            <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
              {progressItems.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ width: 16, textAlign: 'center' }}>
                    {p.status === 'pending' && '…'}
                    {p.status === 'updating' && '⏳'}
                    {p.status === 'success' && '✅'}
                    {p.status === 'error' && '❌'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {p.status === 'success' && `Actualizado: ${p.oldPrice} → ${p.newPrice}`}
                      {p.status === 'error' && (p.error || 'Error al actualizar')}
                      {p.status === 'pending' && 'En cola'}
                      {p.status === 'updating' && 'Actualizando…'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {showResultsPopup && (
        <>
          <div style={overlayFade(resultsClosing)} onClick={() => { setResultsClosing(true); setTimeout(()=>{ setShowResultsPopup(false); setResultsClosing(false); },180); }} />
          <div style={{ ...modalStyle, opacity: resultsClosing ? 0 : 1, transform: `translate(-50%, -50%) ${resultsClosing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' }}>
            <button style={closeButtonStyle} onClick={() => { setResultsClosing(true); setTimeout(()=>{ setShowResultsPopup(false); setResultsClosing(false); },180); }}>X</button>
            <h3 style={{ marginTop: 0 }}>Informe de actualización</h3>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {results.length === 0 && (
                <div>No hubo actualizaciones.</div>
              )}
              {results.map((r, idx) => (
                <div key={idx} style={{ marginBottom: '14px', paddingBottom: 10, borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{r.status === 'success' ? '✅' : '❌'}</span>
                    <strong>{r.name}</strong>
                  </div>
                  <div style={{ fontSize: 13, color: '#444', marginLeft: 24 }}>
                    Categoría: {r.category}<br/>
                    {r.status === 'success' ? (
                      <>Precio: {r.oldPrice} → {r.newPrice}</>
                    ) : (
                      <>Error: {r.error || 'No se pudo actualizar'}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {showNightlyJobModal && (
        <>
          <div style={overlayFade(nightlyJobModalClosing)} onClick={closeNightlyJobModal} />
          <div style={{ ...modalStyle, opacity: nightlyJobModalClosing ? 0 : 1, transform: `translate(-50%, -50%) ${nightlyJobModalClosing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease', maxWidth: isMobile ? '360px' : '980px' }}>
            <button style={closeButtonStyle} onClick={closeNightlyJobModal}>X</button>
            <h3 style={{ marginTop: 0 }}>
              {nightlyJobModalView === 'current' ? 'Detalle de la ejecución actual' : 'Detalle de la última corrida nocturna finalizada'}
            </h3>
            {nightlyJobError ? (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fff4f4', color: '#8a1f1f' }}>
                {nightlyJobError}
              </div>
            ) : null}
            {nightlyJobLoading && !nightlyJobState ? (
              <div>Cargando estado del job...</div>
            ) : nightlyJobModalView === 'current' && nightlyJobState ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {isNightlyJobActive ? (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fff8e8', color: '#5f4700', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span>Esta vista muestra el detalle vivo de la ejecución que está corriendo ahora.</span>
                    <button
                      onClick={handleCancelNightlyJob}
                      disabled={!isNightlyJobCancellable || nightlyJobCancelling}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', color: '#8a1f1f', cursor: !isNightlyJobCancellable || nightlyJobCancelling ? 'not-allowed' : 'pointer' }}
                    >
                      {nightlyJobCancelling ? 'Interrumpiendo...' : 'Interrumpir'}
                    </button>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Estado</div>
                    <strong>{getStatusLabel(nightlyJobState?.status)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Origen</div>
                    <strong>{getTriggerSourceLabel(nightlyJobState?.lastTriggerSource)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Encolado</div>
                    <strong>{formatJobDateTime(nightlyJobState?.lastQueuedAt)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Inicio</div>
                    <strong>{formatJobDateTime(nightlyJobState?.lastRunStartedAt)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Fin</div>
                    <strong>{formatJobDateTime(nightlyJobState?.lastRunFinishedAt)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Componentes con link</div>
                    <strong>{nightlyJobState?.totalComponentsWithLink ?? currentJobReport?.totalComponentsWithLink ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Procesados acumulados</div>
                    <strong>{currentJobReport?.processedCount ?? nightlyJobState?.processedThisRun ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Actualizados acumulados</div>
                    <strong>{currentJobReport?.successCount ?? nightlyJobState?.successCount ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Fallidos acumulados</div>
                    <strong>{currentJobReport?.errorCount ?? nightlyJobState?.errorCount ?? 0}</strong>
                  </div>
                </div>
                {currentJobReport ? (
                  <>
                    <h4 style={{ margin: 0 }}>Detalle acumulado de esta ejecución</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                      {renderNightlyReportList('Qué se ejecutó', currentJobReport.executed, 'Todavía no hay componentes ejecutados en esta corrida.')}
                      {renderNightlyReportList('Qué se actualizó', currentJobReport.updated, 'Todavía no hubo actualizaciones exitosas en esta corrida.')}
                      {renderNightlyReportList('Qué falló', currentJobReport.failed, 'Todavía no hubo fallas en esta corrida.')}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#666' }}>
                    No hay detalle acumulado para la ejecución actual.
                  </div>
                )}
              </div>
            ) : latestNightlyReport ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Estado final</div>
                    <strong>{latestNightlyReport.finishedAll ? 'Finalizada' : latestNightlyReport.rateLimited ? 'Parcial por rate limit' : 'Parcial'}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Origen</div>
                    <strong>{getTriggerSourceLabel(latestNightlyReport.triggerSource)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Run key</div>
                    <strong>{latestNightlyReport.runKey || '—'}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Inicio</div>
                    <strong>{formatJobDateTime(latestNightlyReport.startedAt)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Fin</div>
                    <strong>{formatJobDateTime(latestNightlyReport.finishedAt)}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Componentes con link</div>
                    <strong>{latestNightlyReport.totalComponentsWithLink ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Ejecutados</div>
                    <strong>{latestNightlyReport.processedCount ?? latestNightlyReport.executed?.length ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Actualizados</div>
                    <strong>{latestNightlyReport.successCount ?? latestNightlyReport.updated?.length ?? 0}</strong>
                  </div>
                  <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Fallidos</div>
                    <strong>{latestNightlyReport.errorCount ?? latestNightlyReport.failed?.length ?? 0}</strong>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {renderNightlyReportList('Qué se ejecutó', latestNightlyReport.executed, 'No hay componentes ejecutados en la última corrida nocturna.')}
                  {renderNightlyReportList('Qué se actualizó', latestNightlyReport.updated, 'No hubo actualizaciones exitosas en la última corrida nocturna.')}
                  {renderNightlyReportList('Qué falló', latestNightlyReport.failed, 'No hubo fallas en la última corrida nocturna.')}
                </div>
              </div>
            ) : (
              <div>No hay una corrida nocturna finalizada registrada todavía.</div>
            )}
          </div>
        </>
      )}
      {isNightlyJobActive && !hideNightlyJobToast && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: isMobile ? 'max(12px, env(safe-area-inset-left))' : 'auto',
            right: isMobile ? 'max(12px, env(safe-area-inset-right))' : 20,
            bottom: isMobile ? 'max(84px, calc(env(safe-area-inset-bottom) + 68px))' : 92,
            width: isMobile ? 'auto' : 360,
            maxWidth: isMobile ? 'min(360px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)))' : 360,
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
            padding: isMobile ? 14 : 16,
            zIndex: 1003,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, wordBreak: 'break-word' }}>
                {nightlyJobState?.status === 'queued' ? 'Job Casa Nacho en cola' : 'Actualización Casa Nacho en curso'}
              </div>
              <div style={{ fontSize: 13, color: '#666', wordBreak: 'break-word' }}>
                {getStatusLabel(nightlyJobState?.status)} · {getTriggerSourceLabel(nightlyJobState?.lastTriggerSource)}
              </div>
            </div>
            <button
              onClick={() => setHideNightlyJobToast(true)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, flex: '0 0 auto', padding: 0 }}
              title="Ocultar"
            >
              ×
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: isMobile ? 12.5 : 13, color: '#444', lineHeight: 1.55, wordBreak: 'break-word' }}>
            <div>Procesados en esta corrida: {currentJobReport?.processedCount ?? nightlyJobState?.processedThisRun ?? 0}</div>
            <div>Actualizados: {currentJobReport?.successCount ?? nightlyJobState?.successCount ?? 0}</div>
            <div>Fallidos: {currentJobReport?.errorCount ?? nightlyJobState?.errorCount ?? 0}</div>
            <div>Restantes: {nightlyJobState?.remainingCount ?? 0}</div>
            {nightlyJobState?.nextRetryAt ? (
              <div>Próximo reintento: {formatJobDateTime(nightlyJobState.nextRetryAt)}</div>
            ) : null}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 8,
              marginTop: 14
            }}
          >
            <button
              onClick={handleOpenCurrentJobModal}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer', width: '100%' }}
            >
              Ver detalle
            </button>
            <button
              onClick={() => fetchNightlyJobStatus()}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#111', color: '#fff', cursor: 'pointer', width: '100%' }}
            >
              Refrescar
            </button>
            <button
              onClick={handleCancelNightlyJob}
              disabled={!isNightlyJobCancellable || nightlyJobCancelling}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #d9d9d9',
                background: !isNightlyJobCancellable || nightlyJobCancelling ? '#f1f1f1' : '#fff4f4',
                color: !isNightlyJobCancellable || nightlyJobCancelling ? '#888' : '#8a1f1f',
                cursor: !isNightlyJobCancellable || nightlyJobCancelling ? 'not-allowed' : 'pointer',
                width: '100%'
              }}
            >
              {nightlyJobCancelling ? 'Interrumpiendo...' : 'Interrumpir'}
            </button>
          </div>
        </div>,
        document.body
      )}
      {/* Lista con búsqueda dinámica */}
      <ComponentList 
        components={components}
        viewMode={'rows'}
        onEditComponent={handleEditComponent}
        onCopyComponent={handleCopyComponent}
        onDeleteComponent={handleDeleteComponent}
        refreshComponents={fetchComponents}
        toggleLinkVisibility={toggleLinkVisibility}
        visibleLinks={visibleLinks}
        onAutocompletePrice={handleSingleAutocomplete}
        onBulkCategoryUpdate={handleBulkAutocompleteCategory}
      />

      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleOpenNightlyJobModal}
          style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}
        >
          Ver detalle del job nocturno
        </button>
        <button
          onClick={handleTriggerNightlyJob}
          disabled={nightlyJobTriggering || isNightlyJobActive}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #d9d9d9',
            background: nightlyJobTriggering || isNightlyJobActive ? '#f1f1f1' : '#111',
            color: nightlyJobTriggering || isNightlyJobActive ? '#888' : '#fff',
            cursor: nightlyJobTriggering || isNightlyJobActive ? 'not-allowed' : 'pointer'
          }}
        >
          {nightlyJobTriggering
            ? 'Iniciando job...'
            : isNightlyJobActive
            ? 'Job en ejecución'
            : 'Iniciar actualización automática'}
        </button>
        <button
          onClick={handleCancelNightlyJob}
          disabled={!isNightlyJobCancellable || nightlyJobCancelling}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #d9d9d9',
            background: !isNightlyJobCancellable || nightlyJobCancelling ? '#f1f1f1' : '#fff4f4',
            color: !isNightlyJobCancellable || nightlyJobCancelling ? '#888' : '#8a1f1f',
            cursor: !isNightlyJobCancellable || nightlyJobCancelling ? 'not-allowed' : 'pointer'
          }}
        >
          {nightlyJobCancelling ? 'Interrumpiendo...' : 'Interrumpir job'}
        </button>
        <span style={{ fontSize: 13, color: '#666' }}>
          Última corrida nocturna: {formatJobDateTime(nightlyJobState?.lastNightReport?.finishedAt || nightlyJobState?.lastNightReport?.startedAt)}
        </span>
      </div>

      {/* Modal para agregar nuevo componente */}
      {showModal && (
        <>
          <div style={overlayFade(modalClosing)} onClick={() => { setModalClosing(true); setTimeout(()=>{ setShowModal(false); setModalClosing(false); },180); }} />
          <div style={{ ...modalStyle, opacity: modalClosing ? 0 : 1, transform: `translate(-50%, -50%) ${modalClosing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' }}>
            <button style={closeButtonStyle} onClick={() => { setModalClosing(true); setTimeout(()=>{ setShowModal(false); setModalClosing(false); },180); }}>
              X
            </button>
            <ComponentForm
              mode={modalMode}
              initialValues={
                modalMode === 'edit'
                  ? selectedComponent
                  : modalMode === 'copy'
                  ? { ...selectedComponent, name: `Copia de ${selectedComponent.name}` }
                  : {}
              }
              onComponentSubmit={async (componentData) => {
                if (modalMode === 'edit') {
                  const priceChanged = Number(componentData.price) !== Number(selectedComponent?.price);
                  const payload = {
                    ...selectedComponent,
                    ...componentData,
                    id: selectedComponent.id,
                    autoPriceFailed: priceChanged ? false : !!selectedComponent?.autoPriceFailed
                  };
                  const res = await fetch(`${apiBase}/components/${selectedComponent.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  if (res.ok) {
                    const updated = await res.json().catch(() => null);
                    const nextRecord = updated || payload;
                    setComponents(prev => prev.map(c => c.id === selectedComponent.id ? { ...c, ...nextRecord, id: selectedComponent.id } : c));
                    scheduleComponentsRefresh();
                    setShowModal(false);
                  } else {
                    throw new Error(await getApiErrorMessage(res, 'No se pudo actualizar el componente.'));
                  }
                } else {
                  const payload = {
                    ...componentData,
                    autoPriceFailed: false
                  };
                  const res = await fetch(`${apiBase}/components`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  if (res.ok) {
                    const created = await res.json().catch(() => null);
                    setComponents(prev => {
                      const next = prev.filter(c => c.id !== (created?.id ?? null));
                      const record = { ...(created || payload) };
                      return [...next, record];
                    });
                    scheduleComponentsRefresh();
                    setShowModal(false);
                  } else {
                    throw new Error(await getApiErrorMessage(res, 'No se pudo agregar el componente.'));
                  }
                }
              }}
            />
          </div>
        </>
      )}

      {/* Botón flotante "+" */}
      <button
        style={{
          ...fabStyle,
          backgroundColor: isDisabled ? 'rgba(248,168,201,0.3)' : fabStyle.backgroundColor,
          cursor: isDisabled ? 'not-allowed' : fabStyle.cursor
        }}
        onClick={handleAddComponent}
        disabled={isDisabled}
      >
        +
      </button>

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

      {/* Confirmación de borrado de componente */}
      {confirmOpen && (
        <>
          <div style={overlayFade(confirmClosing)} onClick={() => { setConfirmClosing(true); setTimeout(()=>{ setConfirmOpen(false); setComponentToDelete(null); setConfirmClosing(false); },180); }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: `translate(-50%, -50%) ${confirmClosing ? 'scale(0.98)' : 'scale(1)'}`, background: '#fff', padding: 20, borderRadius: 8, zIndex: 1002, width: '90%', maxWidth: 420, opacity: confirmClosing ? 0 : 1, transition: 'opacity 180ms ease, transform 180ms ease' }}>
            <h3 style={{ marginTop: 0 }}>Confirmar borrado</h3>
            <p>¿Querés borrar el componente <strong>{componentToDelete?.name}</strong>?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setConfirmClosing(true); setTimeout(()=>{ setConfirmOpen(false); setComponentToDelete(null); setConfirmClosing(false); },180); }}>Cancelar</button>
              <button onClick={doDeleteComponent}>Borrar</button>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default ComponentsPage;
