

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

  const totalSum = useMemo(() => {
    return displayed.reduce((acc, s) => {
      const qty = Number(s.quantity) || 0;
      const unit = Number(s.unitPrice) || 0;
      const gan = Number(s.gananciaUnit) || 0;
      const computed = qty * (unit + gan);
      return acc + (computed > 0 ? computed : (Number(s.total) || 0));
    }, 0);
  }, [displayed]);

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
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Precio (Unidad)</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Ganancia (unidad)</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Total</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Cliente</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '12px 8px' }}>Pago</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: '12px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(s => (
              <tr key={s.id}>
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
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>{s.unitPrice ? `$${Number(s.unitPrice).toFixed(2)}` : '—'}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>{s.gananciaUnit ? `$${Number(s.gananciaUnit).toFixed(2)}` : '$0.00'}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>$ {Number(((Number(s.quantity)||0) * ((Number(s.unitPrice)||0) + (Number(s.gananciaUnit)||0))) || s.total || 0).toFixed(2)}</td>
                <td style={{ padding: '12px 8px' }}>{capitalize(s.customerName) || '—'}</td>
                <td style={{ padding: '12px 8px' }}>{s.paymentMethod || '—'}</td>
                <td style={{ padding: '12px 8px' }}>
                  <button onClick={() => openConfirm(s)}>Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}></td>
              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold' }}>$ {totalSum.toFixed(2)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

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
