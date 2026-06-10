// «Подключить MCP»: пошаговая инструкция — проект → endpoint → сниппеты конфигов → ключ.
// Реальный ключ не запрашивается: в сниппетах плейсхолдер bd_xxx. План 054.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBox, ErrorAlert } from '../components/ui';
import { api } from '../lib/api';

interface Project {
  id: string;
  name: string;
  slug: string;
}

const KEY_PLACEHOLDER = 'bd_xxx';

function snippet(servers: Record<string, unknown>): string {
  return JSON.stringify(servers, null, 2);
}

export function ConnectPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<Project[]>('/projects')
      .then((list) => {
        setProjects(list);
        const first = list[0];
        if (first) setSlug((s) => s || first.slug);
      })
      .catch(setError);
  }, []);

  const effectiveSlug = slug || '<project-slug>';
  const endpoint = `${window.location.origin}/mcp/${effectiveSlug}`;

  const claudeConfig = snippet({
    mcpServers: {
      'brain-dock': {
        type: 'http',
        url: endpoint,
        headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
      },
    },
  });

  const vscodeConfig = snippet({
    servers: {
      'brain-dock': {
        type: 'http',
        url: endpoint,
        headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
      },
    },
  });

  const cursorConfig = snippet({
    mcpServers: {
      'brain-dock': {
        url: endpoint,
        headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
      },
    },
  });

  return (
    <>
      <div className="page-head">
        <h1>Подключить MCP</h1>
        <span className="crumb">remote MCP · Streamable HTTP</span>
      </div>
      <ErrorAlert error={error} />
      <div className="stagger">
        <div className="panel">
          <h3>Шаг 1 — выберите проект</h3>
          <p className="muted small">
            Проект выбирается сегментом URL (<code>/mcp/&lt;slug&gt;</code>) — клиенту не нужны
            дополнительные заголовки вроде <code>X-Project</code>.
          </p>
          {projects !== null && projects.length === 0 ? (
            <p className="muted">
              Проектов пока нет — <Link to="/">создайте первый проект</Link>.
            </p>
          ) : (
            <label className="field" style={{ maxWidth: 420 }}>
              <span>Проект</span>
              <select value={slug} onChange={(e) => setSlug(e.target.value)}>
                {projects === null && <option value="">загрузка…</option>}
                {projects?.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name} — {p.slug}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="panel">
          <h3>Шаг 2 — endpoint</h3>
          <p className="muted small">
            Хостед MCP-сервер этого инстанса; авторизация — заголовок{' '}
            <code>Authorization: Bearer bd_…</code>.
          </p>
          <CodeBox>{endpoint}</CodeBox>
        </div>

        <div className="panel">
          <h3>Шаг 3 — конфиг клиента</h3>
          <p className="muted small">
            Подставьте свой ключ вместо <code>{KEY_PLACEHOLDER}</code>. Список инструментов клиент
            получит автоматически через <code>tools/list</code>.
          </p>

          <h2 style={{ margin: '14px 0 8px' }}>Claude Code</h2>
          <p className="faint small" style={{ margin: '0 0 6px' }}>
            <code>.mcp.json</code> в корне репозитория:
          </p>
          <CodeBox>{claudeConfig}</CodeBox>

          <h2 style={{ margin: '18px 0 8px' }}>VS Code</h2>
          <p className="faint small" style={{ margin: '0 0 6px' }}>
            <code>.vscode/mcp.json</code>:
          </p>
          <CodeBox>{vscodeConfig}</CodeBox>

          <h2 style={{ margin: '18px 0 8px' }}>Cursor</h2>
          <p className="faint small" style={{ margin: '0 0 6px' }}>
            <code>.cursor/mcp.json</code>:
          </p>
          <CodeBox>{cursorConfig}</CodeBox>
        </div>

        <div className="panel row between">
          <div>
            <h3>Шаг 4 — API-ключ</h3>
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              Секрет показывается один раз при выпуске — сохраните его в конфиге клиента.
            </p>
          </div>
          <Link to="/keys" className="btn">
            Выпустить ключ →
          </Link>
        </div>
      </div>
    </>
  );
}
