import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Beacon } from './ui';

interface Readiness {
  status: string;
  db?: { up: boolean };
  qdrant?: { up: boolean };
  redis?: { up: boolean };
  ollama?: { up: boolean };
}

/** App chrome: the dock HUD — brand gate, nav, live stack health, session. */
export function Shell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState<Readiness | null>(null);

  useEffect(() => {
    let alive = true;
    // Health lives at the root path (excluded from the api/v1 prefix) — plain fetch, no auth.
    const probe = () =>
      fetch('/health/ready')
        .then((r) => (r.ok ? (r.json() as Promise<Readiness>) : Promise.reject(new Error('down'))))
        .then((r) => alive && setReady(r))
        .catch(() => alive && setReady(null));
    void probe();
    const t = setInterval(probe, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const downstream = ready
    ? [ready.db?.up, ready.qdrant?.up, ready.redis?.up, ready.ollama?.up]
    : [];
  const allUp = ready !== null && downstream.every((up) => up === true);

  return (
    <div className="shell">
      <header className="hud">
        <NavLink to="/" className="brand">
          <span className="gate">⟦⟧</span>
          brain<b>dock</b>
        </NavLink>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Проекты
          </NavLink>
          <NavLink to="/keys" className={({ isActive }) => (isActive ? 'active' : '')}>
            API-ключи
          </NavLink>
          <NavLink to="/connect" className={({ isActive }) => (isActive ? 'active' : '')}>
            Подключить MCP
          </NavLink>
          {user && user.role !== 'USER' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Админка
            </NavLink>
          )}
        </nav>
        <div className="spacer" />
        <Beacon
          state={ready === null ? 'err' : allUp ? 'ok' : 'warn'}
          label={ready === null ? 'API OFFLINE' : allUp ? 'STACK OK' : 'DEGRADED'}
        />
        <span className="dim-led">{user?.email}</span>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            auth.logout();
            navigate('/login');
          }}
        >
          выйти
        </button>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
