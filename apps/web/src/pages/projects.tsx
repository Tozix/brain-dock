import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorAlert, fmtDate } from '../components/ui';
import { api } from '../lib/api';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  profile: string | null;
  createdAt: string;
}

const RU: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => RU[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `proj-${Date.now().toString(36)}`;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Project[]>('/projects').then(setProjects).catch(setError), []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/projects', { method: 'POST', body: { name, slug: slugify(name) } });
      setName('');
      setCreating(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head row between">
        <h1>Проекты</h1>
        <button type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Отмена' : '+ Новый проект'}
        </button>
      </div>
      <ErrorAlert error={error} />
      {creating && (
        <form className="panel" onSubmit={(e) => void create(e)} style={{ marginBottom: 16 }}>
          <label className="field">
            <span>Название</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-product"
            />
          </label>
          <button type="submit" disabled={busy}>
            Создать
          </button>
        </form>
      )}
      {projects === null ? (
        <div className="empty">загрузка…</div>
      ) : projects.length === 0 ? (
        <Empty art={'⟦  ·  пусто  ·  ⟧\n └─ пришвартуйте первый проект'}>
          Создайте проект — это «причал», к которому подключаются репозитории, память и MCP-клиент.
        </Empty>
      ) : (
        <div className="grid cols-3 stagger">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="panel interactive">
                <div className="row between">
                  <h2>{p.name}</h2>
                  <span className="tag accent mono">{p.slug}</span>
                </div>
                <p className="muted small" style={{ margin: '8px 0 10px' }}>
                  {p.description ?? 'без описания'}
                </p>
                <span className="dim-led">создан {fmtDate(p.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
