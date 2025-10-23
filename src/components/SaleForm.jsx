

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { buildProductMap, computeProductCostSummary } from '../utils/productCosting';

const DEFAULT_SALE_QUANTITY = 1;

const SaleForm = ({ onSaleAdded }) => {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('');

  // Campos de la venta
  const [productId, setProductId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [gananciaUnit, setGananciaUnit] = useState('');
  const [realSaleValue, setRealSaleValue] = useState('');
  const [paymentReceived, setPaymentReceived] = useState('0');
  const [paymentPending, setPaymentPending] = useState('0');
  const [paymentNotes, setPaymentNotes] = useState('');
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
  const productMap = useMemo(() => buildProductMap(products), [products]);
  const selectedSummary = useMemo(() => {
    if (!selectedProduct) return null;
    return computeProductCostSummary(selectedProduct, productMap);
  }, [selectedProduct, productMap]);
  const isCompositeSelected = selectedSummary?.isComposite || false;
  const compositeBreakdown = isCompositeSelected ? (selectedSummary?.breakdown || []) : [];

  const qtyNum = DEFAULT_SALE_QUANTITY;
  const priceNum = Number(unitPrice) || 0;
  const gananciaNum = Number(gananciaUnit) || 0;
  const realSaleValueNum = Number(realSaleValue) || 0;
  const total = Math.max(qtyNum * (priceNum + gananciaNum), 0);
  const parseMoneyInput = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const roundMoney = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
  };
  const toInputString = (value) => {
    const rounded = roundMoney(value);
    if (!Number.isFinite(rounded)) return '0';
    const str = String(rounded);
    return str;
  };
  const approxEqual = (a, b) => Math.abs(a - b) < 0.01;

  const saleTotalValue = realSaleValue === '' ? total : realSaleValueNum;

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

  useEffect(() => {
    const totalValue = saleTotalValue;
    if (!Number.isFinite(totalValue)) return;
    setPaymentPending(prev => {
      const prevNum = parseMoneyInput(prev);
      const receivedNum = parseMoneyInput(paymentReceived);
      const nextPending = Math.max(roundMoney(totalValue - receivedNum), 0);
      if (approxEqual(prevNum, nextPending)) return prev;
      return toInputString(nextPending);
    });
  }, [saleTotalValue, paymentReceived]);

  const handlePaymentReceivedChange = (e) => {
    const value = e.target.value;
    setPaymentReceived(value);
    const totalValue = saleTotalValue;
    if (!Number.isFinite(totalValue)) return;
    const receivedNum = parseMoneyInput(value);
    const nextPending = Math.max(roundMoney(totalValue - receivedNum), 0);
    setPaymentPending(toInputString(nextPending));
  };

  const handlePaymentPendingChange = (e) => {
    const value = e.target.value;
    setPaymentPending(value);
    const totalValue = saleTotalValue;
    if (!Number.isFinite(totalValue)) return;
    const pendingNum = parseMoneyInput(value);
    const nextReceived = Math.max(roundMoney(totalValue - pendingNum), 0);
    setPaymentReceived(toInputString(nextReceived));
  };

  const saleTotalRounded = roundMoney(saleTotalValue);
  const normalizedPaymentReceived = (() => {
    const raw = roundMoney(parseMoneyInput(paymentReceived));
    if (saleTotalRounded > 0) {
      return Math.min(raw, saleTotalRounded);
    }
    return raw;
  })();
  const normalizedPaymentPending = (() => {
    if (saleTotalRounded > 0) {
      return Math.max(roundMoney(saleTotalRounded - normalizedPaymentReceived), 0);
    }
    return roundMoney(parseMoneyInput(paymentPending));
  })();
  const paymentStatus = (() => {
    if (saleTotalRounded <= 0) {
      if (normalizedPaymentReceived > 0) return 'Pagado';
      if (normalizedPaymentPending > 0) return 'Pendiente de Pago';
      return 'Pagado';
    }
    if (approxEqual(normalizedPaymentReceived, saleTotalRounded)) return 'Pagado';
    if (approxEqual(normalizedPaymentReceived, 0)) return 'Pendiente de Pago';
    return 'Pago parcial';
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!category || !productId || priceNum <= 0) return;
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
      paymentMethod,
      realSaleValue: realSaleValue === '' ? null : realSaleValueNum,
      paymentReceived: normalizedPaymentReceived,
      paymentPending: normalizedPaymentPending,
      paymentNotes: paymentNotes.trim() ? paymentNotes.trim() : null
    };
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSale)
      });
      if (!response.ok) throw new Error('Error creating sale');
      await reloadProducts();

      // Reset
      setShowConfirm(false);
      setCategory('');
      setProductId('');
      setDate(new Date().toISOString().split('T')[0]);
      setCustomerName('');
      setUnitPrice('');
      setGananciaUnit('');
      setRealSaleValue('');
      setPaymentMethod('Efectivo');
      setPaymentReceived('0');
      setPaymentPending('0');
      setPaymentNotes('');
      if (onSaleAdded) onSaleAdded();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!selectedProduct) return;

    if (isCompositeSelected && selectedSummary) {
      const costValue = toInputString(selectedSummary.costMaterials);
      const gainValue = toInputString(selectedSummary.estimatedGain);
      setUnitPrice(costValue);
      setGananciaUnit(gainValue);
      return;
    }

    // Al cambiar el producto simple, sugerir precio y ganancia si existen valores cargados
    setUnitPrice(prev => {
      const suggested = computeProductCurrentTotal(selectedProduct);
      if (Number.isFinite(suggested) && suggested > 0) {
        return toInputString(suggested);
      }
      return prev || '';
    });
    setGananciaUnit(prev => {
      const suggested = Number(selectedProduct?.costoConfeccion) || 0;
      if (suggested > 0) {
        return toInputString(suggested);
      }
      return prev || '';
    });
  }, [selectedProduct, isCompositeSelected, selectedSummary]);

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1700
  };
  const modalStyle = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', padding: 20, borderRadius: 8, zIndex: 1701, width: '90%', maxWidth: 520
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
        </div>

        <div className="form-group">
          <label className="form-label">Costo materiales</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => {
              if (isCompositeSelected) return;
              setUnitPrice(e.target.value);
            }}
            required
            readOnly={isCompositeSelected}
            style={{
              ...(isCompositeSelected ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {})
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Ganancia estimada (confección)</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={gananciaUnit}
            onChange={(e) => {
              if (isCompositeSelected) return;
              setGananciaUnit(e.target.value);
            }}
            readOnly={isCompositeSelected}
            style={{
              ...(isCompositeSelected ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {})
            }}
          />
        </div>

        {isCompositeSelected && compositeBreakdown.length > 0 && (
          <div
            className="form-group"
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: 12,
              display: 'grid',
              gap: 8
            }}
          >
            <div style={{ fontWeight: 600 }}>
              Desglose por producto (valores unitarios)
            </div>
            {compositeBreakdown.map((item, index) => (
              <div
                key={`${item.id ?? item.name ?? 'item'}-${index}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <span>{item.name || `Producto ${item.id}`}</span>
                <span style={{ fontSize: 13, color: '#4b5563' }}>
                  Costo materiales: ${roundMoney(item.costMaterials).toFixed(2)} — Ganancia estimada: ${roundMoney(item.estimatedGain).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Valor venta real</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={realSaleValue}
            onChange={(e) => setRealSaleValue(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Pago recibido</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={paymentReceived}
            onChange={handlePaymentReceivedChange}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Pago pendiente</label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={paymentPending}
            onChange={handlePaymentPendingChange}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Observaciones forma de pago</label>
          <textarea
            className="form-input"
            rows={2}
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder="Notas sobre cobro, plazos, etc."
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
            <option>Tarjeta de Regalo</option>
            <option>Otro</option>
          </select>
        </div>

        <div className="form-group" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="form-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Registrar Venta'}
          </button>
        </div>
      </form>

      {showConfirm && typeof document !== 'undefined' && createPortal(
        <>
          <div style={overlayFade(confirmClosing)} onClick={closeConfirm} />
          <div style={modalAnim(confirmClosing)}>
            <h3 style={{ marginTop: 0 }}>Confirmar registro de venta</h3>
            <div style={{ marginBottom: 12 }}>
              <p><strong>Producto:</strong> {selectedProduct?.name || productId}</p>
              <p><strong>Categoría:</strong> {category}</p>
              <p><strong>Cantidad:</strong> {qtyNum}</p>
              <p><strong>Costo materiales:</strong> ${priceNum.toFixed(2)}</p>
              <p><strong>Ganancia estimada (confección):</strong> ${gananciaNum.toFixed(2)}</p>
              <p><strong>Costo total producto:</strong> {total.toFixed(2)}</p>
              <p><strong>Valor venta real:</strong> {realSaleValue === '' ? '—' : `$${realSaleValueNum.toFixed(2)}`}</p>
              <p><strong>Pago recibido:</strong> ${normalizedPaymentReceived.toFixed(2)}</p>
              <p><strong>Pago pendiente:</strong> ${normalizedPaymentPending.toFixed(2)}</p>
              <p><strong>Estado del pago:</strong> {paymentStatus}</p>
              <p><strong>Ganancia real:</strong> {realSaleValue === ''
                ? '—'
                : `$${(realSaleValueNum - total).toFixed(2)}`}</p>
              <p><strong>Cliente:</strong> {customerName || '—'}</p>
              <p><strong>Fecha:</strong> {date}</p>
              <p><strong>Medio de pago:</strong> {paymentMethod}</p>
              <p><strong>Observaciones forma de pago:</strong> {paymentNotes.trim() ? paymentNotes.trim() : '—'}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeConfirm}>Cancelar</button>
              <button onClick={confirmSubmit} disabled={submitting}>{submitting ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default SaleForm;
