# 031 — Безопасность первого прод-запуска

**Status:** Done
**Фаза:** First-launch hardening
**Связи:** [001-foundation](001-foundation.md) · [025-deploy-build-on-server](025-deploy-build-on-server.md) · [030-readiness-and-readme](030-readiness-and-readme.md)

## Goal
Закрыть три риска первого боевого запуска: дефолтные секреты, ручные миграции, незамеченное
отсутствие Ollama-модели.

## Сделано
- **Guard секретов (prod):** `envSchema.superRefine` — при `NODE_ENV=production` отвергает
  shipped dev-секреты и требует JWT-секреты ≥32 символов. Проверено вживую: prod + dev-секрет →
  бут падает с понятным сообщением.
- **Авто-миграции в деплое:** one-shot сервис `migrate` в compose (profile `app`) запускает
  `db:deploy` и завершается; `api` стартует через `depends_on: migrate: service_completed_successfully`.
- **Проба Ollama в readiness:** при `EMBEDDER=ollama` `/health/ready` проверяет доступность Ollama
  **и** что `EMBEDDING_MODEL` скачана (`/api/tags`); гейтит статус только в ollama-режиме. Проверено
  вживую (`ollama.up: true`).

## Out
- Авто-`pull` модели в deploy; ротация секретов; проверка дефолтного пароля БД в DATABASE_URL.

## Definition of Done
- ✅ prod отвергает дефолтные/слабые JWT-секреты (тест + live).
- ✅ `bun run deploy` применяет миграции до старта API (compose `migrate`).
- ✅ readiness ловит «модель не скачана» в ollama-режиме. `bun run ci` зелёный (110 pass).
</content>
