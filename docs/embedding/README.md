# Embedding

Локальные эмбеддинги через единый интерфейс `EmbeddingProvider` (пакет `@brain-dock/embedding`).
Правила — [Claude.md](../../Claude.md) §14.

## Интерфейс
```ts
interface EmbeddingProvider {
  readonly model: string;        // id модели — хранится рядом с вектором (версионирование)
  readonly dimensions: number;   // размерность = size коллекции Qdrant
  embed(texts: string[]): Promise<number[][]>;
}
```

## Реализации
| Провайдер | Назначение |
|---|---|
| `OllamaEmbeddingProvider` | Прод: `POST /api/embed`, `nomic-embed-text` (768d), батчи. Проверен вживую. |
| `DeterministicEmbeddingProvider` | Оффлайн/тесты: хэш-bag-of-tokens, L2-норм. Позволяет гонять весь pipeline без модели. НЕ для прод-качества. |

## Версионирование
`model` пишется в payload каждого вектора. Размерность привязана к коллекции Qdrant:
смена модели/размерности → **новая коллекция** (не «тихая» порча индекса).

## Ollama локально
```bash
docker compose up -d ollama
docker exec brain-dock-ollama ollama pull nomic-embed-text
```
Дальнейшие модели (bge/mxbai/snowflake) добавляются как новые провайдеры за тем же интерфейсом.
