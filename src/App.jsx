// src/App.jsx
import { useEffect, useState } from 'react';

const money = (v) => {
  if (v == null) return '-';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(v));
  } catch {
    return String(v);
  }
};

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/productos');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setItems(json);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Error desconocido');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Cargando productos…</div>;
  if (error) return <div style={{ padding: 20, color: 'crimson' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>Productos</h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
        marginTop: 12
      }}>
        {items.length === 0 && <div>No hay productos</div>}
        {items.map((p, i) => (
          <article key={p.id ?? i} style={{
            border: '1px solid #eee', borderRadius: 8, padding: 12, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            {p.image && <img src={p.image} alt={p.name || 'producto'} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6 }} />}
            <h3 style={{ margin: '8px 0 4px' }}>{p.name || p.title || 'Sin nombre'}</h3>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              {p.category && <span style={{ marginRight: 8 }}>{p.category}</span>}
              {typeof p.available !== 'undefined' && <span>Stock: {p.available}</span>}
            </div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {money(p?.pricing?.totalProducto ?? p?.price ?? p?.precio)}
            </div>
            {p.comment && <p style={{ fontSize: 13, color: '#444', margin: 0 }}>{p.comment}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}