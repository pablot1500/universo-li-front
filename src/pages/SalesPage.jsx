

import React, { useState } from 'react';
import SaleForm from '../components/SaleForm';
import SaleList from '../components/SaleList';

const SalesPage = () => {
  const [refresh, setRefresh] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  };
  const addModalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    zIndex: 1001,
    width: '80%',
    maxWidth: '500px',
  };
  const closeButtonStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
  };
  const fabStyle = {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'rgba(248,168,201,0.7)',
    color: '#fff',
    fontSize: '36px',
    border: 'none',
    cursor: 'pointer',
    zIndex: 1001,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const handleSaleAdded = () => {
    setShowModal(false);
    setRefresh(prev => prev + 1);
  };

  const handleOpenAdd = () => setShowModal(true);

  return (
    <div>
      <h1>Gestor de Ventas</h1>

      {/* Modal para registrar venta */}
      {showModal && (
        <>
          <div style={overlayStyle} onClick={() => setShowModal(false)} />
          <div style={addModalStyle}>
            <button style={closeButtonStyle} onClick={() => setShowModal(false)}>X</button>
            <SaleForm onSaleAdded={handleSaleAdded} />
          </div>
        </>
      )}

      {/* Tabla de ventas realizadas */}
      <SaleList key={refresh} />

      {/* Botón flotante para abrir el alta */}
      <button style={fabStyle} onClick={handleOpenAdd}>+</button>
    </div>
  );
};

export default SalesPage;
