/**
 * @brain-dock/core — domain abstractions and ports shared across apps.
 * Kept framework-agnostic (no NestJS imports) so it can be reused by api/mcp/workers.
 */
export * from './observability/tracing';
export * from './ports/clock';
export * from './ports/index-queue';
