import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ComponentsPage from '../pages/ComponentsPage';
import ProductsPage from '../pages/ProductsPage';
import SalesPage from '../pages/SalesPage';
import StatsPage from '../pages/StatsPage';
import tituloUniversoli from '../assets/titulo_universoli.png';

const AppRoutes = () => {
  return (
    <Router>
      <img src={tituloUniversoli} alt="Planilla Universo LI" className="page-title" />
      <nav className="nav-buttons">
        <Link className="nav-button" to="/components">Componentes</Link>
        <Link className="nav-button" to="/products">Productos</Link>
        <Link className="nav-button" to="/sales">Ventas</Link>
        <Link className="nav-button" to="/stats">Estadísticas</Link>
      </nav>
      <Routes>
        <Route path="/components" element={<ComponentsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/" element={<ComponentsPage />} />
      </Routes>
    </Router>
  );
};

export default AppRoutes;
