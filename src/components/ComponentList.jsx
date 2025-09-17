import React, { useState, useMemo } from 'react';

const ComponentList = ({
  components,
  onEditComponent,
  onCopyComponent,
  onDeleteComponent,
  refreshComponents,
  toggleLinkVisibility,
  visibleLinks,
  onAutocompletePrice,
  onBulkCategoryUpdate
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const cap = (s) => (typeof s === 'string' && s.length) ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  // Estado para comentarios por categoría
  const [showComments, setShowComments] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [activeCategoryComponents, setActiveCategoryComponents] = useState([]);
  const [commentRecord, setCommentRecord] = useState(null); // { id?, category, generalComment, rows: [{id, componentId, description}] }
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // Detectar vista mobile simple
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;

  // Renombrar categoría (componentes)
  const [showRename, setShowRename] = useState(false);
  const [renameCategory, setRenameCategory] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [renameItems, setRenameItems] = useState([]); // componentes en la categoría
  const [isRenaming, setIsRenaming] = useState(false);

  const openRename = (category, compsInCategory) => {
    setRenameCategory(category);
    setRenameNewName(category);
    setRenameItems((compsInCategory || []).slice());
    setShowRename(true);
  };
  const closeRename = () => {
    setRenameClosing(true);
    setTimeout(() => {
      setShowRename(false);
      setRenameCategory('');
      setRenameNewName('');
      setRenameItems([]);
      setIsRenaming(false);
      setRenameClosing(false);
    }, 180);
  };
  const doRename = async () => {
    const newName = (renameNewName || '').trim();
    if (!newName) return;
    setIsRenaming(true);
    try {
      for (const comp of renameItems) {
        const payload = { ...comp, category: newName };
        await fetch(`/api/components/${comp.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      }
      // Refrescar lista desde el padre si existe
      if (typeof refreshComponents === 'function') {
        await refreshComponents();
      }
      closeRename();
    } catch (e) {
      console.error('Error renombrando categoría de componentes:', e);
      setIsRenaming(false);
    }
  };

  const overlayStyle = useMemo(() => ({
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000
  }), []);
  const modalStyle = useMemo(() => ({
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    background: '#fff', padding: 20, borderRadius: 8, zIndex: 2001,
    width: '90%', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto'
  }), []);
  const overlayFade = (closing) => ({ ...overlayStyle, opacity: closing ? 0 : 1, transition: 'opacity 180ms ease' });
  const modalAnim = (closing) => ({ ...modalStyle, opacity: closing ? 0 : 1, transform: `translate(-50%, -50%) ${closing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' });
  const [commentsClosing, setCommentsClosing] = useState(false);
  const [renameClosing, setRenameClosing] = useState(false);

  const openComments = async (category, compsInCategory) => {
    try {
      setIsLoadingComments(true);
      setActiveCategory(category);
      setActiveCategoryComponents((compsInCategory || []).slice().sort((a,b)=> (a.name||'').localeCompare(b.name||'')));
      const res = await fetch(`/api/componentComments?category=${encodeURIComponent(category)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCommentRecord({ id: data[0].id, category: data[0].category, generalComment: data[0].generalComment || '', rows: data[0].rows || [] });
        } else {
          setCommentRecord({ id: null, category, generalComment: '', rows: [] });
        }
      } else {
        setCommentRecord({ id: null, category, generalComment: '', rows: [] });
      }
      setShowComments(true);
    } catch (e) {
      console.error('Error abriendo comentarios:', e);
      setCommentRecord({ id: null, category, generalComment: '', rows: [] });
      setShowComments(true);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const closeComments = () => {
    setCommentsClosing(true);
    setTimeout(() => {
      setShowComments(false);
      setActiveCategory('');
      setActiveCategoryComponents([]);
      setCommentRecord(null);
      setCommentsClosing(false);
    }, 180);
  };

  const addCommentRow = () => {
    setCommentRecord(prev => ({
      ...prev,
      rows: [ ...(prev?.rows || []), { id: `row-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, componentId: '', description: '' } ]
    }));
  };

  const removeCommentRow = (rowId) => {
    setCommentRecord(prev => ({
      ...prev,
      rows: (prev?.rows || []).filter(r => r.id !== rowId)
    }));
  };

  const updateCommentRow = (rowId, field, value) => {
    setCommentRecord(prev => ({
      ...prev,
      rows: (prev?.rows || []).map(r => r.id === rowId ? { ...r, [field]: value } : r)
    }));
  };

  const saveComments = async () => {
    if (!commentRecord) return;
    const payload = { category: activeCategory, generalComment: commentRecord.generalComment || '', rows: (commentRecord.rows || []) };
    try {
      if (commentRecord.id) {
        const res = await fetch(`/api/componentComments/${commentRecord.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: commentRecord.id })
        });
        if (res.ok) {
          const saved = await res.json();
          setCommentRecord({ id: saved.id, category: saved.category, generalComment: saved.generalComment || '', rows: saved.rows || [] });
        }
      } else {
        const res = await fetch('/api/componentComments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (res.ok) {
          const saved = await res.json();
          setCommentRecord({ id: saved.id, category: saved.category, generalComment: saved.generalComment || '', rows: saved.rows || [] });
        }
      }
      closeComments();
    } catch (e) {
      console.error('Error guardando comentarios:', e);
    }
  };

  // Filtra la lista según el término de búsqueda por nombre o categoría (case-insensitive)
  const filtered = components.filter(c => {
    const term = searchTerm.toLowerCase();
    const name = c.name ? c.name.toLowerCase() : '';
    const category = c.category ? c.category.toLowerCase() : '';
    return (
      name.includes(term) ||
      category.includes(term)
    );
  });

  // Determina si la búsqueda corresponde a categorías
  const isCategorySearch = searchTerm && components.some(c =>
    c.category && c.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* Barra de búsqueda que ocupa todo el ancho */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Buscar componente..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
      </div>

      {/* Lista de componentes filtrados */}
      <div style={{ display: 'block' }}>
        {searchTerm && !isCategorySearch
          ? filtered.map(component => (
              <div key={component.id} className="card" style={{ marginBottom: '16px' }}>
                <h3>{cap(component.name)}</h3>
                <p>
                  {component.category && component.category.toLowerCase() === 'telas' ? 'Precio por Metro' : 'Precio unitario'}: ${parseFloat(component.price).toFixed(2)}
                </p>
                <p>Categoría: {component.category}</p>
                <p>Disponible: {component.available}</p>
                <p>Valor total: ${(component.price * component.available).toFixed(2)}</p>
                <p>
                  Link Casanacho: {component.link ? (
                    visibleLinks && visibleLinks[component.id] ? (
                      <a href={component.link} target="_blank" rel="noopener noreferrer">{component.link}</a>
                    ) : (
                      <button onClick={() => toggleLinkVisibility && toggleLinkVisibility(component.id)}>Ver link</button>
                    )
                  ) : <span style={{ color: '#aaa' }}>no seleccionado / no disponible</span>}
                </p>
                <button
                  className="card-button"
                  style={{ marginRight: '8px' }}
                  onClick={() => onEditComponent(component)}
                >
                  Editar
                </button>
                <button
                  className="card-button"
                  style={{ marginRight: '8px' }}
                  onClick={() => onCopyComponent(component)}
                >
                  Copiar
                </button>
                <button
                  className="card-button"
                  style={{ marginRight: '8px', opacity: component.link ? 1 : 0.5, cursor: component.link ? 'pointer' : 'not-allowed' }}
                  onClick={() => onAutocompletePrice(component)}
                  disabled={!component.link}
                  title={component.link ? 'Autocompletar Precio' : 'Asigná un link de Casanacho para habilitar'}
                >
                  Autocompletar Precio
                </button>
                <button
                  className="card-button"
                  onClick={() => onDeleteComponent(component)}
                >
                  Eliminar
                </button>
              </div>
            ))
          : Object.entries(
              filtered.reduce((acc, comp) => {
                const category = comp.category || 'Sin categoría';
                if (!acc[category]) acc[category] = [];
                acc[category].push(comp);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, comps]) => (
                <div key={category} style={{ marginBottom: '32px' }}>
                  <hr />
                  {isMobile ? (
                    <>
                      <h2 style={{ margin: '16px 0' }}>{category}</h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <button onClick={() => openComments(category, comps)}>Ver comentarios</button>
                        <button onClick={() => openRename(category, comps)}>Renombrar categoría</button>
                        <button
                          onClick={() => onBulkCategoryUpdate && onBulkCategoryUpdate(category)}
                          title="Actualizar precios de esta categoría"
                        >
                          Actualizar precios
                        </button>
                      </div>
                    </>
                  ) : (
                    <h2 style={{ margin: '16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {category}
                      <button style={{ marginLeft: 8 }} onClick={() => openComments(category, comps)}>Ver comentarios</button>
                      <button style={{ marginLeft: 8 }} onClick={() => openRename(category, comps)}>Renombrar categoría</button>
                      <button
                        style={{ marginLeft: 8 }}
                        onClick={() => onBulkCategoryUpdate && onBulkCategoryUpdate(category)}
                        title="Actualizar precios de esta categoría"
                      >
                        Actualizar precios
                      </button>
                    </h2>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                    {comps.map(component => (
                      <div key={component.id} className="card" style={{ width: '48%', marginBottom: '16px' }}>
                        <h3>{cap(component.name)}</h3>
                        <p>
                          {component.category && component.category.toLowerCase() === 'telas' ? 'Precio por Metro' : 'Precio unitario'}: ${parseFloat(component.price).toFixed(2)}
                        </p>
                        <p>Categoría: {component.category}</p>
                        <p>Disponible: {component.available}</p>
                        <p>Valor total: ${(component.price * component.available).toFixed(2)}</p>
                        <p>
                          Link Casanacho: {component.link ? (
                            visibleLinks && visibleLinks[component.id] ? (
                              <a href={component.link} target="_blank" rel="noopener noreferrer">{component.link}</a>
                            ) : (
                              <button onClick={() => toggleLinkVisibility && toggleLinkVisibility(component.id)}>Ver link</button>
                            )
                          ) : <span style={{ color: '#aaa' }}>No seleccionado / no disponible</span>}
                        </p>
                        <button
                          className="card-button"
                          style={{ marginRight: '8px' }}
                          onClick={() => onEditComponent(component)}
                        >
                          Editar
                        </button>
                        <button
                          className="card-button"
                          style={{ marginRight: '8px' }}
                          onClick={() => onCopyComponent(component)}
                        >
                          Copiar
                        </button>
                        <button
                          className="card-button"
                          style={{ marginRight: '8px', opacity: component.link ? 1 : 0.5, cursor: component.link ? 'pointer' : 'not-allowed' }}
                          onClick={() => onAutocompletePrice(component)}
                          disabled={!component.link}
                          title={component.link ? 'Autocompletar Precio' : 'Asigná un link de Casanacho para habilitar'}
                        >
                          Autocompletar Precio
                        </button>
                        <button
                          className="card-button"
                          onClick={() => onDeleteComponent(component)}
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontWeight: 'bold', marginTop: '8px' }}>
                    Total comprado para categoría {category}: ${comps.reduce((sum, c) => sum + (c.price * c.available), 0).toFixed(2)}
                  </p>
                </div>
              ))}
      </div>
      <br />

      {/* Popup de comentarios por categoría */}
      {showComments && (
        <>
          <div style={overlayFade(commentsClosing)} onClick={closeComments} />
          <div style={modalAnim(commentsClosing)}>
            <button
              onClick={closeComments}
              style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer' }}
            >X</button>
            <h3 style={{ marginTop: 0 }}>Comentarios de categoría: {activeCategory}</h3>
            {isLoadingComments ? (
              <p>Cargando...</p>
            ) : (
              <>
                {/* Comentario general por categoría */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Comentario general</label>
                  <textarea
                    value={commentRecord?.generalComment || ''}
                    onChange={e => setCommentRecord(prev => ({ ...prev, generalComment: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}
                    placeholder={`Notas generales sobre la categoría ${activeCategory}...`}
                  />
                </div>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 6, border: '1px solid #ddd', marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', border: '1px solid #ddd', padding: 8 }}>Componente</th>
                      <th style={{ textAlign: 'left', border: '1px solid #ddd', padding: 8 }}>Descripción</th>
                      <th style={{ border: '1px solid #ddd', padding: 8, width: 120 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(commentRecord?.rows || []).map((row) => (
                      <tr key={row.id}>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          <select
                            value={row.componentId}
                            onChange={e => updateCommentRow(row.id, 'componentId', e.target.value)}
                            style={{ width: '100%' }}
                          >
                            <option value="">Seleccione componente</option>
                            {activeCategoryComponents.map(c => (
                              <option key={c.id} value={c.id}>{cap(c.name)}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          <input
                            type="text"
                            value={row.description || ''}
                            onChange={e => updateCommentRow(row.id, 'description', e.target.value)}
                            placeholder="Escribí una descripción..."
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: 8 }}>
                          <button onClick={() => removeCommentRow(row.id)}>- Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <button onClick={addCommentRow}>+ Agregar fila</button>
                  <div>
                    <button onClick={saveComments} style={{ marginRight: 8 }}>Guardar</button>
                    <button onClick={closeComments}>Cerrar</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Popup renombrar categoría (componentes) */}
      {showRename && (
        <>
          <div style={overlayFade(renameClosing)} onClick={closeRename} />
          <div style={modalAnim(renameClosing)}>
            <button
              onClick={closeRename}
              style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer' }}
            >X</button>
            <h3 style={{ marginTop: 0 }}>Renombrar categoría</h3>
            <p style={{ marginTop: 0, color: '#555' }}>Actual: <strong>{renameCategory}</strong></p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Nuevo nombre</label>
              <input
                type="text"
                value={renameNewName}
                onChange={e => setRenameNewName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}
                placeholder="Nuevo nombre de categoría"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeRename} disabled={isRenaming}>Cancelar</button>
              <button onClick={doRename} disabled={isRenaming || !renameNewName.trim()}>{isRenaming ? 'Renombrando…' : 'Renombrar'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ComponentList;
