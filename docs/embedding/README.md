# Embedding

Локальные эмбеддинги через единый интерфейс `EmbeddingProvider` (пакет `@brain-dock/embedding`).
Правила — [Claude.md](../../Claude.md) §14.

## Интерфейс
```ts
interface EmbeddingProvider {
  readonly model: string;        // id модели — хранится рядом с вектором (версионирование)
  readonly dimensions: number;   // размерность = size коллекции Qdrant
  embed(texts: string[]): Promise<number[][]>;   // документы (индексация)
  embedQuery(text: string): Promise<number[]>;   // поисковый запрос (асимметричный retrieval)
}
```

## Реализации
| Провайдер | Назначение |
|---|---|
| `OllamaEmbeddingProvider` | Прод: `POST /api/embed`, `nomic-embed-text` (768d), батчи. Проверен вживую. |
| `DeterministicEmbeddingProvider` | Оффлайн/тесты: хэш-bag-of-tokens, L2-норм. Позволяет гонять весь pipeline без модели. НЕ для прод-качества. |

## Усечение входа (план [050](../plans/050-ollama-embedding-truncation-and-dev-ollama.md))
`OllamaEmbeddingProvider` усекает каждый текст до `maxChars` (по умолчанию 6000) перед отправкой —
иначе крупный символ/чанк превышает контекст модели и Ollama отвечает 400, валя всю индексацию.
Хвост за пределами контекста модель всё равно бы молча отбросила.

## Task-префиксы nomic + `embedQuery` (план [052](../plans/052-search-quality.md))
`nomic-embed-text` — асимметричная retrieval-модель: документы эмбеддятся с префиксом
**`search_document: `** (метод `embed`), запросы — с **`search_query: `** (метод `embedQuery`).
Симметричные провайдеры (deterministic) делегируют `embedQuery` → `embed`. Dense-поиск дополняется
**sparse BM25-вектором** в hybrid-коллекциях Qdrant со слиянием server-side **RRF** —
см. [план 052](../plans/052-search-quality.md) и [../rag/](../rag/README.md).

## Версионирование
`model` пишется в payload каждого вектора. Размерность привязана к коллекции Qdrant:
смена модели/размерности → **новая коллекция** (не «тихая» порча индекса).
`QdrantStore.ensureCollection` проверяет это явно: при несовпадении размерности падает с понятной
ошибкой («reindex into a new collection or change COLLECTION»), а не пишет несравнимые векторы.

## Ollama локально
```bash
docker compose up -d ollama
docker exec brain-dock-ollama ollama pull nomic-embed-text
```
Дальнейшие модели (bge/mxbai/snowflake) добавляются как новые провайдеры за тем же интерфейсом.
