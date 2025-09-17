import React, { useState, useEffect } from 'react';
import ComponentList from '../components/ComponentList';
import ComponentForm from '../components/ComponentForm';

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
  const [bulkCategory, setBulkCategory] = useState(null); // categoría activa en actualización
  // Progreso detallado de actualización en masa
  const [progressItems, setProgressItems] = useState([]); // {id, name, category, status, oldPrice, newPrice, error}
  const [currentIndex, setCurrentIndex] = useState(-1);
  const cancelRequested = React.useRef(false);
  const activeControllers = React.useRef({ price: null, save: null });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = origin ? `${origin}/api` : '/api';
  const scraperEndpoint = `${apiBase}/precio-casanacho`;

  const refreshTimeoutRef = React.useRef(null);

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

  const reloadButtonStyle = {
    ...fabStyle,
    bottom: '90px',
    fontSize: '36px'
  };

  const scrollTopButtonStyle = {
    ...fabStyle,
    bottom: '160px',
    backgroundColor: '#4caf50'
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
        const res = await fetch(
          `${scraperEndpoint}?url=${encodeURIComponent(comp.link)}`,
          { signal: priceController.signal }
        );
        const data = await res.json();

        if (!res.ok) throw new Error('Respuesta no OK del scraper');

        const newPrice = data.price;
        // Guardar en backend
        const saveRes = await fetch(
          `${apiBase}/components/${comp.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...comp, price: newPrice }),
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
        console.error(`Error autocompletando precio para ${comp.name}:`, error);
        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: String(error?.message || error) } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice: null,
          status: 'error',
          error: String(error?.message || error)
        });
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
        const res = await fetch(
          `${scraperEndpoint}?url=${encodeURIComponent(comp.link)}`,
          { signal: priceController.signal }
        );
        const data = await res.json();
        if (!res.ok) throw new Error('Respuesta no OK del scraper');

        const newPrice = data.price;
        const saveRes = await fetch(
          `${apiBase}/components/${comp.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...comp, price: newPrice }),
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
        console.error(`Error autocompletando precio para ${comp.name}:`, error);
        setProgressItems(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: String(error?.message || error) } : p));
        localResults.push({
          name: comp.name,
          category: comp.category,
          oldPrice: comp.price,
          newPrice: null,
          status: 'error',
          error: String(error?.message || error)
        });
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
      const res = await fetch(
        `${scraperEndpoint}?url=${encodeURIComponent(comp.link)}`
      );
      const data = await res.json();
      if (res.ok) {
        const oldPrice = comp.price;
        await fetch(
          `${apiBase}/components/${comp.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...comp, price: data.price })
          }
        );
        result.push({ name: comp.name, category: comp.category, oldPrice, newPrice: data.price, status: 'success', error: null });
      } else {
        result.push({ name: comp.name, category: comp.category, oldPrice: comp.price, newPrice: null, status: 'error', error: 'No se pudo obtener el precio' });
      }
    } catch (error) {
      console.error(`Error autocompletando precio para ${comp.name}:`, error);
      result.push({ name: comp.name, category: comp.category, oldPrice: comp.price, newPrice: null, status: 'error', error: String(error?.message || error) });
    }
    await fetchComponents();
    setUpdatingClosing(true);
    setTimeout(() => { setShowUpdatingPopup(false); setUpdatingClosing(false); }, 180);
    setResults(result);
    setShowResultsPopup(true);
  };

  // Helper: disable buttons when updating or showing results
  const isDisabled = showUpdatingPopup || showResultsPopup;

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
      {/* Lista con búsqueda dinámica */}
      <ComponentList 
        components={components}
        onEditComponent={handleEditComponent}
        onCopyComponent={handleCopyComponent}
        onDeleteComponent={handleDeleteComponent}
        refreshComponents={fetchComponents}
        toggleLinkVisibility={toggleLinkVisibility}
        visibleLinks={visibleLinks}
        onAutocompletePrice={handleSingleAutocomplete}
        onBulkCategoryUpdate={handleBulkAutocompleteCategory}
      />

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
                  const res = await fetch(`${apiBase}/components/${selectedComponent.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(componentData)
                  });
                  if (res.ok) {
                    const updated = await res.json().catch(() => null);
                    setComponents(prev => prev.map(c => c.id === selectedComponent.id ? { ...c, ...(updated || componentData), id: selectedComponent.id } : c));
                    scheduleComponentsRefresh();
                    setShowModal(false);
                  } else {
                    console.error('Error al actualizar el componente');
                  }
                } else {
                  const res = await fetch(`${apiBase}/components`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(componentData)
                  });
                  if (res.ok) {
                    const created = await res.json().catch(() => null);
                    setComponents(prev => {
                      const next = prev.filter(c => c.id !== (created?.id ?? null));
                      const record = { ...(created || componentData) };
                      return [...next, record];
                    });
                    scheduleComponentsRefresh();
                    setShowModal(false);
                  } else {
                    console.error('Error al agregar el componente');
                  }
                }
              }}
            />
          </div>
        </>
      )}

      {/* Botón flotante recarga/autocompletar */}
      <button
        style={{
          ...reloadButtonStyle,
          backgroundColor: isDisabled ? 'rgba(0,153,255,0.3)' : reloadButtonStyle.backgroundColor,
          cursor: isDisabled ? 'not-allowed' : reloadButtonStyle.cursor
        }}
        onClick={handleBulkAutocomplete}
        title="Autocompletar todos"
        disabled={isDisabled}
      >
        ⟳
      </button>
      {/* Botón flotante "+" */}
      <button
        style={{
          ...fabStyle,
          backgroundColor: isDisabled ? 'rgba(0,153,255,0.3)' : fabStyle.backgroundColor,
          cursor: isDisabled ? 'not-allowed' : fabStyle.cursor
        }}
        onClick={handleAddComponent}
        disabled={isDisabled}
      >
        +
      </button>

      {showScrollTop && (
        <button
          style={{ ...scrollTopButtonStyle }}
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          title="Volver arriba"
        >
          ↑
        </button>
      )}

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
