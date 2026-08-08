import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/**
 * Single provider for the things nearly every screen needs: the signed-in user,
 * their favourites, the visitor's location, theme, and toasts.
 */
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState(null);
  const [position, setPosition] = useState(null);
  const [favourites, setFavourites] = useState(new Set());
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem('bf.theme') ||
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  const toastId = useRef(0);

  const toast = useCallback((message) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---- theme ---------------------------------------------------------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bf.theme', theme);
  }, [theme]);

  /* ---- bootstrap ------------------------------------------------------- */
  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});

    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  /* ---- the visitor's location ------------------------------------------ */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, real: true }),
      () => {
        /* Denied or unavailable — the demo city centre is used instead. */
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  // Fall back to the seeded city so distances and the map always make sense.
  const origin = useMemo(
    () => position ?? (meta ? { ...meta.center, real: false } : null),
    [position, meta],
  );

  /* ---- favourites + notifications --------------------------------------- */
  const refreshFavourites = useCallback(async () => {
    if (!getToken()) return setFavourites(new Set());
    try {
      const { businesses } = await api.favourites();
      setFavourites(new Set(businesses.map((b) => b.id)));
    } catch {
      /* signed out mid-flight */
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!getToken()) return setNotifications([]);
    try {
      const { notifications } = await api.notifications();
      setNotifications(notifications);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setFavourites(new Set());
      setNotifications([]);
      return;
    }
    refreshFavourites();
    refreshNotifications();
  }, [user, refreshFavourites, refreshNotifications]);

  const toggleFavourite = useCallback(
    async (business) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      const on = favourites.has(business.id);
      // Optimistic — a saved place should feel instant.
      setFavourites((prev) => {
        const next = new Set(prev);
        on ? next.delete(business.id) : next.add(business.id);
        return next;
      });
      try {
        on ? await api.removeFavourite(business.id) : await api.addFavourite(business.id);
        toast(on ? `Removed ${business.name}` : `Saved ${business.name} — we'll tell you when they post`);
        refreshNotifications();
      } catch (err) {
        setFavourites((prev) => {
          const next = new Set(prev);
          on ? next.add(business.id) : next.delete(business.id);
          return next;
        });
        toast(err.message);
      }
    },
    [user, favourites, toast, refreshNotifications],
  );

  /* ---- auth ------------------------------------------------------------- */
  const signIn = useCallback(
    async (credentials, mode = 'login') => {
      const { user, token } = mode === 'register' ? await api.register(credentials) : await api.login(credentials);
      setToken(token);
      setUser(user);
      setAuthOpen(false);
      toast(`Welcome${mode === 'register' ? '' : ' back'}, ${user.name.split(' ')[0]}`);
      return user;
    },
    [toast],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    toast('Signed out');
  }, [toast]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  // Stable identity — screens put this in effect dependency arrays.
  const markNotificationsSeen = useCallback(async () => {
    if (!user || !unreadCount) return;
    await api.markNotificationsSeen().catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, unread: false })));
  }, [user, unreadCount]);

  const value = {
    user,
    ready,
    meta,
    origin,
    hasRealLocation: Boolean(position),
    favourites,
    toggleFavourite,
    refreshFavourites,
    notifications,
    unreadCount,
    refreshNotifications,
    markNotificationsSeen,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    toast,
    toasts,
    authOpen,
    setAuthOpen,
    signIn,
    signOut,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
