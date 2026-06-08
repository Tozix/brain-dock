/** Stable, machine-readable error codes surfaced through the REST API and MCP layer. */
export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Canonical error envelope returned by the API (see Claude.md §10). */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
