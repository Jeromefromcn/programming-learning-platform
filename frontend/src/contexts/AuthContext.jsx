import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';
import { authApi } from '../api/authApi';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const tokenRef = useRef(null);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  // Silently restore session from HttpOnly refresh cookie on mount
  useEffect(() => {
    authApi.refresh()
      .then(async ({ accessToken: tok, user: userData }) => {
        tokenRef.current = tok;
        setAccessToken(tok);
        setUser(userData);
        try {
          const data = await settingsApi.getMenuConfig();
          setMenuSections(data.sections);
        } catch {
          const fallback = SECTIONS
            .filter(s => s.roles.includes(userData.role))
            .map(s => s.key);
          setMenuSections(fallback);
        }
      })
      .catch(() => {
        // No valid session — user must log in
      })
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (token, userData) => {
    tokenRef.current = token;
    setAccessToken(token);
    setUser(userData);
    try {
      const data = await settingsApi.getMenuConfig();
      setMenuSections(data.sections);
    } catch {
      const fallback = SECTIONS
        .filter(s => s.roles.includes(userData.role))
        .map(s => s.key);
      setMenuSections(fallback);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await axiosInstance.post('/v1/auth/logout'); } catch (_) {}
    setAccessToken(null);
    setUser(null);
    setMenuSections([]);
  }, []);

  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/login') {
          sessionStorage.setItem('returnUrl', currentPath);
        }
        toast.error('Your session has expired. Please log in again.');
        setAccessToken(null);
        setUser(null);
        setMenuSections([]);
      }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, menuSections, login, logout, initializing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
