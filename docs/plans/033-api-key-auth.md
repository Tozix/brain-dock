# 033 — Аутентификация по API-ключу (REST)

**Status:** Done
**Фаза:** Functional completeness
**Связи:** [001-foundation](001-foundation.md) · [006-multiproject-rest-hardening](006-multiproject-rest-hardening.md)

## Проблема
API-ключи выпускались/хранились, но **не давали доступ**: не было guard'а, кладущего полноценный
`request.user` (с ролью). Был `JwtAccessGuard` (только Bearer) и неподключённый `ApiKeyGuard`
(клал лишь `apiKeyUserId`).

## Сделано
- `AuthenticationGuard` (глобальный) — принимает **Bearer JWT или `x-api-key`**, кладёт принципала
  (`id/email/role`) в `request.user`; `@Public` пропускает; `RolesGuard` отрабатывает после.
- `ApiKeysService.resolvePrincipal(rawKey)` — активный ключ + активный пользователь → `AuthenticatedUser`
  (роль наследуется от владельца ключа).
- Консолидация: удалены `jwt-access.guard.ts` и неиспользуемый `api-key.guard.ts`.

## Безопасность
- Ключ наследует роль владельца (в т.ч. SUPER_ADMIN) — выдавать ключи осознанно. Проверяются
  статус (`ACTIVE`), срок (`expiresAt`), активность пользователя. Глобальный rate limit применяется.

## Definition of Done
- ✅ Запрос с `x-api-key` аутентифицируется на project-scoped роутах (проверено вживую: создание/
  список проектов по ключу); нет креды / плохой ключ → 401. Юнит-тест guard'а. `bun run ci` зелёный (116 pass).
</content>
