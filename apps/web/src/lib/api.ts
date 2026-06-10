// REST client: same-origin /api/v1 (vite proxy in dev, nginx in production).
// Access/refresh JWTs live in localStorage; a 401 triggers one refresh-and-retry.

const BASE = '/api/v1';
const LS_ACCESS = 'bd.access';
const LS_REFRESH = 'bd.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CurrentUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onAuthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

export function hasSession(): boolean {
  return localStorage.getItem(LS_ACCESS) !== null;
}

export function setSession(accessToken: string, refreshToken: string): void {
  localStorage.setItem(LS_ACCESS, accessToken);
  localStorage.setItem(LS_REFRESH, refreshToken);
  emit();
}

export function clearSession(): void {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  emit();
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'ERROR';
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body.code) code = body.code;
    if (body.message) message = body.message;
  } catch {
    // non-JSON error body — keep the status line
  }
  return new ApiError(res.status, code, message);
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = localStorage.getItem(LS_REFRESH);
    if (!refreshToken) return false;
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    setSession(body.accessToken, body.refreshToken);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; raw?: boolean } = {},
): Promise<T> {
  const exec = () =>
    fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(localStorage.getItem(LS_ACCESS)
          ? { authorization: `Bearer ${localStorage.getItem(LS_ACCESS)}` }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let res = await exec();
  if (res.status === 401 && localStorage.getItem(LS_REFRESH)) {
    if (await tryRefresh()) res = await exec();
    else {
      clearSession();
      throw new ApiError(401, 'UNAUTHORIZED', 'Сессия истекла — войдите снова');
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const auth = {
  async login(email: string, password: string): Promise<void> {
    const r = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setSession(r.accessToken, r.refreshToken);
  },
  async register(email: string, password: string): Promise<void> {
    const r = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    setSession(r.accessToken, r.refreshToken);
  },
  me(): Promise<CurrentUser> {
    return api<CurrentUser>('/auth/me');
  },
  logout(): void {
    clearSession();
  },
};
