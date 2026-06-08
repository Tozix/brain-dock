# Документация `brain-dock`

Здесь хранится **вся** документация проекта. Главный источник истины — корневой
[Claude.md](../Claude.md); этот каталог раскрывает его в деталях.

## Карта разделов

| Каталог | Назначение |
|---|---|
| [architecture/](architecture/) | Архитектура: слои, диаграммы, потоки данных, Knowledge Graph |
| [api/](api/) | Контракты REST API (`/api/v1`), Swagger/OpenAPI |
| [backend/](backend/) | Бэкенд: модули NestJS, сервисы, воркеры, очереди |
| [mcp/](mcp/) | MCP-сервер: tools / resources / prompts |
| [rag/](rag/) | Hybrid Search, Context Engine, re-ranking, compression |
| [knowledge/](knowledge/) | Knowledge Base: бизнес-правила, требования, FAQ |
| [embedding/](embedding/) | EmbeddingProvider, модели, версионирование |
| [database/](database/) | Схема БД, Prisma, миграции, индексы |
| [deployment/](deployment/) | Docker, Compose, окружения, инфраструктура |
| [adr/](adr/) | Architecture Decision Records (реестр + процесс) |
| [research/](research/) | Исследования, прототипы, сравнения подходов |
| [tasks/](tasks/) | Активные задачи и их декомпозиция |
| [plans/](plans/) | Планы разработки (обязательны перед кодом) |
| [decisions/](decisions/) | Лёгкие решения, не дотягивающие до ADR |
| [meeting-notes/](meeting-notes/) | Заметки встреч/обсуждений |
| [roadmap/](roadmap/) | Дорожная карта проекта |
| [examples/](examples/) | Примеры использования API/MCP/SDK |
| [faq/](faq/) | Частые вопросы |

## Принципы
- Документация — часть Definition of Done. После каждой задачи обновляются `docs`, `ROADMAP`, `Claude.md` и план.
- Любая новая задача сперва превращается в **план** в [plans/](plans/), затем реализуется.
- Архитектурно значимые решения фиксируются как **ADR** в [adr/](adr/).
