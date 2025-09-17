

import React, { useState, useEffect, useMemo } from 'react';

const SaleList = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);

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

  const [pageSize, setPageSize] = useState(10);
  const displayed = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

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
      const res = await fetch(`/api/sales/${sale.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar la venta');
      const product = products.find(p => String(p.id) === String(sale.productId));
      if (product && typeof product.available === 'number') {
        const updated = { ...product, available: (product.available || 0) + (Number(sale.quantity) || 0) };
        await fetch(`/api/products/${product.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
        });
      }
      setSales(prev => prev.filter(s => s.id !== sale.id));
      closeConfirm();
    } catch (err) {
      console.error(err);
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
      </div>

      <hr />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Fecha</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Producto</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 8 }}>Cant.</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 8 }}>Precio Unit</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 8 }}>Ganancia Unit</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: 8 }}>Total</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Cliente</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Pago</th>
              <th style={{ borderBottom: '1px solid #ddd', padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(s => (
              <tr key={s.id}>
                <td style={{ padding: 8 }}>{s.date}</td>
                <td style={{ padding: 8 }}>{s.product?.name || `#${s.productId}`}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{s.quantity}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{s.unitPrice ? `$${Number(s.unitPrice).toFixed(2)}` : '—'}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{s.gananciaUnit ? `$${Number(s.gananciaUnit).toFixed(2)}` : '$0.00'}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>$ {Number(((Number(s.quantity)||0) * ((Number(s.unitPrice)||0) + (Number(s.gananciaUnit)||0))) || s.total || 0).toFixed(2)}</td>
                <td style={{ padding: 8 }}>{capitalize(s.customerName) || '—'}</td>
                <td style={{ padding: 8 }}>{s.paymentMethod || '—'}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => openConfirm(s)}>Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}></td>
              <td style={{ padding: 8, textAlign: 'right', fontWeight: 'bold' }}>$ {totalSum.toFixed(2)}</td>
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
