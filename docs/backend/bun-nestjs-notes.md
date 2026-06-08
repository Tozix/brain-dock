# NestJS на Bun — рабочие заметки (gotchas)

Подтверждённые на Phase 1 особенности запуска NestJS на чистом Bun (1.3.5) и их решения.
Эти находки — практический результат runtime smoke-gate из [ADR-0001](../adr/0001-stack-selection.md).

## 1. `emitDecoratorMetadata` и корневой `tsconfig.json`
Bun применяет настройки декораторов из **`tsconfig.json` в корне проекта** (cwd), и
не всегда подхватывает их через `extends` из вложенных конфигов. Без метадаты DI
внедряет `undefined` в конструкторы.

**Решение:** корневой [`tsconfig.json`](../../tsconfig.json) содержит
`experimentalDecorators: true` и `emitDecoratorMetadata: true` напрямую.

## 2. Инжектируемые зависимости — только value-импорты
`import type { SomeService }` стирает значение на рантайме → метадата конструктора
становится `Object`, и DI ломается. Все внедряемые сервисы/guard'ы импортируются как
**значения** (`import { X }`), а не `import type`.

**Решение:** в [`biome.json`](../../biome.json) правило `style.useImportType` **выключено**,
чтобы автофикс не превращал DI-импорты в type-only.

## 3. Параметр-декораторы и Biome
`@Body()`, `@Param()`, `@CurrentUser()` — параметр-декораторы. Biome по умолчанию их
не парсит.

**Решение:** `javascript.parser.unsafeParameterDecoratorsEnabled: true` в `biome.json`.

## 4. Валидация — Zod, без `ValidationPipe`
Глобальный `ValidationPipe` из `@nestjs/common` требует `class-validator`. По стеку
валидация — **Zod**.

**Решение:** собственный [`ZodValidationPipe`](../../apps/api/src/common/zod-validation.pipe.ts),
применяется точечно: `@Body(new ZodValidationPipe(schema))`.

## 5. Пароли и хэши — встроенные средства Bun/Node
- Хэш паролей: `Bun.password.hash/verify` (argon2id) — без нативных зависимостей.
- Хэш API-ключей: `node:crypto` `createHash('sha256')`.

## Итог smoke-gate
NestJS boot, DI, декораторы, роутинг с `setGlobalPrefix` + `exclude`, Prisma 7 (pg-adapter),
JWT, Zod, аудит — **подтверждены на Bun**. Воспроизведение: [`scripts/smoke.sh`](../../scripts/smoke.sh).

## 6. BullMQ на Bun — нативный `msgpackr-extract` паникует
BullMQ тянет `msgpackr`, у которого есть **опциональный нативный акселератор** `msgpackr-extract`.
На Bun его загрузка падает паникой (`unsupported uv function: uv_version_string`) — не ловится try/catch.
Сам акселератор не нужен: `msgpackr` имеет чистый JS-fallback.

**Решение:** root `package.json` → `postinstall` удаляет нативный модуль после каждой установки:
`rm -rf node_modules/.bun/msgpackr-extract* node_modules/msgpackr-extract`. После этого BullMQ
работает на Bun (проверено: [`apps/workers/src/bullmq-smoke.ts`](../../apps/workers/src/bullmq-smoke.ts)).

Прочее по BullMQ: имя очереди **не может содержать `:`** (Redis-разделитель ключей) — используем `-`.
