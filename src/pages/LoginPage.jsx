import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import tituloUniversoli from '../assets/titulo_universoli.png';
import { useAuth } from '../auth/useAuth';

const LoginPage = () => {
  const { authenticated, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const redirectTo = location.state?.from?.pathname || '/components';

  if (!loading && authenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ username, password });
      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <img src={tituloUniversoli} alt="Universo LI" className="login-logo" />
      <form className="login-panel" onSubmit={handleSubmit}>
        <h1>Ingresar</h1>
        <label>
          Usuario
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label>
          Clave
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="login-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Ingresando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
