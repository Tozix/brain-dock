// Страница проекта: репозитории (загрузка и индексация из браузера), профиль,
// память / знания / документы, usage. План 054.
import {
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Beacon, Empty, ErrorAlert, fmtDate, fmtInt, indexBeacon } from '../components/ui';
import { api } from '../lib/api';

/* ── общие типы и хелперы (локальные для страницы) ─────────── */

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

type IndexStatus = 'QUEUED' | 'INDEXING' | 'READY' | 'FAILED';

interface Repo {
  id: string;
  name: string;
  alias: string;
  root: string;
  indexStatus: IndexStatus | null;
  indexError: string | null;
  lastIndexedAt: string | null;
  indexedFileCount: number | null;
  symbolCount: number | null;
  createdAt: string;
}

interface RepoStatus {
  indexStatus: IndexStatus | null;
  indexError: string | null;
  lastIndexedAt: string | null;
  indexedFileCount: number | null;
  symbolCount: number | null;
}

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // общий бюджет на загрузку из браузера

// Зеркало серверного фильтра INDEXABLE + исключение служебных каталогов.
const EXCLUDED_DIRS = /(^|\/)(node_modules|dist|generated)(\/|$)/;
function indexable(path: string): boolean {
  return (
    /\.tsx?$/.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.includes('.test.') &&
    !path.includes('.spec.') &&
    !EXCLUDED_DIRS.test(path)
  );
}

// webkitRelativePath = "корневая-папка/src/foo.ts" → "src/foo.ts".
function relPath(f: File): string {
  const rel = f.webkitRelativePath || f.name;
  const parts = rel.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : rel;
}

function toAlias(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'repo'
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// React не знает нестандартный атрибут выбора папки.
const DIR_INPUT_PROPS = {
  webkitdirectory: '',
} as unknown as InputHTMLAttributes<HTMLInputElement>;

/* ── страница ──────────────────────────────────────────────── */

type TabId = 'repos' | 'profile' | 'memory' | 'knowledge' | 'docs' | 'usage';

const TABS: { id: TabId; label: string }[] = [
  { id: 'repos', label: 'Репозитории' },
  { id: 'profile', label: 'Профиль' },
  { id: 'memory', label: 'Память' },
  { id: 'knowledge', label: 'Знания' },
  { id: 'docs', label: 'Документы' },
  { id: 'usage', label: 'Usage' },
];

export function ProjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<TabId>('repos');

  useEffect(() => {
    api<Project>(`/projects/${id}`).then(setProject).catch(setError);
  }, [id]);

  const removeProject = async () => {
    if (!window.confirm('Удалить проект вместе с репозиториями, памятью и документами?')) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="page-head row between">
        <div className="row">
          <h1>{project?.name ?? '…'}</h1>
          {project && <span className="tag accent mono">{project.slug}</span>}
        </div>
        <button type="button" className="danger" onClick={() => void removeProject()}>
          Удалить проект
        </button>
      </div>
      <ErrorAlert error={error} />
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'repos' && <ReposTab projectId={id} />}
      {tab === 'profile' && <ProfileTab projectId={id} />}
      {tab === 'memory' && <MemoryTab projectId={id} />}
      {tab === 'knowledge' && <KnowledgeTab projectId={id} />}
      {tab === 'docs' && <DocsTab projectId={id} />}
      {tab === 'usage' && <UsageTab />}
    </>
  );
}

/* ── вкладка: репозитории ──────────────────────────────────── */

