

import React, { useState, useEffect, useMemo } from 'react';

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

  const joinedSales = useMemo(() => {
    const map = new Map(products.map(p => [String(p.id), p]));
    return sales.map(s => ({
      ...s,
      product: map.get(String(s.productId)) || null
    }));
  }, [sales, products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return joinedSales.filter(s => {
      const name = s.product?.name?.toLowerCase() || '';
      const cust = s.customerName?.toLowerCase() || '';
      const matchesSearch = term ? (name.includes(term) || cust.includes(term)) : true;
      const matchesMethod = method ? s.paymentMethod === method : true;
      const d = s.date ? new Date(s.date) : null;
      const matchesStart = start ? (d && d >= start) : true;
      const matchesEnd = end ? (d && d <= end) : true;
      return matchesSearch && matchesMethod && matchesStart && matchesEnd;
    });
  }, [joinedSales, search, method, startDate, endDate]);

  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [pageSize, setPageSize] = useState(10);
  const [editingSale, setEditingSale] = useState(null);
  const [editData, setEditData] = useState(null);
  const [initialEditData, setInitialEditData] = useState(null);
  const [editDirty, setEditDirty] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const editProductExists = useMemo(() => {
    if (!editData) return false;
    return products.some(p => String(p.id) === String(editData.productId));
  }, [editData, products]);

  const openEdit = (sale) => {
    if (!sale) return;
    const normalized = {
      productId: String(sale.productId || ''),
      quantity: String(sale.quantity ?? ''),
      unitPrice: sale.unitPrice !== undefined && sale.unitPrice !== null ? String(sale.unitPrice) : '',
      gananciaUnit: sale.gananciaUnit !== undefined && sale.gananciaUnit !== null ? String(sale.gananciaUnit) : '',
      realSaleValue: sale.realSaleValue !== undefined && sale.realSaleValue !== null && sale.realSaleValue !== ''
        ? String(sale.realSaleValue)
        : '',
      customerName: sale.customerName || '',
      date: sale.date || '',
      paymentMethod: sale.paymentMethod || ''
    };
    setEditingSale(sale);
    setEditData(normalized);
    setInitialEditData({ ...normalized });
    setEditDirty(false);
    setSavingEdit(false);
  };

  const handleEditFieldChange = (field) => (e) => {
    const value = e && e.target ? e.target.value : e;
    setEditData(prev => {
      const next = { ...(prev || {}), [field]: value };
      if (initialEditData) {
        const dirty = Object.keys(next).some(key => (next[key] ?? '') !== (initialEditData[key] ?? ''));
        setEditDirty(dirty);
      } else {
        setEditDirty(true);
      }
      return next;
    });
  };

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
    return { qty, cost, gain, total, realSaleVal, realProfit };
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
    const realSaleValue = editData.realSaleValue === '' ? null : Number(editData.realSaleValue);

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
      realSaleValue
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
        setLastDeletedSale({ sale, productSnapshot: { id: product.id, availableBefore: previousAvailable } });
      } else {
        setLastDeletedSale({ sale, productSnapshot: null });
      }
      setSales(prev => prev.filter(s => s.id !== sale.id));
      closeConfirm();
    } catch (err) {
      console.error(err);
    }
  };

  const undoDelete = async () => {
    if (!lastDeletedSale) return;
    try {
      const { sale, productSnapshot } = lastDeletedSale;
      const { product, ...saleData } = sale;
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
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Valor venta real</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Ganancia real</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Cliente</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Pago</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: '12px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(s => {
              const qty = Number(s.quantity) || 0;
              const costMaterials = Number(s.unitPrice) || 0;
              const estimatedGain = Number(s.gananciaUnit) || 0;
              const computed = qty * (costMaterials + estimatedGain);
              const fallbackTotal = Number(s.total) || 0;
              const costTotal = computed > 0 ? computed : fallbackTotal;
              const realSaleRaw = s.realSaleValue;
              const hasRealSale = realSaleRaw !== null && realSaleRaw !== undefined && realSaleRaw !== '';
              const realSaleAmount = hasRealSale ? Number(realSaleRaw) : NaN;
              const validRealSale = hasRealSale && !Number.isNaN(realSaleAmount);
              const realProfit = validRealSale ? realSaleAmount - costMaterials : null;

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
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{costMaterials ? `$${costMaterials.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{estimatedGain ? `$${estimatedGain.toFixed(2)}` : '$0.00'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>$ {costTotal.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{validRealSale ? `$${realSaleAmount.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{validRealSale ? `$${realProfit.toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '12px 8px' }}>{capitalize(s.customerName) || '—'}</td>
                  <td style={{ padding: '12px 8px' }}>{s.paymentMethod || '—'}</td>
                </tr>
              );
            })}
          </tbody>
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
                    style={{ padding: 8 }}
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
                    style={{ padding: 8 }}
                  />
                </div>

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
          <div style={{ position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', zIndex: 1400 }} onClick={closeConfirm} />
          <div style={{ position: 'fixed', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'#fff', padding:20, borderRadius:8, zIndex: 1401, width:'90%', maxWidth:420 }}>
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
