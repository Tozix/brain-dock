# 040 — Rate limit для remote MCP (hardening)

**Status:** Done
**Фаза:** Hosted product / security
**Связи:** [036-remote-mcp-http](036-remote-mcp-http.md) · [014-redis-rate-limit](014-redis-rate-limit.md) · [033-api-key-auth](033-api-key-auth.md)

## Проблема
Публичный MCP-HTTP-эндпоинт не имел ограничения частоты (у REST — есть). Утёкший/злоупотребляемый
API-ключ мог слать запросы без лимита.

## Сделано
- `FixedWindowLimiter` (apps/mcp/src/remote/rate-limit.ts) — детерминированный per-key лимитер.
- MCP-handler применяет лимит **после auth**, ключ = владелец API-ключа (`userId`); превышение →
  `429` + `Retry-After`. Конфиг: `MCP_RATE_LIMIT_MAX` (600), `MCP_RATE_LIMIT_WINDOW_MS` (60000).

## Проверено
Юнит-тест (max/окно/изоляция ключей). Вживую: при `MCP_RATE_LIMIT_MAX=3` — `200 200 200 429 429 429`;
плохой ключ → `401`.

## Out / дальше
- Redis-backed общий лимит между инстансами (как у REST) — сейчас per-process.
- Pre-auth IP-лимит и лимит размера тела запроса.

## Definition of Done
- ✅ Превышение per-key лимита на `/mcp` → `429`; конфиг через env; `bun run ci` зелёный.
</content>
