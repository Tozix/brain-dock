// Админка → Использование MCP (план 054).
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorAlert, fmtInt } from '../../components/ui';
import { api } from '../../lib/api';
import { AdminHead, AdminNav } from './users';

const TAKE = 50;
const PERIODS = [7, 30, 90] as const;

/** Ответ GET /usage/admin — AdminUsageReport (usage-admin.service). */
interface UsageRow {
  userId: string;
  email: string | null;
  calls: number;
  tokensServed: number;
}

interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  activeUsers: number;
}

interface UsageReport {
  days: number;
  summary: UsageSummary;
  users: UsageRow[];
}

/** Panel-карточка сводки: подпись + крупное display-число. */
function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="panel">
      <h3>{label}</h3>
      <div
        style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1.25, marginTop: 6 }}
      >
        {value == null ? '…' : fmtInt(value)}
      </div>
    </div>
  );
}

export function AdminUsage() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    (skip: number) => api<UsageReport>(`/usage/admin?days=${days}&take=${TAKE}&skip=${skip}`),
    [days],
  );

  useEffect(() => {
    let alive = true;
    setRows(null);
    setSummary(null);
    setError(null);
    fetchPage(0)
      .then((report) => {
        if (!alive) return;
        setSummary(report.summary);
        setRows(report.users);
        setHasMore(report.users.length === TAKE);
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
      const report = await fetchPage(rows.length);
      setRows([...rows, ...report.users]);
      setHasMore(report.users.length === TAKE);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <AdminHead crumb="/admin/usage" />
      <AdminNav />
      <ErrorAlert error={error} />
      <div className="tabs">
        {PERIODS.map((d) => (
          <button
            key={d}
            type="button"
            className={d === days ? 'active' : ''}
            onClick={() => setDays(d)}
          >
            {d} дней
          </button>
        ))}
      </div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Stat label="Всего вызовов" value={summary?.totalCalls} />
        <Stat label="Токенов отдано" value={summary?.totalTokens} />
        <Stat label="Активных пользователей" value={summary?.activeUsers} />
      </div>
      {rows === null ? (
        <div className="empty">загрузка…</div>
      ) : rows.length === 0 ? (
        <Empty art={'⟦  ·  тишина в эфире  ·  ⟧'}>
          За последние {days} дней вызовов MCP не было.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Пользователь</th>
                <th>Вызовы</th>
                <th>Токены</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={u.userId}>
                  <td className="mono small faint">{i + 1}</td>
                  <td className="mono">
                    {u.email ?? (
                      <span title={u.userId} className="faint">
                        {u.userId.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="mono">{fmtInt(u.calls)}</td>
                  <td className="mono">{fmtInt(u.tokensServed)}</td>
                </tr>
              ))}
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
