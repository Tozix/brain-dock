import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, type CurrentUser, hasSession, onAuthChange } from './api';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  reload: () => void;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, reload: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => onAuthChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    void tick; // re-fetch the session user whenever auth state changes (login/logout/refresh)
    let alive = true;
    if (!hasSession()) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    auth
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  return (
    <Ctx.Provider value={{ user, loading, reload: () => setTick((t) => t + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="empty">загрузка…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty">загрузка…</div>;
  if (!user || user.role === 'USER') return <Navigate to="/" replace />;
  return children;
}
