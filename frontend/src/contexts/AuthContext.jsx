import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const tokenRef = useRef(null);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

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
      () => { setAccessToken(null); setUser(null); setMenuSections([]); }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, menuSections, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
