# Architecture Decision Records (ADR)

Здесь фиксируются **архитектурно значимые** решения: контекст, варианты, выбор и последствия.
Решения попроще, не дотягивающие до ADR, идут в [../decisions/](../decisions/).

## Процесс
1. Новый ADR — файл `NNNN-kebab-title.md` (нумерация сквозная, с нуля).
2. Статус: `Proposed` → `Accepted` → (`Superseded by NNNN` / `Deprecated`).
3. ADR **неизменяем** после `Accepted`; изменение решения = новый ADR, который ссылается на старый.
4. Формат: Context · Decision · Alternatives · Consequences · Status.

## Реестр
| № | Заголовок | Статус |
|---|---|---|
| [0001](0001-stack-selection.md) | Выбор стека (runtime, framework, монорепо) | Accepted |
| [0002](0002-test-runner.md) | Тест-раннер: `bun:test` вместо Vitest | Accepted |
