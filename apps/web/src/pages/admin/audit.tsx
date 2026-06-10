// Админка → Журнал аудита (план 054).
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorAlert, fmtDate } from '../../components/ui';
import { api } from '../../lib/api';
import { AdminHead, AdminNav } from './users';

const TAKE = 50;

/** Строка GET /audit — модель AuditLog (Prisma). */
interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

/** Обрезанное mono-значение; полное — в title (всплывает при наведении). */
function Trunc({ value, max }: { value: string; max: number }) {
  if (value.length <= max) return <span className="mono small">{value}</span>;
  return (
    <span className="mono small" title={value}>
      {value.slice(0, max)}…
    </span>
  );
}

export function AdminAudit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Фильтры: action — с debounce ~400мс; from/to — date-инпуты (применяются сразу).
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setAction(actionInput.trim()), 400);
    return () => clearTimeout(t);
  }, [actionInput]);

  const fetchPage = useCallback(
    (skip: number) => {
      const params = new URLSearchParams({ take: String(TAKE), skip: String(skip) });
      if (action) params.set('action', action);
      if (from) params.set('from', from);
      // `to` на бэке — lte по createdAt: шлём конец выбранного дня, чтобы день попал целиком.
      if (to) params.set('to', `${to}T23:59:59.999Z`);
      return api<AuditRow[]>(`/audit?${params}`);
    },
    [action, from, to],
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

  return (
    <>
      <AdminHead crumb="/admin/audit" />
      <AdminNav />
      <ErrorAlert error={error} />
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <label className="field" style={{ marginBottom: 0, flex: '1 1 220px' }}>
            <span>Действие</span>
            <input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="например, user.update"
            />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>
      {rows === null ? (
        <div className="empty">загрузка…</div>
      ) : rows.length === 0 ? (
        <Empty art={'⟦  ·  пусто  ·  ⟧'}>
          {action || from || to
            ? 'По заданным фильтрам записей не найдено.'
            : 'Журнал аудита пока пуст.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Действие</th>
                <th>Актор</th>
                <th>Цель</th>
                <th>IP</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = r.metadata == null ? null : JSON.stringify(r.metadata);
                return (
                  <tr key={r.id}>
                    <td className="mono small" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(r.createdAt)}
                    </td>
                    <td>
                      <span className="tag">{r.action}</span>
                    </td>
                    <td>{r.actorId ? <Trunc value={r.actorId} max={8} /> : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.targetType ? (
                        <>
                          <span className="tag">{r.targetType}</span>{' '}
                          {r.targetId && <Trunc value={r.targetId} max={8} />}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono small">{r.ip ?? '—'}</td>
                    <td>{meta === null ? '—' : <Trunc value={meta} max={80} />}</td>
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
