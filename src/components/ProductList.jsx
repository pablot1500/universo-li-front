import React, { useState, useEffect } from 'react';

const ProductList = ({ viewMode = 'grid', onSelectProduct, onEditProduct, onCopyProduct, onDeleteProduct }) => {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState('');

  const openImage = (src) => {
    if (!src) return;
    setLightboxSrc(src);
    setLightboxOpen(true);
  };
  const closeImage = () => {
    setLightboxOpen(false);
    setLightboxSrc('');
  };

  // Renombrar categoría (productos)
  const [showRename, setShowRename] = useState(false);
  const [renameCategory, setRenameCategory] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [renameItems, setRenameItems] = useState([]);
  const [isRenaming, setIsRenaming] = useState(false);

  const openCategoryRename = (category, items = []) => {
    setIsRenaming(false);
    setRenameCategory(category);
    setRenameNewName(category);
    setRenameItems(Array.isArray(items) ? items.slice() : []);
    console.debug('ProductList openCategoryRename', category, Array.isArray(items) ? items.length : 'not-array');
    const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
    raf(() => setShowRename(true));
  };

  // Calcula el total del producto a partir de sus materiales
  const computeTotals = (p = {}) => {
    const telas = (p.componentes && Array.isArray(p.componentes.telas)) ? p.componentes.telas : [];
    const otros = (p.componentes && Array.isArray(p.componentes.otros)) ? p.componentes.otros : [];
    const hasTela = telas.some(t => t && t.componentId);
    const hasOtro = otros.some(o => o && o.componentId);
    const hasAny = hasTela || hasOtro;
    const telasTotal = telas.reduce((acc, t) => acc + (Number(t?.costoMaterial) || 0), 0);
    // Excluye ítems marcados como confección (tagConfeccion) del subtotal de otros
    const otrosTotal = otros
      .filter(o => !o?.tagConfeccion)
      .reduce((acc, o) => acc + ((Number(o?.unidades) || 0) * (Number(o?.precioUnitario) || 0)), 0);
    const base = hasAny
      ? (telasTotal + otrosTotal)
      : (Number(p.price) || 0);
    const total = Math.round(base * 100) / 100;
    const costoConfeccion = Number(p.costoConfeccion) || 0;
    const totalConConfeccionBase = Math.round((base + costoConfeccion) * 100) / 100;

    // Aplica el ajuste porcentual de "inflación" cuando esté definido en el producto
    const adjustments = Array.isArray(p.priceAdjustments) ? p.priceAdjustments : [];
    const inflationRow = adjustments.find(row => {
      const name = typeof row?.name === 'string' ? row.name : '';
      let normalized = name;
      if (typeof normalized.normalize === 'function') {
        normalized = normalized.normalize('NFD');
      }
      normalized = normalized
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      return normalized === 'inflacion' || normalized === 'inflación';
    });

    let totalConConfeccion = totalConConfeccionBase;
    if (inflationRow) {
      const percent = Number(inflationRow.percent);
      if (!Number.isNaN(percent)) {
        const multiplier = 1 + percent / 100;
        totalConConfeccion = Math.round(totalConConfeccionBase * multiplier * 100) / 100;
      }
    }

    return { hasAny, total, totalConConfeccion, totalConConfeccionBase };
  };

  // Comprime/redimensiona imagen a DataURL (JPEG) con tamaño máximo y calidad
  const compressImageToDataURL = (file, maxSize = 1024, quality = 0.8) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleImageChange = async (e, id) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataURL(file, 1024, 0.8);
      setProducts(prev => prev.map(p =>
        p.id === id ? { ...p, image: dataUrl, posX: 50, posY: 50 } : p
      ));
      const updated = products.find(p => p.id === id) || {};
      await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updated, image: dataUrl, posX: 50, posY: 50 })
      });
    } catch (err) {
      console.error('No se pudo procesar la imagen:', err);
    }
  };

  const handlePosition = async (e, id) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, posX: x, posY: y } : p
    ));
    const updated = products.find(p => p.id === id);
    await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updated, posX: x, posY: y })
    });
  };

  const handleOpenDetail = (product) => {
    if (onSelectProduct) onSelectProduct(product);
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      } else {
        console.error('Error fetching products');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Marcar/Desmarcar como destacado
  const toggleFeatured = async (product) => {
    try {
      const payload = { ...product, featured: !product?.featured };
      await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // Refrescar lista local para ver reflejado el toggle
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, featured: payload.featured } : p));
    } catch (e) {
      console.error('No se pudo actualizar el estado Destacado del producto', e);
    }
  };

  // Filtra productos por nombre o categoría (case-insensitive), evitando undefined
  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const name = p.name ? p.name.toLowerCase() : '';
    const category = p.category ? p.category.toLowerCase() : '';
    return (
      name.includes(term) ||
      category.includes(term)
    );
  });

  // Determina si la búsqueda corresponde a categorías
  const isCategorySearch = searchTerm && products.some(p => {
    const category = p.category ? p.category.toLowerCase() : '';
    return category.includes(searchTerm.toLowerCase());
  });

  // const handleDelete = async (id) => {
  //   try {
  //     const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
  //     if (res.ok) {
  //       setProducts(products.filter(p => p.id !== id));
  //     } else {
  //       console.error('Error deleting product');
  //     }
  //   } catch (error) {
  //     console.error('Error deleting product:', error);
  //   }
  // };

  const [expanded, setExpanded] = useState(() => new Set());
  const isExpanded = (id) => expanded.has(id);
  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseStyle = (open) => ({ overflow: 'hidden', maxHeight: open ? 1200 : 0, opacity: open ? 1 : 0, transition: 'max-height 240ms ease, opacity 240ms ease' });

  const renderProductCard = (product) => (
    <div
      key={product.id}
      className={viewMode === 'rows' ? 'card' : 'card product-card'}
      style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box' }}
    >
      <div>
        <h3>
          <button type="button" className="product-name-button" onClick={() => handleOpenDetail(product)}>
            <strong>{product.name}</strong>
          </button>
        </h3>
        {(() => {
          const { totalConConfeccion, hasAny } = computeTotals(product);
          if (hasAny || totalConConfeccion > 0) return (<p>Precio: ${totalConConfeccion.toFixed(2)}</p>);
          return (<p style={{ color: '#aaa' }}>Definir los materiales del producto para ver el precio</p>);
        })()}
        <p>Categoría: {product.category}</p>
        <p>Disponible: {product.available}</p>
        <button style={{ marginRight: '8px' }} onClick={() => onEditProduct && onEditProduct(product)}>Editar</button>
        <button style={{ marginRight: '8px' }} onClick={() => onCopyProduct && onCopyProduct(product)}>Copiar</button>
        <button style={{ marginRight: '8px' }} onClick={() => toggleFeatured(product)}>
          {product?.featured ? 'Dejar de destacar' : 'Destacar'}
        </button>
        <button onClick={() => onDeleteProduct ? onDeleteProduct(product) : null}>Eliminar</button>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '100px', height: '100px', border: '1px solid #ccc', marginBottom: '8px', marginTop: '10px', marginLeft: '-5px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ccc'
          }}
          onClick={() => openImage(product.image)}
        >
          {product.image ? (
            <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#ccc' }} />
          ) : (
            'Imagen'
          )}
        </div>
        <input type="file" style={{ display: 'none' }} id={`file-input-${product.id}`} onChange={e => handleImageChange(e, product.id)} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px', gap: '12px' }}>
          <button onClick={() => document.getElementById(`file-input-${product.id}`)?.click()}>Cargar Imagen</button>
          <button onClick={() => onSelectProduct && onSelectProduct(product)}>Ver Detalle</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => toggleExpanded(product.id)}>Replegar</button>
        </div>
      </div>
    </div>
  );

  if (viewMode === 'rows') {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        {/* Bloque Destacados (si hay) */}
        {(() => {
          const featured = filteredProducts.filter(p => !!p?.featured).slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''));
          if (!featured.length) return null;
          return (
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '12px 0', padding: '8px 12px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6 }}>Destacados</h2>
              {featured.map(product => (
                <div key={product.id} style={{ borderBottom: '1px solid #eee', padding: '10px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => toggleExpanded(product.id)}>
                    <div style={{ width: 56, height: 56, border: '1px solid #ddd', background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {product.image ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{isExpanded(product.id) ? '▲' : '▼'}</div>
                  </div>
                  <div style={collapseStyle(isExpanded(product.id))}>
                    {renderProductCard(product)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        {searchTerm && !isCategorySearch ? (
          Object.entries(
            filteredProducts.reduce((acc, p) => {
              const category = p.category || 'Sin categoría';
              if (!acc[category]) acc[category] = [];
              acc[category].push(p);
              return acc;
            }, {})
          ).sort(([a],[b]) => a.localeCompare(b)).map(([category, prods]) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{ margin: '12px 0', padding: '8px 12px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ margin: 0 }}>{category}</h2>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCategoryRename(category, prods); }}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #f8cfe1', background: '#fce1ef', cursor: 'pointer' }}
                >
                  Renombrar categoría
                </button>
              </div>
              {prods
                .slice()
                .sort((a,b) => (a.name||'').localeCompare(b.name||''))
                .map(product => (
                <div key={product.id} style={{ borderBottom: '1px solid #eee', padding: '10px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => toggleExpanded(product.id)}>
                    <div style={{ width: 56, height: 56, border: '1px solid #ddd', background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {product.image ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{isExpanded(product.id) ? '▲' : '▼'}</div>
                  </div>
                  <div style={collapseStyle(isExpanded(product.id))}>
                    {renderProductCard(product)}
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          Object.entries(
            filteredProducts.reduce((acc, p) => {
              const category = p.category || 'Sin categoría';
              if (!acc[category]) acc[category] = [];
              acc[category].push(p);
              return acc;
            }, {})
          ).sort(([a],[b]) => a.localeCompare(b)).map(([category, prods]) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{ margin: '12px 0', padding: '8px 12px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ margin: 0 }}>{category}</h2>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCategoryRename(category, prods); }}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #f8cfe1', background: '#fce1ef', cursor: 'pointer' }}
                >
                  Renombrar categoría
                </button>
              </div>
              {prods
                .slice()
                .sort((a,b) => (a.name||'').localeCompare(b.name||''))
                .map(product => (
                <div key={product.id} style={{ borderBottom: '1px solid #eee', padding: '10px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => toggleExpanded(product.id)}>
                    <div style={{ width: 56, height: 56, border: '1px solid #ddd', background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {product.image ? <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{isExpanded(product.id) ? '▲' : '▼'}</div>
                  </div>
                  <div style={collapseStyle(isExpanded(product.id))}>
                    {renderProductCard(product)}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        {showRename && (
          <>
            <div
              style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 2000 }}
              onClick={() => setShowRename(false)}
            />
            <div
              style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 20, borderRadius: 8, zIndex: 2001, width: '90%', maxWidth: 520 }}
            >
              <button
                onClick={() => setShowRename(false)}
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
                <button onClick={() => setShowRename(false)} disabled={isRenaming}>Cancelar</button>
                <button
                  onClick={async () => {
                    const newName = (renameNewName || '').trim();
                    if (!newName) return;
                    setIsRenaming(true);
                    try {
                      for (const prod of renameItems) {
                        const payload = { ...prod, category: newName };
                        await fetch(`/api/products/${prod.id}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                        });
                      }
                      await fetchProducts();
                      setShowRename(false);
                    } catch (e) {
                      console.error('Error renombrando categoría de productos:', e);
                      setIsRenaming(false);
                    }
                  }}
                  disabled={isRenaming || !renameNewName.trim()}
                >
                  {isRenaming ? 'Renombrando…' : 'Renombrar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
      </div>
      {/* Lista de productos filtrados o agrupados por categoría */}
      <div style={{ display: 'block' }}>
        {searchTerm && !isCategorySearch ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {filteredProducts.map(product => (
    <div
      key={product.id}
      className="card product-card"
      style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box' }}
    >
                {/* contenido interno de la tarjeta */}
                <div>
                  <h3>
                    <button type="button" className="product-name-button" onClick={() => handleOpenDetail(product)}>
                      <strong>{product.name}</strong>
                    </button>
                  </h3>
                  {(() => {
                    const { totalConConfeccion, hasAny } = computeTotals(product);
                    if (hasAny || totalConConfeccion > 0) return (<p>Precio: ${totalConConfeccion.toFixed(2)}</p>);
                    return (<p style={{ color: '#aaa' }}>Definir los materiales del producto para ver el precio</p>);
                  })()}
                  <p>Categoría: {product.category}</p>
                  <p>Disponible: {product.available}</p>
                  <button style={{ marginRight: '8px' }} onClick={() => onEditProduct && onEditProduct(product)}>Editar</button>
                  <button style={{ marginRight: '8px' }} onClick={() => onCopyProduct && onCopyProduct(product)}>Copiar</button>
                  <button onClick={() => onDeleteProduct ? onDeleteProduct(product) : null}>Eliminar</button>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '100px',
                      height: '100px',
                      border: '1px solid #ccc',
                      marginBottom: '8px',
                      marginTop: '10px',
                      marginLeft: '-5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ccc'
                    }}
                    onClick={() => openImage(product.image)}
                  >
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          backgroundColor: '#ccc'
                        }}
                      />
                    ) : (
                      'Imagen'
                    )}
                  </div>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    id={`file-input-${product.id}`}
                    onChange={e => handleImageChange(e, product.id)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px', gap: '12px' }}>
                    <button onClick={() => document.getElementById(`file-input-${product.id}`)?.click()}>Cargar Imagen</button>
                    <button onClick={() => onSelectProduct && onSelectProduct(product)}>Ver Detalle</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          Object.entries(
            filteredProducts.reduce((acc, p) => {
              const category = p.category || 'Sin categoría';
              if (!acc[category]) acc[category] = [];
              acc[category].push(p);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, prods]) => (
              <div key={category} style={{ marginBottom: '32px' }}>
                <hr />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '16px 0', padding: '6px 10px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6 }}>
                  <h2 style={{ margin: 0 }}>{category}</h2>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCategoryRename(category, prods); }}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #f8cfe1', background: '#fce1ef', cursor: 'pointer' }}
                  >
                    Renombrar categoría
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  {prods.map(product => (
                    <div
                      key={product.id}
                      className="card product-card"
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', boxSizing: 'border-box' }}
                    >
                      {/* contenido interno de la tarjeta */}
                      <div>
                        <h3>
                          <button type="button" className="product-name-button" onClick={() => handleOpenDetail(product)}>
                            <strong>{product.name}</strong>
                          </button>
                        </h3>
                        {(() => {
                          const { totalConConfeccion, hasAny } = computeTotals(product);
                          if (hasAny || totalConConfeccion > 0) return (<p>Precio: ${totalConConfeccion.toFixed(2)}</p>);
                          return (<p style={{ color: '#aaa' }}>Definir los materiales del producto para ver el precio</p>);
                        })()}
                        <p>Categoría: {product.category}</p>
                        <p>Disponible: {product.available}</p>
                        <button style={{ marginRight: '8px' }} onClick={() => onEditProduct && onEditProduct(product)}>Editar</button>
                        <button style={{ marginRight: '8px' }} onClick={() => onCopyProduct && onCopyProduct(product)}>Copiar</button>
                        <button onClick={() => onDeleteProduct ? onDeleteProduct(product) : null}>Eliminar</button>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            width: '100px',
                            height: '100px',
                            border: '1px solid #ccc',
                            marginBottom: '8px',
                            marginTop: '10px',
                            marginLeft: '-5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#ccc'
                          }}
                        onClick={() => openImage(product.image)}
                      >
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              backgroundColor: '#ccc'
                            }}
                          />
                        ) : (
                          'Imagen'
                        )}
                      </div>
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          id={`file-input-${product.id}`}
                          onChange={e => handleImageChange(e, product.id)}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px', gap: '12px' }}>
                          <button onClick={() => document.getElementById(`file-input-${product.id}`)?.click()}>Cargar Imagen</button>
                          <button onClick={() => onSelectProduct && onSelectProduct(product)}>Ver Detalle</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
      {lightboxOpen && (
        <>
          <div
            onClick={closeImage}
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 3000 }}
          />
          <div
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 12, borderRadius: 8, zIndex: 3001, maxWidth: '90vw', maxHeight: '85vh' }}
          >
            <button
              onClick={closeImage}
              style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer' }}
            >X</button>
            <div style={{ maxWidth: '86vw', maxHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={lightboxSrc} alt="Producto" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        </>
      )}
      {/* Popup renombrar categoría (productos) */}
      {showRename && (
        <>
          <div
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 2000 }}
            onClick={() => setShowRename(false)}
          />
          <div
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 20, borderRadius: 8, zIndex: 2001, width: '90%', maxWidth: 520 }}
          >
            <button
              onClick={() => setShowRename(false)}
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
              <button onClick={() => setShowRename(false)} disabled={isRenaming}>Cancelar</button>
              <button
                onClick={async () => {
                  const newName = (renameNewName || '').trim();
                  if (!newName) return;
                  setIsRenaming(true);
                  try {
                    for (const prod of renameItems) {
                      const payload = { ...prod, category: newName };
                      await fetch(`/api/products/${prod.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                      });
                    }
                    await fetchProducts();
                    setShowRename(false);
                  } catch (e) {
                    console.error('Error renombrando categoría de productos:', e);
                    setIsRenaming(false);
                  }
                }}
                disabled={isRenaming || !renameNewName.trim()}
              >
                {isRenaming ? 'Renombrando…' : 'Renombrar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductList;
