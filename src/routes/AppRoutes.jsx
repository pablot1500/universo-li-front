import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { useAuth } from '../auth/useAuth';
import ProtectedRoute from '../components/ProtectedRoute';
import ComponentsPage from '../pages/ComponentsPage';
import ProductsPage from '../pages/ProductsPage';
import SalesPage from '../pages/SalesPage';
import StatsPage from '../pages/StatsPage';
import LoginPage from '../pages/LoginPage';
import tituloUniversoli from '../assets/titulo_universoli.png';

const AppShell = () => {
  const { logout } = useAuth();

  return (
    <ProtectedRoute>
      <div className="layout-container">
        <img src={tituloUniversoli} alt="Planilla Universo LI" className="page-title" />
        <nav className="nav-buttons">
          <Link className="nav-button" to="/components">Componentes</Link>
          <Link className="nav-button" to="/products">Productos</Link>
          <Link className="nav-button" to="/sales">Ventas</Link>
          <Link className="nav-button" to="/stats">Estadísticas</Link>
        </nav>
        <main className="layout-main">
          <Routes>
            <Route path="/components" element={<ComponentsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/" element={<ComponentsPage />} />
          </Routes>
        </main>
        <footer className="layout-footer">
          <button className="logout-button" type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </footer>
      </div>
    </ProtectedRoute>
  );
};

const AppRoutes = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default AppRoutes;
