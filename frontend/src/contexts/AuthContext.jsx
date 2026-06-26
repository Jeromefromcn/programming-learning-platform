import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import axiosInstance, { setAuthHandlers, resolveReauthQueue, rejectReauthQueue } from '../api/axiosInstance';
import { authApi } from '../api/authApi';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [reauthVisible, setReauthVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const tokenRef = useRef(null);
  const reauthDismissedRef = useRef(false);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

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
      .catch(() => {})
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
    rejectReauthQueue();
    reauthDismissedRef.current = false;
    setReauthVisible(false);
    setConfirmVisible(false);
    setAccessToken(null);
    setUser(null);
    setMenuSections([]);
  }, []);

  const onReauthSuccess = useCallback(async (token, userData) => {
    tokenRef.current = token;
    setAccessToken(token);
    setUser(userData);
    reauthDismissedRef.current = false;
    setReauthVisible(false);
    resolveReauthQueue(token);
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

  const onReauthCancel = useCallback(() => {
    reauthDismissedRef.current = true;
    setReauthVisible(false);
    rejectReauthQueue();
  }, []);

  const onConfirmLogin = useCallback(() => {
    setConfirmVisible(false);
    setReauthVisible(true);
  }, []);

  const onConfirmCancel = useCallback(() => {
    setConfirmVisible(false);
    rejectReauthQueue();
  }, []);

  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => {
        tokenRef.current = null;
        flushSync(() => {
          setAccessToken(null);
          if (!reauthDismissedRef.current) {
            setReauthVisible(true);
          } else {
            setConfirmVisible(true);
          }
        });
      }
    );
  }, []);

  return (
    <AuthContext.Provider value={{
      user, accessToken, menuSections, login, logout, initializing,
      reauthVisible, confirmVisible,
      onReauthSuccess, onReauthCancel, onConfirmLogin, onConfirmCancel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
