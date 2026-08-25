import React, { useEffect, useRef, useState } from 'react';

const buildInitialFormData = (initialValues = {}) => ({
  name: '',
  price: '',
  category: '',
  available: '',
  link: '',
  unitDivisor: 1,
  ...(initialValues || {})
});

const errorStyle = {
  color: '#b42318',
  display: 'block',
  fontSize: '14px',
  marginTop: '6px'
};

const ComponentForm = ({ mode, initialValues = {}, onComponentSubmit }) => {
  // El formulario se desmonta al cerrar el modal, por lo que los valores
  // iniciales sólo deben aplicarse al abrirlo. Volver a aplicarlos en cada
  // render del padre borra lo escrito, especialmente durante el scroll móvil.
  const [formData, setFormData] = useState(() => buildInitialFormData(initialValues));
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fieldRefs = useRef({});

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
    setErrors(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSubmitError('');
  };

  const validateForm = () => {
    const nextErrors = {};
    const name = formData.name.trim();
    const category = formData.category.trim();
    const price = Number(formData.price);
    const available = Number(formData.available);
    const unitDivisor = Number(formData.unitDivisor);

    if (!name) nextErrors.name = 'Ingresá el nombre del componente.';
    if (formData.price === '' || !Number.isFinite(price) || price < 0) {
      nextErrors.price = 'Ingresá un precio válido.';
    }
    if (!category) nextErrors.category = 'Ingresá la categoría.';
    if (formData.available === '' || !Number.isFinite(available) || available < 0) {
      nextErrors.available = 'Ingresá la cantidad disponible.';
    }
    if (!Number.isInteger(unitDivisor) || unitDivisor <= 0) {
      nextErrors.unitDivisor = 'Ingresá un divisor entero mayor que cero.';
    }

    return nextErrors;
  };

  const focusFirstInvalidField = (nextErrors) => {
    const firstInvalidField = ['name', 'unitDivisor', 'price', 'category', 'available']
      .find(fieldName => nextErrors[fieldName]);
    const field = fieldRefs.current[firstInvalidField];
    if (!field) return;

    window.requestAnimationFrame(() => {
      field.focus({ preventScroll: true });
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validateForm();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError('Revisá los campos marcados antes de guardar.');
      focusFirstInvalidField(nextErrors);
      return;
    }

    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      await onComponentSubmit({
        name: formData.name.trim(),
        price: Number(formData.price),
        category: formData.category.trim(),
        available: Number(formData.available),
        link: formData.link.trim(),
        unitDivisor: Number(formData.unitDivisor)
      });
    } catch (error) {
      console.error('Error saving component:', error);
      setSubmitError(error?.message || 'No se pudo guardar el componente. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2>
        {mode === 'edit' ? 'Editar Componente' : mode === 'copy' ? 'Copiar Componente' : 'Agregar Componente'}
      </h2>
      {submitError ? (
        <div
          role="alert"
          style={{ ...errorStyle, background: '#fff1f0', border: '1px solid #fda29b', borderRadius: 6, padding: '10px 12px', marginBottom: 16 }}
        >
          {submitError}
        </div>
      ) : null}
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="component-name" style={{ display: 'block', marginBottom: 6 }}>Nombre:</label>
        <input
          id="component-name"
          name="name"
          ref={element => { fieldRefs.current.name = element; }}
          value={formData.name}
          onChange={handleChange}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'component-name-error' : undefined}
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
        {errors.name ? <span id="component-name-error" style={errorStyle}>{errors.name}</span> : null}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="component-unit-divisor" style={{ display: 'block', marginBottom: 6 }}>Divisor del precio (fijo):</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="component-unit-divisor"
            name="unitDivisor"
            ref={element => { fieldRefs.current.unitDivisor = element; }}
            type="number"
            min="1"
            step="1"
            value={formData.unitDivisor ?? 1}
            onChange={handleChange}
            aria-invalid={Boolean(errors.unitDivisor)}
            aria-describedby={errors.unitDivisor ? 'component-unit-divisor-error' : undefined}
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
        {errors.unitDivisor ? <span id="component-unit-divisor-error" style={errorStyle}>{errors.unitDivisor}</span> : null}
        <div style={{ marginTop: 8, color: '#555' }}>
          Precio efectivo usado en productos: $ {(() => {
            const p = Number(formData.price);
            const d = Number(formData.unitDivisor) || 1;
            return Number.isFinite(p) ? (p / (d > 0 ? d : 1)).toFixed(2) : '0.00';
          })()}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="component-price" style={{ display: 'block', marginBottom: 6 }}>
          {(formData.category || '').toLowerCase() === 'telas' ? 'Precio por Metro:' : 'Precio unitario:'}
        </label>
        <input
          id="component-price"
          name="price"
          ref={element => { fieldRefs.current.price = element; }}
          type="number"
          min="0"
          step="0.01"
          value={formData.price}
          onChange={handleChange}
          aria-invalid={Boolean(errors.price)}
          aria-describedby={errors.price ? 'component-price-error' : undefined}
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
        {errors.price ? <span id="component-price-error" style={errorStyle}>{errors.price}</span> : null}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="component-category" style={{ display: 'block', marginBottom: 6 }}>Categoría:</label>
        <input
          id="component-category"
          name="category"
          ref={element => { fieldRefs.current.category = element; }}
          value={formData.category}
          onChange={handleChange}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? 'component-category-error' : undefined}
          onFocus={() => {
            setFilteredCategories(categories);
            setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
        {errors.category ? <span id="component-category-error" style={errorStyle}>{errors.category}</span> : null}
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
        <label htmlFor="component-available" style={{ display: 'block', marginBottom: 6 }}>
          {(formData.category || '').toLowerCase() === 'telas' ? 'Cantidad Disponible (metros):' : 'Cantidad Disponible:'}
        </label>
        <input
          id="component-available"
          name="available"
          ref={element => { fieldRefs.current.available = element; }}
          type="number"
          min="0"
          step="0.01"
          value={formData.available}
          onChange={handleChange}
          aria-invalid={Boolean(errors.available)}
          aria-describedby={errors.available ? 'component-available-error' : undefined}
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
        {errors.available ? <span id="component-available-error" style={errorStyle}>{errors.available}</span> : null}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="component-link" style={{ display: 'block', marginBottom: 6 }}>Link Casanacho:</label>
        <input
          id="component-link"
          name="link"
          value={formData.link}
          onChange={handleChange}
          placeholder="https://www.casanacho.com.ar/..."
          style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        style={{ padding: '12px 16px', fontSize: '16px', width: '100%' }}
      >
        {isSubmitting ? 'Guardando...' : mode === 'edit' ? 'Actualizar' : 'Guardar'}
      </button>
    </form>
  );
};

export default ComponentForm;
