import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getProductById,
  getProductCategories,
  getProductSummariesPage,
  getProductThumbnails,
  patchProduct
} from '../services/productService';
import { calculateProductTotals } from '../utils/productPricing';

const COMPOSITE_CATEGORY = 'Set / Conjuntos';
const PAGE_SIZE = 20;
const THUMBNAIL_BATCH_SIZE = 4;

const ProductList = ({
  viewMode = 'grid',
  catalogProducts = [],
  telaComponents = [],
  otherComponents = [],
  onSelectProduct,
  onEditProduct,
  onCopyProduct,
  onDeleteProduct
}) => {
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [featuredPageInfo, setFeaturedPageInfo] = useState({ page: 1, total: 0, hasMore: false });
  const [productsByCategory, setProductsByCategory] = useState({});
  const [pageByCategory, setPageByCategory] = useState({});
  const [expandedCategories, setExpandedCategories] = useState(() => new Set());
  const [featuredOpen, setFeaturedOpen] = useState(true);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingCategory, setLoadingCategory] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchPageInfo, setSearchPageInfo] = useState({ page: 1, total: 0, hasMore: false });
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState('');
  const [expandedProducts, setExpandedProducts] = useState(() => new Set());
  const [showRename, setShowRename] = useState(false);
  const [renameCategory, setRenameCategory] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const loadedProducts = useMemo(
    () => Object.values(productsByCategory).flatMap(page => page.items || []),
    [productsByCategory]
  );

  const productsForTotals = useMemo(() => {
    const byId = new Map();
    [...catalogProducts, ...featuredProducts, ...loadedProducts, ...searchResults].forEach(product => {
      if (product?.id) byId.set(product.id, product);
    });
    return Array.from(byId.values());
  }, [catalogProducts, featuredProducts, loadedProducts, searchResults]);

  const telaById = useMemo(
    () => Object.fromEntries((telaComponents || []).map(component => [component.id, component])),
    [telaComponents]
  );
  const otherById = useMemo(
    () => Object.fromEntries((otherComponents || []).map(component => [component.id, component])),
    [otherComponents]
  );
  const productById = useMemo(
    () => Object.fromEntries(productsForTotals.map(product => [product.id, product])),
    [productsForTotals]
  );

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      setCategories(await getProductCategories());
    } catch (error) {
      console.error('Error fetching product categories:', error);
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const mergeProductThumbnails = useCallback((thumbs = []) => {
    if (!thumbs.length) return;
    const byId = new Map(thumbs.map(thumb => [thumb.id, thumb]));
    const mergeRows = (items = []) => items.map(item => {
      const thumb = byId.get(item.id);
      if (!thumb || !thumb.image) return item;
      return {
        ...item,
        image: thumb.image,
        posX: thumb.posX ?? item.posX,
        posY: thumb.posY ?? item.posY
      };
    });

    setProductsByCategory(prev => Object.fromEntries(
      Object.entries(prev).map(([category, data]) => [category, { ...data, items: mergeRows(data.items) }])
    ));
    setFeaturedProducts(prev => mergeRows(prev));
    setSearchResults(prev => mergeRows(prev));
  }, []);

  const loadThumbnailsForProducts = useCallback(async (products = []) => {
    const ids = products
      .filter(product => product?.id && !product.image)
      .map(product => product.id);
    for (let index = 0; index < ids.length; index += THUMBNAIL_BATCH_SIZE) {
      const batch = ids.slice(index, index + THUMBNAIL_BATCH_SIZE);
      try {
        const thumbs = await getProductThumbnails(batch);
        mergeProductThumbnails(thumbs);
      } catch (error) {
        console.error('Error fetching product thumbnails:', error);
      }
    }
  }, [mergeProductThumbnails]);

  const loadFeaturedPage = useCallback(async (page = 1, append = false) => {
    setLoadingFeatured(true);
    try {
      const result = await getProductSummariesPage({ featured: true, page, limit: PAGE_SIZE });
      setFeaturedProducts(prev => append ? [...prev, ...result.items] : result.items);
      setFeaturedPageInfo({ page: result.page, total: result.total, hasMore: result.hasMore });
      loadThumbnailsForProducts(result.items);
    } catch (error) {
      console.error('Error fetching featured products:', error);
      if (!append) {
        setFeaturedProducts([]);
        setFeaturedPageInfo({ page: 1, total: 0, hasMore: false });
      }
    } finally {
      setLoadingFeatured(false);
    }
  }, [loadThumbnailsForProducts]);

  const loadCategoryPage = useCallback(async (category, page = 1, append = false) => {
    setLoadingCategory(prev => ({ ...prev, [category]: true }));
    try {
      const result = await getProductSummariesPage({ category, page, limit: PAGE_SIZE });
      setProductsByCategory(prev => ({
        ...prev,
        [category]: {
          items: append
            ? [...(prev[category]?.items || []), ...result.items]
            : result.items,
          total: result.total,
          hasMore: result.hasMore
        }
      }));
      setPageByCategory(prev => ({ ...prev, [category]: result.page }));
      loadThumbnailsForProducts(result.items);
    } catch (error) {
      console.error('Error fetching product category:', error);
    } finally {
      setLoadingCategory(prev => ({ ...prev, [category]: false }));
    }
  }, [loadThumbnailsForProducts]);

  useEffect(() => {
    fetchCategories();
    loadFeaturedPage(1, false);
  }, [fetchCategories, loadFeaturedPage]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchPageInfo({ page: 1, total: 0, hasMore: false });
      return undefined;
    }

    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const result = await getProductSummariesPage({ search: term, page: 1, limit: PAGE_SIZE });
        setSearchResults(result.items);
        setSearchPageInfo({ page: result.page, total: result.total, hasMore: result.hasMore });
        loadThumbnailsForProducts(result.items);
      } catch (error) {
        console.error('Error searching products:', error);
      } finally {
        setLoadingSearch(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, loadThumbnailsForProducts]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
        if (!productsByCategory[category]) {
          loadCategoryPage(category, 1, false);
        }
      }
      return next;
    });
  };

  const loadMoreCategory = (category) => {
    const nextPage = (pageByCategory[category] || 1) + 1;
    loadCategoryPage(category, nextPage, true);
  };

  const loadMoreFeatured = () => {
    if (loadingFeatured || !featuredPageInfo.hasMore) return;
    loadFeaturedPage((featuredPageInfo.page || 1) + 1, true);
  };

  const loadMoreSearch = async () => {
    const term = searchTerm.trim();
    if (!term || loadingSearch) return;
    setLoadingSearch(true);
    try {
      const nextPage = (searchPageInfo.page || 1) + 1;
      const result = await getProductSummariesPage({ search: term, page: nextPage, limit: PAGE_SIZE });
      setSearchResults(prev => [...prev, ...result.items]);
      setSearchPageInfo({ page: result.page, total: result.total, hasMore: result.hasMore });
      loadThumbnailsForProducts(result.items);
    } catch (error) {
      console.error('Error loading more search results:', error);
    } finally {
      setLoadingSearch(false);
    }
  };

  const refreshLoadedCategory = async (category) => {
    if (!category) return;
    await loadCategoryPage(category, 1, false);
    fetchCategories();
  };

  const compressImageToDataURL = (file, maxSize = 1024, quality = 0.8) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const openImage = async (product) => {
    if (product?.image) {
      setLightboxSrc(product.image);
      setLightboxOpen(true);
      return;
    }
    try {
      const full = await getProductById(product.id);
      if (full?.image) {
        setLightboxSrc(full.image);
        setLightboxOpen(true);
      }
    } catch (error) {
      console.error('No se pudo cargar la imagen del producto:', error);
    }
  };

  const handleImageChange = async (e, product) => {
    const file = e.target.files[0];
    if (!file || !product?.id) return;
    try {
      const dataUrl = await compressImageToDataURL(file, 1024, 0.8);
      await patchProduct(product.id, { image: dataUrl, posX: 50, posY: 50 });
      refreshLoadedCategory(product.category);
    } catch (error) {
      console.error('No se pudo procesar la imagen:', error);
    }
  };

  const toggleFeatured = async (product) => {
    try {
      const saved = await patchProduct(product.id, { featured: !product?.featured });
      const updateList = (items = []) => items.map(item => item.id === product.id ? { ...item, featured: saved.featured } : item);
      setProductsByCategory(prev => Object.fromEntries(
        Object.entries(prev).map(([category, data]) => [category, { ...data, items: updateList(data.items) }])
      ));
      setSearchResults(prev => updateList(prev));
      setFeaturedProducts(prev => {
        if (saved.featured) {
          const exists = prev.some(item => item.id === saved.id);
          return exists ? updateList(prev) : [{ ...product, ...saved }, ...prev];
        }
        return prev.filter(item => item.id !== product.id);
      });
      setFeaturedPageInfo(prev => ({
        ...prev,
        total: Math.max(0, (prev.total || 0) + (saved.featured ? 1 : -1))
      }));
      if (saved.featured) {
        loadThumbnailsForProducts([{ ...product, ...saved }]);
      }
    } catch (error) {
      console.error('No se pudo actualizar el estado Destacado del producto', error);
    }
  };

  const submitCategoryRename = async () => {
    const newName = renameNewName.trim();
    if (!newName || !renameCategory || renameCategory === COMPOSITE_CATEGORY) return;
    setIsRenaming(true);
    try {
      const page = await getProductSummariesPage({ category: renameCategory, page: 1, limit: 1000 });
      for (const product of page.items) {
        await patchProduct(product.id, { category: newName });
      }
      setShowRename(false);
      setExpandedCategories(new Set());
      setProductsByCategory({});
      setPageByCategory({});
      await fetchCategories();
    } catch (error) {
      console.error('Error renombrando categoría de productos:', error);
    } finally {
      setIsRenaming(false);
    }
  };

  const renderProductCard = (product) => {
    const { totalConConfeccion, hasAny } = calculateProductTotals(product, {
      productById,
      telaById,
      otherById
    });
    const fileInputId = `file-input-${product.id}`;
    return (
      <div className={viewMode === 'rows' ? 'card' : 'card product-card'} style={{ display: 'flex', justifyContent: 'space-between', padding: 16, boxSizing: 'border-box' }}>
        <div>
          <h3>
            <button type="button" className="product-name-button" onClick={() => onSelectProduct?.(product)}>
              <strong>{product.name}</strong>
            </button>
          </h3>
          {hasAny || totalConConfeccion > 0
            ? <p>Precio: ${totalConConfeccion.toFixed(2)}</p>
            : <p style={{ color: '#aaa' }}>Definir los materiales del producto para ver el precio</p>}
          <p>Categoría: {product.category || 'Sin categoría'}</p>
          <button style={{ marginRight: 8 }} onClick={() => onEditProduct?.(product)}>Editar</button>
          <button style={{ marginRight: 8 }} onClick={() => onCopyProduct?.(product)}>Copiar</button>
          <button style={{ marginRight: 8 }} onClick={() => toggleFeatured(product)}>
            {product?.featured ? 'Dejar de destacar' : 'Destacar'}
          </button>
          <button onClick={() => onDeleteProduct?.(product)}>Eliminar</button>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{ width: 100, height: 100, border: '1px solid #ccc', marginBottom: 8, marginTop: 10, marginLeft: -5, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ccc', cursor: 'pointer' }}
            onClick={() => openImage(product)}
          >
            {product.image ? (
              <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#ccc' }} />
            ) : (
              'Ver imagen'
            )}
          </div>
          <input type="file" style={{ display: 'none' }} id={fileInputId} onChange={e => handleImageChange(e, product)} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12, gap: 12 }}>
            <button onClick={() => document.getElementById(fileInputId)?.click()}>Cargar Imagen</button>
            <button onClick={() => onSelectProduct?.(product)}>Ver Detalle</button>
          </div>
        </div>
      </div>
    );
  };

  const renderProductRow = (product) => {
    const open = expandedProducts.has(product.id);
    return (
      <div key={product.id} style={{ borderBottom: '1px solid #eee', padding: '10px 4px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => setExpandedProducts(prev => {
            const next = new Set(prev);
            if (next.has(product.id)) next.delete(product.id);
            else next.add(product.id);
            return next;
          })}
        >
          <div style={{ width: 56, height: 56, border: '1px solid #ddd', background: '#f6f6f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', fontSize: 12, overflow: 'hidden' }}>
            {product.image ? (
              <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              'IMG'
            )}
          </div>
          <div style={{ flex: 1, fontWeight: 600 }}>{product.name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{open ? '▲' : '▼'}</div>
        </div>
        <div style={{ overflow: 'hidden', maxHeight: open ? 1200 : 0, opacity: open ? 1 : 0, transition: 'max-height 240ms ease, opacity 240ms ease' }}>
          {renderProductCard(product)}
        </div>
      </div>
    );
  };

  const categoryHeader = (category, count) => (
    <div style={{ margin: '12px 0', padding: '8px 12px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <button
        type="button"
        onClick={() => toggleCategory(category)}
        style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left', flex: 1 }}
      >
        <h2 style={{ margin: 0 }}>{category} <span style={{ fontSize: 14, color: '#666' }}>({count})</span></h2>
      </button>
      <button
        type="button"
        disabled={category === COMPOSITE_CATEGORY}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRenameCategory(category);
          setRenameNewName(category);
          setShowRename(true);
        }}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #f8cfe1',
          background: category === COMPOSITE_CATEGORY ? '#f5f5f5' : '#fce1ef',
          cursor: category === COMPOSITE_CATEGORY ? 'not-allowed' : 'pointer',
          opacity: category === COMPOSITE_CATEGORY ? 0.6 : 1
        }}
      >
        Renombrar categoría
      </button>
    </div>
  );

  const featuredHeader = () => (
    <div style={{ margin: '12px 0', padding: '8px 12px', background: '#fff2f7', border: '1px solid #f8cfe1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <button
        type="button"
        onClick={() => setFeaturedOpen(prev => !prev)}
        style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left', flex: 1 }}
      >
        <h2 style={{ margin: 0 }}>Destacados <span style={{ fontSize: 14, color: '#666' }}>({featuredPageInfo.total || featuredProducts.length})</span></h2>
      </button>
      <div style={{ fontSize: 12, color: '#666' }}>{featuredOpen ? '▲' : '▼'}</div>
    </div>
  );

  const term = searchTerm.trim();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
        />
      </div>

      {term ? (
        <div>
          <h2 style={{ margin: '12px 0' }}>Resultados {searchPageInfo.total ? `(${searchPageInfo.total})` : ''}</h2>
          {loadingSearch && !searchResults.length ? <p>Cargando productos...</p> : null}
          {searchResults.map(renderProductRow)}
          {searchPageInfo.hasMore ? (
            <button onClick={loadMoreSearch} disabled={loadingSearch} style={{ marginTop: 12 }}>
              {loadingSearch ? 'Cargando...' : 'Cargar más'}
            </button>
          ) : null}
          {!loadingSearch && !searchResults.length ? <p>No hay productos para esa búsqueda.</p> : null}
        </div>
      ) : (
        <div>
          {(loadingFeatured || featuredProducts.length > 0) ? (
            <div style={{ marginBottom: 16 }}>
              {featuredHeader()}
              {featuredOpen ? (
                <div>
                  {loadingFeatured && !featuredProducts.length ? <p>Cargando destacados...</p> : null}
                  {featuredProducts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(renderProductRow)}
                  {featuredPageInfo.hasMore ? (
                    <button onClick={loadMoreFeatured} disabled={loadingFeatured} style={{ marginTop: 12 }}>
                      {loadingFeatured ? 'Cargando...' : `Cargar más destacados (${featuredProducts.length}/${featuredPageInfo.total})`}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {loadingCategories ? <p>Cargando categorías...</p> : null}
          {categories.map(({ category, count }) => {
            const open = expandedCategories.has(category);
            const page = productsByCategory[category] || { items: [], total: count, hasMore: false };
            return (
              <div key={category} style={{ marginBottom: 16 }}>
                {categoryHeader(category, count, page.items)}
                {open ? (
                  <div>
                    {loadingCategory[category] && !page.items.length ? <p>Cargando productos...</p> : null}
                    {page.items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(renderProductRow)}
                    {page.hasMore ? (
                      <button onClick={() => loadMoreCategory(category)} disabled={loadingCategory[category]} style={{ marginTop: 12 }}>
                        {loadingCategory[category] ? 'Cargando...' : `Cargar más (${page.items.length}/${page.total})`}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {lightboxOpen && (
        <>
          <div onClick={() => setLightboxOpen(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 3000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 12, borderRadius: 8, zIndex: 3001, maxWidth: '90vw', maxHeight: '85vh' }}>
            <button onClick={() => setLightboxOpen(false)} style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer' }}>X</button>
            <div style={{ maxWidth: '86vw', maxHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={lightboxSrc} alt="Producto" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        </>
      )}

      {showRename && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} onClick={() => setShowRename(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 20, borderRadius: 8, zIndex: 2001, width: '90%', maxWidth: 520 }}>
            <button onClick={() => setShowRename(false)} style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'none', fontSize: 16, cursor: 'pointer' }}>X</button>
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
              <button onClick={submitCategoryRename} disabled={isRenaming || !renameNewName.trim()}>
                {isRenaming ? 'Renombrando...' : 'Renombrar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductList;
