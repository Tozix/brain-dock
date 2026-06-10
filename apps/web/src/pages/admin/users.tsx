// Админка → Пользователи (план 054). Также экспортирует общие хелперы админки
// (AdminNav/AdminHead) — их импортируют audit.tsx и usage.tsx.
import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Beacon, Empty, ErrorAlert, fmtDate, fmtInt } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TAKE = 50;

type AdminRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
const ROLES: AdminRole[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];

/** Строка GET /users — проекция UsersService.USER_SELECT. */
interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  _count: { projects: number; apiKeys: number };
}

/* .tabs в styles.css стилизует только <button>; для NavLink — локальные правила. */
const NAV_CSS = `
.tabs.admin-nav a { padding: 9px 13px; border-bottom: 2px solid transparent; color: var(--muted); font-weight: 700; font-size: 13.5px; white-space: nowrap; }
.tabs.admin-nav a:hover { color: var(--text); text-decoration: none; }
.tabs.admin-nav a.active { color: var(--accent-hi); border-bottom-color: var(--accent); }
`;

/** Горизонтальная навигация между тремя страницами админки. */
export function AdminNav() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <>
      <style>{NAV_CSS}</style>
      <nav className="tabs admin-nav">
        <NavLink to="/admin" end className={cls}>
          Пользователи
        </NavLink>
        <NavLink to="/admin/audit" className={cls}>
          Аудит
        </NavLink>
        <NavLink to="/admin/usage" className={cls}>
          Использование
        </NavLink>
      </nav>
    </>
  );
}

/** Шапка страницы админки: заголовок + mono-крошка текущего раздела. */
export function AdminHead({ crumb }: { crumb: string }) {
  return (
    <div className="page-head">
      <h1>Админка</h1>
      <span className="crumb">{crumb}</span>
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Поиск по email — debounce ~400мс.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    (skip: number) => {
      const params = new URLSearchParams({ take: String(TAKE), skip: String(skip) });
      if (query) params.set('q', query);
      return api<AdminUser[]>(`/users?${params}`);
    },
    [query],
  );

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    fetchPage(0)
      .then((page) => {
        if (!alive) return;
        setRows(page);
        setHasMore(page.length === TAKE);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!rows) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage(rows.length);
      setRows([...rows, ...page]);
      setHasMore(page.length === TAKE);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const patch = async (id: string, body: { isActive?: boolean; role?: AdminRole }) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<AdminUser>(`/users/${id}`, { method: 'PATCH', body });
      setRows((rs) => rs?.map((r) => (r.id === id ? updated : r)) ?? rs);
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminHead crumb="/admin/users" />
      <AdminNav />
      <ErrorAlert error={error} />
      <div className="row between" style={{ marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="поиск по email…"
          style={{ maxWidth: 320 }}
        />
        {rows !== null && <span className="dim-led">показано: {rows.length}</span>}
      </div>
      {rows === null ? (
        <div className="empty">загрузка…</div>
      ) : rows.length === 0 ? (
        <Empty art={'⟦  ·  пусто  ·  ⟧'}>
          {query ? <>По запросу «{query}» никого не нашлось.</> : 'Пользователей пока нет.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Проекты</th>
                <th>Ключи</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const self = u.id === me?.id;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id}>
                    <td className="mono">
                      {u.email}
                      {self && <span className="dim-led"> (вы)</span>}
                    </td>
                    <td>
                      <span className={u.role === 'SUPER_ADMIN' ? 'tag accent' : 'tag'}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <Beacon
                        state={u.isActive ? 'ok' : 'err'}
                        label={u.isActive ? 'активен' : 'заблокирован'}
                      />
                    </td>
                    <td className="mono small">{fmtDate(u.createdAt)}</td>
                    <td className="mono">{fmtInt(u._count.projects)}</td>
                    <td className="mono">{fmtInt(u._count.apiKeys)}</td>
                    <td>
                      <div className="row">
                        {isSuper && (
                          <select
                            value={u.role}
                            disabled={self || busy}
                            onChange={(e) =>
                              void patch(u.id, { role: e.target.value as AdminRole })
                            }
                            title={self ? 'нельзя менять свою роль' : 'сменить роль'}
                            style={{ width: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          className={u.isActive ? 'danger' : 'ghost'}
                          disabled={self || busy}
                          title={self ? 'нельзя менять себя' : undefined}
                          onClick={() => void patch(u.id, { isActive: !u.isActive })}
                        >
                          {u.isActive ? 'деактивировать' : 'активировать'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button
            type="button"
            className="ghost"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'загрузка…' : 'показать ещё'}
          </button>
        </div>
      )}
    </>
  );
}
