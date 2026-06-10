import { type ReactNode, useState } from 'react';

/** Status beacon: maps repository/index states to the lighthouse dots of the design system. */
export function Beacon({
  state,
  label,
}: {
  state: 'ok' | 'warn' | 'err' | 'info' | 'off';
  label: string;
}) {
  return (
    <span className={`beacon ${state === 'off' ? '' : state}`}>
      <i />
      {label}
    </span>
  );
}

export function indexBeacon(status: string | null | undefined): {
  state: 'ok' | 'warn' | 'err' | 'info' | 'off';
  label: string;
} {
  switch (status) {
    case 'READY':
      return { state: 'ok', label: 'READY' };
    case 'INDEXING':
      return { state: 'warn', label: 'INDEXING' };
    case 'QUEUED':
      return { state: 'info', label: 'QUEUED' };
    case 'FAILED':
      return { state: 'err', label: 'FAILED' };
    default:
      return { state: 'off', label: 'не индексирован' };
  }
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`ghost ${className ?? ''}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? '✓ скопировано' : 'копировать'}
    </button>
  );
}

export function CodeBox({ children, copy }: { children: string; copy?: boolean }) {
  return (
    <div className="codebox">
      {copy !== false && <CopyButton text={children} className="copy" />}
      {children}
    </div>
  );
}

export function Empty({ art, children }: { art?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {art && <div className="art">{art}</div>}
      {children}
    </div>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <div className="alert">{message}</div>;
}

/** Tiny dependency-free sparkline for usage charts. */
export function Spark({
  points,
  width = 220,
  height = 44,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return <span className="faint small">нет данных</span>;
  const max = Math.max(...points, 1);
  const step = width / Math.max(points.length - 1, 1);
  const d = points
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      className="spark"
      width={width}
      height={height}
      role="img"
      aria-label="график использования"
    >
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <path
        d={`${d} L${width},${height} L0,${height} Z`}
        fill="var(--accent)"
        opacity="0.08"
        stroke="none"
      />
    </svg>
  );
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('ru-RU');
}
