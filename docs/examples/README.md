# Examples

Примеры использования REST API и MCP. Полное руководство — [GUIDE.md](../GUIDE.md).

## Минимальный сценарий (curl): от регистрации до подключённого MCP

```bash
API=http://localhost:3000/api/v1        # или https://api.example.com/api/v1

# 1) Регистрация (первый пользователь автоматически становится SUPER_ADMIN)
curl -s -X POST $API/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"<надёжный-пароль>"}'
ACC=<accessToken-из-ответа>

# (повторный вход — POST $API/auth/login с теми же кредами)

# 2) API-ключ — «токен» для MCP (только SUPER_ADMIN; показывается ОДИН раз)
curl -s -X POST $API/api-keys -H "authorization: Bearer $ACC" \
  -H 'content-type: application/json' -d '{"name":"my-key"}'
T=bd_…

# 3) Проект и репозиторий
curl -s -X POST $API/projects -H "x-api-key: $T" -H 'content-type: application/json' \
  -d '{"name":"My App","slug":"my-app"}'
PID=<id-проекта>
curl -s -X POST $API/projects/$PID/repositories -H "x-api-key: $T" \
  -H 'content-type: application/json' -d '{"name":"My App","alias":"my-app","root":"."}'
RID=<id-репозитория>

# 4) Upload-индексация: выгрузить файлы (код не нужен на сервере)
curl -s -X POST $API/projects/$PID/repositories/$RID/index -H "x-api-key: $T" \
  -H 'content-type: application/json' \
  -d '{"files":[{"path":"src/main.ts","content":"export const hello = () => \"hi\";"}]}'

# 5) Статус индексации (QUEUED / INDEXING / READY / FAILED)
curl -s $API/projects/$PID/repositories/$RID/status -H "x-api-key: $T"

# 6) Подключить Claude Code к удалённому MCP (проект — частью URL)
claude mcp add --transport http brain-dock http://localhost:8080/mcp/my-app \
  --header "Authorization: Bearer $T"
# проверить без клиента:
curl -s http://localhost:8080/mcp/my-app -H "Authorization: Bearer $T" \
  -H "content-type: application/json" -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Дальше внутри сессии Claude Code инструменты вызываются автоматически («через brain-dock найди
сервис AuthService»). Справочник инструментов — [GUIDE.md §7](../GUIDE.md) и
[../mcp/](../mcp/README.md); Swagger всего REST — `http://localhost:3000/api/v1/docs`.
