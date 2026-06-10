import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorAlert } from '../components/ui';
import { auth } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, loading, reload } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await auth.login(email, password);
      else await auth.register(email, password);
      reload();
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="panel auth-card">
        <div className="brand">
          <span className="gate">⟦⟧</span>
          brain<b>dock</b>
        </div>
        <p className="sub">док для знаний о вашем коде · hosted MCP</p>
        <ErrorAlert error={error} />
        <form onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="row between" style={{ marginTop: 18 }}>
            <button type="submit" disabled={busy}>
              {busy ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Регистрация' : 'У меня есть аккаунт'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
