import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const tokenRef = useRef(null);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const login = useCallback((token, userData) => {
    setAccessToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try { await axiosInstance.post('/v1/auth/logout'); } catch (_) {}
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => { setAccessToken(null); setUser(null); }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
