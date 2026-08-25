import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthSession, login as loginRequest, logout as logoutRequest } from '../services/authService';
import { AuthContext } from './authContextValue';

export const AuthProvider = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getAuthSession();
      setAuthenticated(session.authenticated === true);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (credentials) => {
    await loginRequest(credentials);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => {});
    setAuthenticated(false);
  }, []);

  const value = useMemo(() => ({
    authenticated,
    loading,
    login,
    logout,
    refreshSession
  }), [authenticated, loading, login, logout, refreshSession]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
