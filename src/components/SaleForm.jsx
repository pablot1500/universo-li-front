

import React, { useState, useEffect, useMemo } from 'react';

const SaleForm = ({ onSaleAdded }) => {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('');

  // Campos de la venta
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [gananciaUnit, setGananciaUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const reloadProducts = async () => {
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
    reloadProducts();
  }, []);

  const selectedProduct = useMemo(
    () => products.find(p => String(p.id) === String(productId)),
    [products, productId]
  );

  const qtyNum = Number(quantity) || 0;
  const priceNum = Number(unitPrice) || 0;
  const gananciaNum = Number(gananciaUnit) || 0;
  const total = Math.max(qtyNum * (priceNum + gananciaNum), 0);

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      if (p?.category) set.add(p.category);
    }
    return Array.from(set).sort((a,b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => category ? p.category === category : false)
      .slice()
      .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  }, [products, category]);

  // Sugerir precio total del producto
  const computeProductCurrentTotal = (p) => {
    if (!p) return 0;
    const telas = (p.componentes && Array.isArray(p.componentes.telas)) ? p.componentes.telas : [];
    const otros = (p.componentes && Array.isArray(p.componentes.otros)) ? p.componentes.otros : [];
    const telasTotal = telas.reduce((acc, t) => acc + (Number(t?.costoMaterial) || 0), 0);
    // Excluye ítems marcados como confección del subtotal de otros
    const otrosTotal = otros
      .filter(o => !o?.tagConfeccion)
      .reduce((acc, o) => acc + ((Number(o?.unidades) || 0) * (Number(o?.precioUnitario) || 0)), 0);
    const sum = telasTotal + otrosTotal;
    if (sum > 0) return Math.round(sum * 100) / 100;
    if (p.price > 0) return Math.round(Number(p.price) * 100) / 100;
    return 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!category || !productId || qtyNum <= 0 || priceNum <= 0) return;
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    if (!productId) return;
    setSubmitting(true);
    const normalizeName = (n) => {
      if (!n) return null;
      const t = String(n).trim();
      if (!t) return null;
      return t.charAt(0).toUpperCase() + t.slice(1);
    };
    const newSale = {
      productId: String(productId),
      quantity: qtyNum,
      date,
      customerName: normalizeName(customerName),
      unitPrice: priceNum,
      gananciaUnit: gananciaNum,
      total,
      paymentMethod
    };
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSale)
      });
      if (!response.ok) throw new Error('Error creating sale');
      // Descontar stock
      try {
        if (selectedProduct && typeof selectedProduct.available === 'number') {
          const newAvailable = Math.max((selectedProduct.available || 0) - qtyNum, 0);
          const updated = { ...selectedProduct, available: newAvailable };
          await fetch(`/api/products/${selectedProduct.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
          });
        }
      } catch (err) { console.warn('No se pudo actualizar el stock:', err); }
      // Refrescar productos para reflejar stock actualizado
      await reloadProducts();

      // Reset
      setShowConfirm(false);
      setCategory('');
      setProductId('');
      setQuantity('1');
      setDate(new Date().toISOString().split('T')[0]);
      setCustomerName('');
      setUnitPrice('');
      setPaymentMethod('Efectivo');
      if (onSaleAdded) onSaleAdded();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    // Al cambiar el producto, sugerir precio
    setUnitPrice(prev => {
      const suggested = computeProductCurrentTotal(selectedProduct);
      return suggested || prev || '';
    });
    setGananciaUnit(prev => {
      const suggested = Number(selectedProduct?.costoConfeccion) || 0;
      return suggested || prev || '';
    });
  }, [productId]);

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1500
  };
  const modalStyle = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 20, borderRadius: 8, zIndex: 1501, width: '90%', maxWidth: 520
  };
  const [confirmClosing, setConfirmClosing] = useState(false);
  const overlayFade = (closing) => ({ ...overlayStyle, opacity: closing ? 0 : 1, transition: 'opacity 180ms ease' });
  const modalAnim = (closing) => ({ ...modalStyle, opacity: closing ? 0 : 1, transform: `translate(-50%, -50%) ${closing ? 'scale(0.98)' : 'scale(1)'}`, transition: 'opacity 180ms ease, transform 180ms ease' });
  const closeConfirm = () => { setConfirmClosing(true); setTimeout(()=>{ setShowConfirm(false); setConfirmClosing(false); }, 180); };

  return (
    <div className="form-container">
      <form onSubmit={handleSubmit}>
        <h2>Registrar Venta</h2>

        <div className="form-group">
          <label className="form-label">Categoría</label>
          <select
            className="form-input"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setProductId(''); }}
            required
          >
            <option value="">Seleccione una categoría</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Producto</label>
          <select
            className="form-input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            disabled={!category}
            style={{ opacity: category ? 1 : 0.5, cursor: category ? 'pointer' : 'not-allowed' }}
          >
            <option value="">{category ? 'Seleccione un producto' : 'Seleccione una categoría primero'}</option>
            {filteredProducts.map(product => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
          {selectedProduct && (
            <p style={{ marginTop: 4, color: '#555' }}>
              Disponible: {selectedProduct.available ?? '—'}
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Cantidad</label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Precio</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Confección (ganancia)</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={gananciaUnit}
            onChange={(e) => setGananciaUnit(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cliente</label>
          <input
            className="form-input"
            type="text"
            placeholder="Nombre del cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input
            className="form-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Medio de pago</label>
          <select
            className="form-input"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Tarjeta</option>
            <option>Otro</option>
          </select>
        </div>

        <div className="form-group" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="form-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Registrar Venta'}
          </button>
        </div>
      </form>

      {showConfirm && (
        <>
          <div style={overlayFade(confirmClosing)} onClick={closeConfirm} />
          <div style={modalAnim(confirmClosing)}>
            <h3 style={{ marginTop: 0 }}>Confirmar registro de venta</h3>
            <div style={{ marginBottom: 12 }}>
              <p><strong>Producto:</strong> {selectedProduct?.name || productId}</p>
              <p><strong>Categoría:</strong> {category}</p>
              <p><strong>Cantidad:</strong> {qtyNum}</p>
              <p><strong>Precio Unit:</strong> ${priceNum.toFixed(2)}</p>
              <p><strong>Ganancia Unit:</strong> ${gananciaNum.toFixed(2)}</p>
              <p><strong>Total:</strong> {(qtyNum * (priceNum + gananciaNum)).toFixed(2)}</p>
              <p><strong>Cliente:</strong> {customerName || '—'}</p>
              <p><strong>Fecha:</strong> {date}</p>
              <p><strong>Medio de pago:</strong> {paymentMethod}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeConfirm}>Cancelar</button>
              <button onClick={confirmSubmit} disabled={submitting}>{submitting ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SaleForm;
