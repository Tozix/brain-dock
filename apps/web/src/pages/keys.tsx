// API-ключи (self-service): список своих ключей, выпуск нового (секрет показывается
// ровно один раз), отзыв. План 054.
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { CodeBox, Empty, ErrorAlert, fmtDate } from '../components/ui';
import { ApiError, api } from '../lib/api';

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  rateLimit: number | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface IssuedKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
}

function statusTag(status: ApiKey['status']) {
  return (
    <span className={`tag ${status === 'ACTIVE' ? 'accent' : ''}`}>
      {status === 'ACTIVE' ? 'ACTIVE' : status === 'REVOKED' ? 'REVOKED' : 'EXPIRED'}
    </span>
  );
}

export function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);

  const load = useCallback(
    () =>
      api<ApiKey[]>('/api-keys')
        .then((list) => {
          setForbidden(false);
          setKeys(list);
        })
        .catch((err) => {
          // Переходный период: на сервере политика ещё может быть ADMIN-only.
          if (err instanceof ApiError && err.status === 403) setForbidden(true);
          else setError(err);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const issue = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<IssuedKey>('/api-keys', { method: 'POST', body: { name } });
      setIssued(r);
      setName('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Отозвать ключ «${k.name}» (${k.prefix}…)? Клиенты с ним потеряют доступ.`))
      return;
    setError(null);
    try {
      await api(`/api-keys/${k.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err);
    }
  };

  if (forbidden) {
    return (
      <>
        <div className="page-head">
          <h1>API-ключи</h1>
        </div>
        <Empty art={'⟦  ✕  ⟧\n └─ доступ закрыт'}>
          Самостоятельный выпуск ключей пока не включён на этом сервере — обратитесь к
          администратору, он выпустит ключ для вас.
        </Empty>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>API-ключи</h1>
        <span className="crumb">Bearer bd_… для MCP-клиентов</span>
      </div>
      <ErrorAlert error={error} />

      {issued && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="alert ok">
            Ключ «{issued.name}» выпущен. Сохраните секрет — больше мы его не покажем.
          </div>
          <CodeBox>{issued.key}</CodeBox>
          <div className="row between" style={{ marginTop: 10 }}>
            <span className="dim-led">префикс {issued.prefix}…</span>
            <button type="button" className="ghost" onClick={() => setIssued(null)}>
              Скрыть
            </button>
          </div>
        </div>
      )}

      <form className="panel row" onSubmit={(e) => void issue(e)} style={{ marginBottom: 16 }}>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="название ключа, например «laptop / Claude Code»"
        />
        <button type="submit" disabled={busy || !name.trim()}>
          Выпустить ключ
        </button>
      </form>

      {keys === null ? (
        <div className="empty">загрузка…</div>
      ) : keys.length === 0 ? (
        <Empty art={'⟦  ·  ⟧\n └─ нет ключей'}>
          Выпустите первый ключ — он понадобится MCP-клиенту для авторизации.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Префикс</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Последнее использование</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <span className="mono">{k.prefix}…</span>
                  </td>
                  <td>{statusTag(k.status)}</td>
                  <td className="mono small">{fmtDate(k.createdAt)}</td>
                  <td className="mono small">{fmtDate(k.lastUsedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {k.status === 'ACTIVE' && (
                      <button type="button" className="danger" onClick={() => void revoke(k)}>
                        Отозвать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
