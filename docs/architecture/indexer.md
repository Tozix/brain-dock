# AST-индексатор (Phase 2)

Пакет `@brain-dock/indexer` превращает репозиторий в структурированный граф символов.
Поток: `Repository → Files → AST (ts-morph) → Symbols → Chunks` (+ связи).

## Компоненты
| Файл | Роль |
|---|---|
| `types.ts` | Доменные типы: `IndexedSymbol`, `Chunk`, `SymbolRelation`, `FileIndex`, `RepositoryIndex` |
| `ast-engine.ts` | Порт `AstEngine` — движок парсинга спрятан за интерфейсом (заменяем на SWC/oxc) |
| `ts-morph-engine.ts` | Реализация на **ts-morph** (per-file, синтаксическая, in-memory Project) |
| `indexer.ts` | `RepositoryIndexer`: скан ФС, хэш, **инкрементальный** реиндекс |
| `hash.ts` | sha256 для chunk-id и хэшей файлов/контента |
| `cli.ts` | Dev-CLI: `bun packages/indexer/src/cli.ts <dir> [--json]` |

## Что извлекается
- **Символы:** классы, интерфейсы, type-алиасы, enum'ы, функции (имя, kind, export, диапазон строк).
- **NestJS-роли:** controller / service / module / guard / pipe / interceptor / filter / resolver /
  repository / dto / entity — по декораторам (`@Controller`, `@Injectable`, `@Module`, `@Catch`),
  по `implements` (`CanActivate`→guard, `PipeTransform`→pipe, `NestInterceptor`→interceptor,
  `ExceptionFilter`→filter) и по соглашениям имён (`*Repository`, `*Dto`, `*Entity`).
- **DI-связи:** типы параметров конструктора → рёбра `injects` (`Controller → Service → Repository`).
  Также `extends` / `implements`.
- **Маршруты:** для контроллеров — HTTP-декораторы (`@Get`/`@Post`/...) → `{method, path, handler}`.
- **Импорты:** module specifier + именованные/дефолтные/namespace, флаг `typeOnly`.
- **Чанки:** по одному на символ (текст + sha256), готовы к эмбеддингам в Phase 3.

## Инкрементальность
`RepositoryIndexer.index(root, { previous })` хэширует контент каждого файла; при совпадении
хэша с предыдущим индексом `FileIndex` **переиспользуется** без повторного парсинга.

## Границы (Phase 2)
- Извлечение синтаксическое, **per-file** (без кросс-файлового type checker'а) — дружелюбно к инкрементальности.
- Без БД/эмбеддингов/Qdrant — это Phase 3 ([план 003](../plans/003-rag-engine.md)).
- Глубокое разрешение типов между файлами и полноценный граф — следующий шаг (`packages/graph`).

## Проверено
CLI на реальном `apps/api/src`: 27 файлов → 7 module, 6 service, 3 guard, 3 controller, 1 pipe, 25 связей.
