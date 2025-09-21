import React, { useState, useEffect } from 'react';

const ComponentForm = ({ mode, initialValues = {}, onComponentSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: '',
    available: '',
    link: '',
    unitDivisor: 1,
    ...initialValues
  });
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setFormData({
      name: '',
      price: '',
      category: '',
      available: '',
      link: '',
      unitDivisor: 1,
      ...initialValues
    });
  }, [initialValues]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/components');
        if (res.ok) {
          const data = await res.json();
          const cats = Array.from(new Set(data.map(c => c.category).filter(Boolean)));
          setCategories(cats);
        }
      } catch (error) {
        console.error('Error fetching component categories:', error);
      }
    };
    fetchCategories();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'category') {
      const filtered = categories.filter(cat =>
        cat.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredCategories(filtered);
      setShowSuggestions(true);
    }
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onComponentSubmit({
      name: formData.name,
      price: parseFloat(formData.price),
      category: formData.category,
      available: parseFloat(formData.available),
      link: formData.link,
      unitDivisor: Number.isFinite(Number(formData.unitDivisor)) && Number(formData.unitDivisor) > 0 ? Number(formData.unitDivisor) : 1
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>
        {mode === 'edit' ? 'Editar Componente' : mode === 'copy' ? 'Copiar Componente' : 'Agregar Componente'}
      </h2>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Nombre:</label>
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Divisor del precio (fijo):</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            name="unitDivisor"
            type="number"
            min="1"
            step="1"
            value={formData.unitDivisor ?? 1}
            onChange={handleChange}
            style={{ width: 120, padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {[10, 20, 50, 100].map((v) => (
              <button type="button" key={v} onClick={() => setFormData(prev => ({ ...prev, unitDivisor: v }))}>
                /{v}
              </button>
            ))}
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, unitDivisor: 1 }))}>
              Quitar divisor
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, color: '#555' }}>
          Precio efectivo usado en productos: $ {(() => {
            const p = Number(formData.price);
            const d = Number(formData.unitDivisor) || 1;
            return Number.isFinite(p) ? (p / (d > 0 ? d : 1)).toFixed(2) : '0.00';
          })()}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          {(formData.category || '').toLowerCase() === 'telas' ? 'Precio por Metro:' : 'Precio unitario:'}
        </label>
        <input
          name="price"
          type="number"
          step="0.01"
          value={formData.price}
          onChange={handleChange}
          required
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Categoría:</label>
        <input
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
          onFocus={() => {
            setFilteredCategories(categories);
            setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
        {showSuggestions && filteredCategories.length > 0 && (
          <ul style={{
            border: '1px solid #ccc',
            maxHeight: '100px',
            overflowY: 'auto',
            margin: 0,
            marginTop: '16px',
            padding: '0 8px',
            listStyle: 'none'
          }}>
            {filteredCategories.map((cat, idx) => (
              <li
                key={idx}
                style={{ padding: '4px 0', cursor: 'pointer' }}
                onMouseDown={() => {
                  setFormData(prev => ({ ...prev, category: cat }));
                  setShowSuggestions(false);
                }}
              >
                {cat}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          {(formData.category || '').toLowerCase() === 'telas' ? 'Cantidad Disponible (metros):' : 'Cantidad Disponible:'}
        </label>
        <input
          name="available"
          type="number"
          min="0"
          step="0.01"
          value={formData.available}
          onChange={handleChange}
          required
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Link Casanacho:</label>
        <input
          name="link"
          value={formData.link}
          onChange={handleChange}
          placeholder="https://www.casanacho.com.ar/..."
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>
      <button
        type="submit"
        style={{ padding: '12px 16px', fontSize: '16px', width: '100%' }}
      >
        {mode === 'edit' ? 'Actualizar' : 'Guardar'}
      </button>
    </form>
  );
};

export default ComponentForm;
