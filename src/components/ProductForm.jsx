import React, { useState, useEffect } from 'react';

const LOCKED_COMPOSITE_CATEGORY = 'Set / Conjuntos';

const ProductForm = ({ mode, initialValues = {}, onProductSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    type: 'simple',
    ...initialValues
  });
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const nextType = initialValues?.type || 'simple';
    const base = {
      name: '',
      category: '',
      type: nextType,
      ...initialValues
    };
    if (nextType === 'composite') {
      base.category = LOCKED_COMPOSITE_CATEGORY;
    }
    setFormData(base);
  }, [initialValues]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          const cats = Array.from(new Set(data.map(p => p.category).filter(Boolean)));
          setCategories(cats);
        }
      } catch (error) {
        console.error('Error fetching product categories:', error);
      }
    };
    fetchCategories();
  }, []);

  const effectiveType = formData?.type || 'simple';
  const isComposite = effectiveType === 'composite';

  useEffect(() => {
    if (isComposite) {
      setShowSuggestions(false);
    }
  }, [isComposite]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'category') {
      if (isComposite) {
        setShowSuggestions(false);
        return;
      }
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
    onProductSubmit({
      name: formData.name,
      category: formData.category,
      type: effectiveType,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>
        {mode === 'edit' ? 'Editar Producto' : mode === 'copy' ? 'Copiar Producto' : 'Agregar Producto'}
      </h2>
      <div style={{ marginBottom: '16px' }}>
        <label>Tipo de producto:</label>
        <input
          value={isComposite ? 'Producto compuesto (set)' : 'Producto simple'}
          readOnly
          style={{ backgroundColor: '#f5f5f5' }}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label>Nombre:</label>
        <input name="name" value={formData.name} onChange={handleChange} required />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label>Categoría:</label>
        <input
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
          disabled={isComposite}
          onFocus={() => {
            if (isComposite) return;
            setFilteredCategories(categories);
            setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
        />
        {!isComposite && showSuggestions && filteredCategories.length > 0 && (
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
      <button
        type="submit"
        style={{ padding: '12px 16px', fontSize: '16px', width: '100%' }}
      >
        {mode === 'edit' ? 'Actualizar' : 'Guardar'}
      </button>
    </form>
  );
};

export default ProductForm;