function ReposTab({ projectId }: { projectId: string }) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [aliasTouched, setAliasTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const targetRepo = useRef<string | null>(null);

  const load = useCallback(
    () => api<Repo[]>(`/projects/${projectId}/repositories`).then(setRepos).catch(setError),
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Пока есть QUEUED/INDEXING — обновляем их статусы раз в 5 секунд.
  useEffect(() => {
    const active = (repos ?? []).filter(
      (r) => r.indexStatus === 'QUEUED' || r.indexStatus === 'INDEXING',
    );
    if (active.length === 0) return;
    const timer = setInterval(() => {
      for (const r of active) {
        void api<RepoStatus>(`/projects/${projectId}/repositories/${r.id}/status`)
          .then((s) =>
            setRepos((prev) => prev?.map((p) => (p.id === r.id ? { ...p, ...s } : p)) ?? prev),
          )
          .catch(() => {});
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [repos, projectId]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/repositories`, {
        method: 'POST',
        body: { name, alias, root: '/uploaded' },
      });
      setName('');
      setAlias('');
      setAliasTouched(false);
      setCreating(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = (repoId: string) => {
    targetRepo.current = repoId;
    fileInput.current?.click();
  };

  const onFolderPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const repoId = targetRepo.current;
    const all = Array.from(input.files ?? []);
    input.value = ''; // позволяет выбрать ту же папку повторно
    if (!repoId || all.length === 0) return;
    setError(null);
    setReport(null);
    setUploadingId(repoId);
    try {
      const picked = all.filter((f) => indexable(relPath(f)));
      if (picked.length === 0) {
        setError(new Error('В выбранной папке нет подходящих .ts/.tsx файлов'));
        return;
      }
      const files: { path: string; content: string }[] = [];
      let total = 0;
      let skipped = 0;
      for (const f of picked) {
        if (total + f.size > MAX_UPLOAD_BYTES) {
          skipped += 1;
          continue;
        }
        total += f.size;
        files.push({ path: relPath(f), content: await f.text() });
      }
      // Индексация теперь асинхронная: эндпоинт ставит задачу и сразу отвечает 202 QUEUED;
      // прогресс и итоговые счётчики подтянет периодический опрос статуса ниже.
      setRepos(
        (prev) =>
          prev?.map((r) => (r.id === repoId ? { ...r, indexStatus: 'QUEUED' as const } : r)) ??
          prev,
      );
      await api<{ repositoryId: string; status: string }>(
        `/projects/${projectId}/repositories/${repoId}/index`,
        { method: 'POST', body: { files } },
      );
      setReport(
        `Загружено файлов: ${fmtInt(files.length)} — индексация запущена в фоне, ` +
          `статус обновится автоматически` +
          (skipped > 0
            ? ` · внимание: ${fmtInt(skipped)} файл(ов) пропущено — превышен бюджет 40 МБ`
            : ''),
      );
    } catch (err) {
      setError(err);
    } finally {
      setUploadingId(null);
      targetRepo.current = null;
      await load();
    }
  };

  return (
    <>
      <ErrorAlert error={error} />
      {report && <div className="alert ok">{report}</div>}
      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void onFolderPicked(e)}
        {...DIR_INPUT_PROPS}
      />
      <div className="row between" style={{ marginBottom: 14 }}>
        <h2>Репозитории</h2>
        <button type="button" className="ghost" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Отмена' : '+ Репозиторий'}
        </button>
      </div>
      {creating && (
        <form className="panel" onSubmit={(e) => void create(e)} style={{ marginBottom: 16 }}>
          <label className="field">
            <span>Название</span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!aliasTouched) setAlias(toAlias(e.target.value));
              }}
              placeholder="my-service"
            />
          </label>
          <label className="field">
            <span>Alias (латиница, для фильтрации векторов)</span>
            <input
              required
              className="mono"
              value={alias}
              pattern="[a-z0-9-]+"
              onChange={(e) => {
                setAlias(e.target.value);
                setAliasTouched(true);
              }}
              placeholder="my-service"
            />
          </label>
          <button type="submit" disabled={busy}>
            Создать
          </button>
        </form>
      )}
      {repos === null ? (
        <div className="empty">загрузка…</div>
      ) : repos.length === 0 ? (
        <Empty art={'⟦  ·  ⟧\n └─ нет репозиториев'}>
          Создайте репозиторий и загрузите код прямо из браузера — он будет проиндексирован на
          сервере.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alias</th>
                <th>Статус</th>
                <th>Последняя индексация</th>
                <th>Файлы</th>
                <th>Символы</th>
                <th>Ошибка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repos.map((r) => {
                const b = indexBeacon(r.indexStatus);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="mono">{r.alias}</span>
                      <div className="faint small">{r.name}</div>
                    </td>
                    <td>
                      <Beacon state={b.state} label={b.label} />
                    </td>
                    <td className="mono small">{fmtDate(r.lastIndexedAt)}</td>
                    <td className="mono">{fmtInt(r.indexedFileCount)}</td>
                    <td className="mono">{fmtInt(r.symbolCount)}</td>
                    <td className="small" style={{ color: 'var(--err)', maxWidth: 220 }}>
                      {r.indexError ? (
                        <span title={r.indexError}>{truncate(r.indexError, 60)}</span>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        disabled={uploadingId !== null}
                        onClick={() => pickFolder(r.id)}
                      >
                        {uploadingId === r.id ? 'Индексация…' : 'Загрузить и индексировать'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="faint small" style={{ marginTop: 10 }}>
        Загружаются только .ts/.tsx (без node_modules, dist, generated и тестов); общий бюджет — 40
        МБ за раз.
      </p>
    </>
  );
}

/* ── вкладка: профиль проекта ──────────────────────────────── */

const PROFILE_LIMIT = 4096;

function ProfileTab({ projectId }: { projectId: string }) {
  const [profile, setProfile] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ id: string; profile: string | null }>(`/projects/${projectId}/profile`)
      .then((r) => {
        setProfile(r.profile ?? '');
        setLoaded(true);
      })
      .catch(setError);
  }, [projectId]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/projects/${projectId}/profile`, { method: 'PUT', body: { profile } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const over = profile.length > PROFILE_LIMIT;
  return (
    <div className="panel">
      <ErrorAlert error={error} />
      {saved && <div className="alert ok">Профиль сохранён</div>}
      <h2 style={{ marginBottom: 8 }}>Профиль проекта</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        «Закреплённая память»: этот текст подмешивается первым блоком в{' '}
        <code>generate_context</code> для каждого MCP-клиента. Пустая строка очищает профиль.
      </p>
      <textarea
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        disabled={!loaded}
        rows={14}
        placeholder="# О проекте&#10;Стек, соглашения, важные решения…"
      />
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="dim-led" style={over ? { color: 'var(--err)' } : undefined}>
          {fmtInt(profile.length)} / {fmtInt(PROFILE_LIMIT)}
        </span>
        <button type="button" disabled={!loaded || busy || over} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

/* ── вкладка: память ───────────────────────────────────────── */

const MEMORY_TYPES = ['DECISION', 'FACT', 'NOTE', 'TODO'] as const;

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  tags: string[];
  createdAt: string;
}

function MemoryTab({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}/memory`;
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [hits, setHits] = useState<{ score: number; item: MemoryItem }[] | null>(null);
  const [query, setQuery] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<string>('NOTE');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<MemoryItem[]>(`${base}?take=50`).then(setItems).catch(setError),
    [base],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: { content, type } });
      setContent('');
      setHits(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setHits(
        await api<{ score: number; item: MemoryItem }[]>(
          `${base}/search?q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (err) {
      setError(err);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Удалить запись из памяти?')) return;
    setError(null);
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      setHits((prev) => prev?.filter((h) => h.item.id !== id) ?? null);
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const shown: { item: MemoryItem; score?: number }[] = hits
    ? hits.map((h) => ({ item: h.item, score: h.score }))
    : (items ?? []).map((item) => ({ item }));

  return (
    <>
      <ErrorAlert error={error} />
      <form className="panel" onSubmit={(e) => void add(e)}>
        <h3 style={{ marginBottom: 10 }}>Новая запись</h3>
        <label className="field">
          <span>Содержимое</span>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Решили использовать BullMQ для фоновой индексации, потому что…"
          />
        </label>
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 180 }}>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !content.trim()}>
            Добавить
          </button>
        </div>
      </form>
      <form className="panel row" onSubmit={(e) => void search(e)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="семантический поиск по памяти…"
        />
        <button type="submit" className="ghost" disabled={!query.trim()}>
          Найти
        </button>
        {hits && (
          <button type="button" className="ghost" onClick={() => setHits(null)}>
            Сброс
          </button>
        )}
      </form>
      {items === null ? (
        <div className="empty">загрузка…</div>
      ) : shown.length === 0 ? (
        <Empty art={'⟦  ·  ⟧'}>
          {hits ? 'Ничего не найдено.' : 'Память пуста — здесь копятся решения, факты и заметки.'}
        </Empty>
      ) : (
        <div className="stagger" style={{ marginTop: 16 }}>
          {shown.map(({ item, score }) => (
            <div className="panel" key={item.id}>
              <div className="row between">
                <span className="row">
                  <span className="tag accent">{item.type}</span>
                  {score !== undefined && <span className="tag">score {score.toFixed(3)}</span>}
                  <span className="dim-led">{fmtDate(item.createdAt)}</span>
                </span>
                <button type="button" className="danger" onClick={() => void remove(item.id)}>
                  Удалить
                </button>
              </div>
              <div className="mono small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {item.content}
              </div>
              {item.tags.length > 0 && (
                <div className="row" style={{ marginTop: 8 }}>
                  {item.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── вкладка: знания ───────────────────────────────────────── */

const KNOWLEDGE_TYPES = [
  'BUSINESS_RULE',
  'ARCHITECTURE',
  'REQUIREMENT',
  'ADR',
  'FAQ',
  'RESEARCH',
  'NOTE',
] as const;

interface KnowledgeItem {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

function KnowledgeTab({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}/knowledge`;
  const [items, setItems] = useState<KnowledgeItem[] | null>(null);
  const [hits, setHits] = useState<{ score: number; item: KnowledgeItem }[] | null>(null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<string>('NOTE');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<KnowledgeItem[]>(`${base}?take=50`).then(setItems).catch(setError),
    [base],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: { title, content, type } });
      setTitle('');
      setContent('');
      setHits(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setHits(
        await api<{ score: number; item: KnowledgeItem }[]>(
          `${base}/search?q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (err) {
      setError(err);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Удалить запись из базы знаний?')) return;
    setError(null);
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      setHits((prev) => prev?.filter((h) => h.item.id !== id) ?? null);
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const shown: { item: KnowledgeItem; score?: number }[] = hits
    ? hits.map((h) => ({ item: h.item, score: h.score }))
    : (items ?? []).map((item) => ({ item }));

  return (
    <>
      <ErrorAlert error={error} />
      <form className="panel" onSubmit={(e) => void add(e)}>
        <h3 style={{ marginBottom: 10 }}>Новая запись</h3>
        <label className="field">
          <span>Заголовок</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Правило начисления бонусов"
          />
        </label>
        <label className="field">
          <span>Содержимое</span>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Markdown поддерживается…"
          />
        </label>
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 200 }}>
            {KNOWLEDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !title.trim() || !content.trim()}>
            Добавить
          </button>
        </div>
      </form>
      <form className="panel row" onSubmit={(e) => void search(e)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="семантический поиск по знаниям…"
        />
        <button type="submit" className="ghost" disabled={!query.trim()}>
          Найти
        </button>
        {hits && (
          <button type="button" className="ghost" onClick={() => setHits(null)}>
            Сброс
          </button>
        )}
      </form>
      {items === null ? (
        <div className="empty">загрузка…</div>
      ) : shown.length === 0 ? (
        <Empty art={'⟦  ·  ⟧'}>
          {hits
            ? 'Ничего не найдено.'
            : 'База знаний пуста — бизнес-правила, архитектура, ADR живут здесь.'}
        </Empty>
      ) : (
        <div className="stagger" style={{ marginTop: 16 }}>
          {shown.map(({ item, score }) => (
            <div className="panel" key={item.id}>
              <div className="row between">
                <span className="row">
                  <h2>{item.title}</h2>
                  <span className="tag accent">{item.type}</span>
                  {score !== undefined && <span className="tag">score {score.toFixed(3)}</span>}
                  <span className="dim-led">{fmtDate(item.createdAt)}</span>
                </span>
                <button type="button" className="danger" onClick={() => void remove(item.id)}>
                  Удалить
                </button>
              </div>
              <div className="mono small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {item.content}
              </div>
              {item.tags.length > 0 && (
                <div className="row" style={{ marginTop: 8 }}>
                  {item.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── вкладка: документы ────────────────────────────────────── */

interface Doc {
  id: string;
  title: string;
  format: string;
  source: string | null;
  createdAt: string;
}

function DocsTab({ projectId }: { projectId: string }) {
  const base = `/projects/${projectId}/documents`;
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [hits, setHits] = useState<{ score: number; document: Doc; chunkIndex: number }[] | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<Doc[]>(`${base}?take=50`).then(setDocs).catch(setError),
    [base],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await api<{ document: Doc; chunks: number }>(base, {
        method: 'POST',
        body: { title, content, format: 'MD' },
      });
      setOk(`Документ «${r.document.title}» сохранён (чанков: ${fmtInt(r.chunks)})`);
      setTitle('');
      setContent('');
      setHits(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setHits(
        await api<{ score: number; document: Doc; chunkIndex: number }[]>(
          `${base}/search?q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (err) {
      setError(err);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Удалить документ?')) return;
    setError(null);
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      setHits((prev) => prev?.filter((h) => h.document.id !== id) ?? null);
      await load();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <ErrorAlert error={error} />
      {ok && <div className="alert ok">{ok}</div>}
      <form className="panel" onSubmit={(e) => void add(e)}>
        <h3 style={{ marginBottom: 10 }}>Новый документ (Markdown)</h3>
        <label className="field">
          <span>Название</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Гайд по деплою"
          />
        </label>
        <label className="field">
          <span>Содержимое</span>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="# Заголовок&#10;Текст документа…"
          />
        </label>
        <button type="submit" disabled={busy || !title.trim() || !content.trim()}>
          Сохранить
        </button>
      </form>
      <form className="panel row" onSubmit={(e) => void search(e)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="семантический поиск по документам…"
        />
        <button type="submit" className="ghost" disabled={!query.trim()}>
          Найти
        </button>
        {hits && (
          <button type="button" className="ghost" onClick={() => setHits(null)}>
            Сброс
          </button>
        )}
      </form>
      {hits ? (
        hits.length === 0 ? (
          <Empty art={'⟦  ·  ⟧'}>Ничего не найдено.</Empty>
        ) : (
          <div className="stagger" style={{ marginTop: 16 }}>
            {hits.map((h) => (
              <div className="panel" key={`${h.document.id}-${h.chunkIndex}`}>
                <div className="row between">
                  <span className="row">
                    <h2>{h.document.title}</h2>
                    <span className="tag">{h.document.format}</span>
                    <span className="tag">score {h.score.toFixed(3)}</span>
                    <span className="dim-led">чанк #{h.chunkIndex}</span>
                  </span>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void remove(h.document.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : docs === null ? (
        <div className="empty">загрузка…</div>
      ) : docs.length === 0 ? (
        <Empty art={'⟦  ·  ⟧\n └─ нет документов'}>
          Добавьте Markdown-документ — он будет нарезан на чанки и доступен через{' '}
          <code>search_docs</code>.
        </Empty>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Формат</th>
                <th>Создан</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>
                    <span className="tag">{d.format}</span>
                  </td>
                  <td className="mono small">{fmtDate(d.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="danger" onClick={() => void remove(d.id)}>
                      Удалить
                    </button>
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

/* ── вкладка: usage ────────────────────────────────────────── */

const USAGE_PERIODS = [7, 30, 90] as const;

interface UsageSummary {
  days: number;
  calls: number;
  tokensServed: number;
}

function UsageTab() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setData(null);
    api<UsageSummary>(`/usage?days=${days}`).then(setData).catch(setError);
  }, [days]);

  return (
    <>
      <ErrorAlert error={error} />
      <div className="row" style={{ marginBottom: 14 }}>
        {USAGE_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={days === p ? '' : 'ghost'}
            onClick={() => setDays(p)}
          >
            {p} дн.
          </button>
        ))}
      </div>
      {data === null ? (
        <div className="empty">загрузка…</div>
      ) : data.calls === 0 ? (
        <Empty art={'⟦  ·  ⟧\n └─ тишина в эфире'}>
          За выбранный период MCP-вызовов не было. Подключите клиент на странице «Подключить».
        </Empty>
      ) : (
        <div className="grid cols-2 stagger">
          <div className="panel">
            <h3>Вызовы MCP</h3>
            <div className="mono" style={{ fontSize: 30, marginTop: 6 }}>
              {fmtInt(data.calls)}
            </div>
            <span className="dim-led">за последние {data.days} дн.</span>
          </div>
          <div className="panel">
            <h3>Токенов отдано</h3>
            <div className="mono" style={{ fontSize: 30, marginTop: 6 }}>
              {fmtInt(data.tokensServed)}
            </div>
            <span className="dim-led">≈ символы ответов ÷ 4</span>
          </div>
        </div>
      )}
      <p className="faint small" style={{ marginTop: 12 }}>
        Учёт ведётся по пользователю (все его проекты); API отдаёт агрегат за период — дневной
        разбивки пока нет.
      </p>
    </>
  );
}
