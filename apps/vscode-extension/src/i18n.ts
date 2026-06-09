// Runtime i18n for the panel + dialogs. Pure (no `vscode` import) so it is unit-testable; the active
// language is resolved in config.ts and passed in. Command-palette titles are localized separately
// via package.nls*.json (those follow the VS Code display language).

export type Lang = 'en' | 'ru';

export type MessageKey =
  | 'status.notConnected'
  | 'status.connected'
  | 'status.error'
  | 'status.connecting'
  | 'panel.notConnectedHint'
  | 'panel.pickProjectHint'
  | 'panel.serverHint'
  | 'btn.connect'
  | 'btn.settings'
  | 'btn.retry'
  | 'btn.signOut'
  | 'btn.selectProject'
  | 'btn.change'
  | 'btn.setupAgents'
  | 'btn.reindex'
  | 'btn.generateContext'
  | 'btn.addRepository'
  | 'btn.switchProject'
  | 'btn.viewLogs'
  | 'btn.indexWorkspace'
  | 'msg.noWorkspace'
  | 'progress.provisioning'
  | 'progress.uploading'
  | 'msg.workspaceReady'
  | 'btn.save'
  | 'btn.cancel'
  | 'field.serverUrl'
  | 'field.mcpUrl'
  | 'field.project'
  | 'field.language'
  | 'field.apiKey'
  | 'field.apiKeyKeep'
  | 'opt.langAuto'
  | 'msg.settingsSaved'
  | 'label.settings'
  | 'label.project'
  | 'label.index'
  | 'label.tokenSavings'
  | 'label.actions'
  | 'label.repositories'
  | 'metric.symbols'
  | 'metric.files'
  | 'metric.repos'
  | 'metric.estSaved'
  | 'metric.avgSaving'
  | 'metric.calls'
  | 'metric.edges'
  | 'idx.symbols'
  | 'idx.edges'
  | 'idx.files'
  | 'usage.calls'
  | 'usage.tokens'
  | 'period.today'
  | 'period.days'
  | 'label.usage'
  | 'status.server'
  | 'msg.apiKeySaved'
  | 'msg.signedOut'
  | 'msg.connectFirst'
  | 'msg.selectProjectFirst'
  | 'msg.noProjects'
  | 'msg.projectNotFound'
  | 'msg.noRepos'
  | 'msg.reindexQueued'
  | 'msg.repoAdded'
  | 'msg.reindexNow'
  | 'msg.setupWrote'
  | 'msg.openFile'
  | 'prompt.apiKeyTitle'
  | 'prompt.apiKeyPrompt'
  | 'prompt.selectProject'
  | 'prompt.reindexWhich'
  | 'prompt.setupTitle'
  | 'prompt.contextTitle'
  | 'prompt.contextPrompt'
  | 'prompt.aliasTitle'
  | 'prompt.aliasPrompt'
  | 'prompt.rootTitle'
  | 'prompt.rootPrompt'
  | 'progress.generating';

const en: Record<MessageKey, string> = {
  'status.notConnected': 'not connected',
  'status.connected': 'connected',
  'status.error': 'error',
  'status.connecting': 'connecting…',
  'panel.notConnectedHint': 'Not connected. Set your API key to begin.',
  'panel.pickProjectHint': 'Connected. Pick a project to load its index.',
  'panel.serverHint': 'Server: {url} — make sure it points at the brain-dock API.',
  'btn.connect': 'Connect (set API key)',
  'btn.settings': 'Settings',
  'btn.retry': 'Retry',
  'btn.signOut': 'Sign out',
  'btn.selectProject': 'Select project',
  'btn.change': 'change',
  'btn.setupAgents': 'Setup Agents',
  'btn.reindex': 'Force Re-index',
  'btn.generateContext': 'Generate Context Capsule',
  'btn.addRepository': 'Add / Connect Repository',
  'btn.switchProject': 'Switch Project',
  'btn.viewLogs': 'View Logs',
  'btn.indexWorkspace': 'Index this workspace',
  'msg.noWorkspace': 'Open a folder in VS Code first.',
  'progress.provisioning': 'brain-dock: setting up the project…',
  'progress.uploading': 'uploading {n} files…',
  'msg.workspaceReady': 'Project {name} is indexing.',
  'btn.save': 'Save',
  'btn.cancel': 'Cancel',
  'field.serverUrl': 'Server URL (REST API)',
  'field.mcpUrl': 'MCP URL',
  'field.project': 'Project (slug or id)',
  'field.language': 'Language',
  'field.apiKey': 'API key',
  'field.apiKeyKeep': 'Leave blank to keep the current key',
  'opt.langAuto': 'Auto (VS Code)',
  'msg.settingsSaved': 'Settings saved.',
  'label.settings': 'SETTINGS',
  'label.project': 'PROJECT',
  'label.index': 'INDEX',
  'label.tokenSavings': 'TOKEN SAVINGS',
  'label.actions': 'ACTIONS',
  'label.repositories': 'REPOSITORIES',
  'metric.symbols': 'symbols',
  'metric.files': 'files',
  'metric.repos': 'repos',
  'metric.estSaved': 'est. saved',
  'metric.avgSaving': 'avg saving',
  'metric.calls': 'calls',
  'metric.edges': 'edges',
  'idx.symbols': 'Symbols',
  'idx.edges': 'Edges',
  'idx.files': 'Files',
  'usage.calls': 'Calls',
  'usage.tokens': 'Tokens served',
  'period.today': 'Today',
  'period.days': 'days',
  'label.usage': 'USAGE',
  'status.server': 'brain-dock',
  'msg.apiKeySaved': 'API key saved.',
  'msg.signedOut': 'Signed out.',
  'msg.connectFirst': 'Connect and select a project first.',
  'msg.selectProjectFirst': 'Set your API key first (Connect).',
  'msg.noProjects': 'No projects yet — create one via the API.',
  'msg.projectNotFound': 'Active project not found.',
  'msg.noRepos': 'No repositories yet.',
  'msg.reindexQueued': 'Re-index queued for {name}.',
  'msg.repoAdded': 'Added repository {name}.',
  'msg.reindexNow': 'Re-index now',
  'msg.setupWrote':
    'Wrote MCP config to {n} file(s). They contain your API key — gitignore them if this repo is shared.',
  'msg.openFile': 'Open file',
  'prompt.apiKeyTitle': 'brain-dock API key',
  'prompt.apiKeyPrompt': 'Paste your bd_… API key',
  'prompt.selectProject': 'Select brain-dock project',
  'prompt.reindexWhich': 'Re-index which repository?',
  'prompt.setupTitle': 'Setup Agents — write the brain-dock MCP config',
  'prompt.contextTitle': 'Generate context',
  'prompt.contextPrompt': 'Describe the task or question to assemble context for',
  'prompt.aliasTitle': 'Add repository — alias',
  'prompt.aliasPrompt': 'Short unique alias (e.g. api)',
  'prompt.rootTitle': 'Add repository — root path',
  'prompt.rootPrompt': 'Filesystem path the server/worker can read',
  'progress.generating': 'brain-dock: generating context…',
};

const ru: Record<MessageKey, string> = {
  'status.notConnected': 'не подключено',
  'status.connected': 'подключено',
  'status.error': 'ошибка',
  'status.connecting': 'подключение…',
  'panel.notConnectedHint': 'Не подключено. Укажите API-ключ, чтобы начать.',
  'panel.pickProjectHint': 'Подключено. Выберите проект, чтобы загрузить индекс.',
  'panel.serverHint': 'Сервер: {url} — проверьте, что он указывает на API brain-dock.',
  'btn.connect': 'Подключиться (ввести API-ключ)',
  'btn.settings': 'Настройки',
  'btn.retry': 'Повторить',
  'btn.signOut': 'Выйти',
  'btn.selectProject': 'Выбрать проект',
  'btn.change': 'сменить',
  'btn.setupAgents': 'Настроить агентов',
  'btn.reindex': 'Переиндексировать',
  'btn.generateContext': 'Собрать контекст',
  'btn.addRepository': 'Добавить репозиторий',
  'btn.switchProject': 'Сменить проект',
  'btn.viewLogs': 'Показать логи',
  'btn.indexWorkspace': 'Проиндексировать эту папку',
  'msg.noWorkspace': 'Сначала откройте папку в VS Code.',
  'progress.provisioning': 'brain-dock: настраиваю проект…',
  'progress.uploading': 'загружаю {n} файлов…',
  'msg.workspaceReady': 'Проект {name} индексируется.',
  'btn.save': 'Сохранить',
  'btn.cancel': 'Отмена',
  'field.serverUrl': 'URL сервера (REST API)',
  'field.mcpUrl': 'URL MCP',
  'field.project': 'Проект (slug или id)',
  'field.language': 'Язык',
  'field.apiKey': 'API-ключ',
  'field.apiKeyKeep': 'Оставьте пустым, чтобы не менять ключ',
  'opt.langAuto': 'Авто (VS Code)',
  'msg.settingsSaved': 'Настройки сохранены.',
  'label.settings': 'НАСТРОЙКИ',
  'label.project': 'ПРОЕКТ',
  'label.index': 'ИНДЕКС',
  'label.tokenSavings': 'ЭКОНОМИЯ ТОКЕНОВ',
  'label.actions': 'ДЕЙСТВИЯ',
  'label.repositories': 'РЕПОЗИТОРИИ',
  'metric.symbols': 'символов',
  'metric.files': 'файлов',
  'metric.repos': 'репозиториев',
  'metric.estSaved': 'сэкономлено≈',
  'metric.avgSaving': 'ср. экономия',
  'metric.calls': 'вызовов',
  'metric.edges': 'рёбер',
  'idx.symbols': 'Символы',
  'idx.edges': 'Рёбра',
  'idx.files': 'Файлы',
  'usage.calls': 'Вызовов',
  'usage.tokens': 'Токенов отдано',
  'period.today': 'Сегодня',
  'period.days': 'дней',
  'label.usage': 'ИСПОЛЬЗОВАНИЕ',
  'status.server': 'brain-dock',
  'msg.apiKeySaved': 'API-ключ сохранён.',
  'msg.signedOut': 'Вы вышли.',
  'msg.connectFirst': 'Сначала подключитесь и выберите проект.',
  'msg.selectProjectFirst': 'Сначала введите API-ключ (Подключиться).',
  'msg.noProjects': 'Проектов пока нет — создайте через API.',
  'msg.projectNotFound': 'Активный проект не найден.',
  'msg.noRepos': 'Репозиториев пока нет.',
  'msg.reindexQueued': 'Переиндексация поставлена в очередь для {name}.',
  'msg.repoAdded': 'Репозиторий {name} добавлен.',
  'msg.reindexNow': 'Переиндексировать сейчас',
  'msg.setupWrote':
    'MCP-конфиг записан в {n} файл(ов). В них ваш API-ключ — добавьте их в .gitignore, если репозиторий общий.',
  'msg.openFile': 'Открыть файл',
  'prompt.apiKeyTitle': 'API-ключ brain-dock',
  'prompt.apiKeyPrompt': 'Вставьте ваш ключ bd_…',
  'prompt.selectProject': 'Выберите проект brain-dock',
  'prompt.reindexWhich': 'Какой репозиторий переиндексировать?',
  'prompt.setupTitle': 'Настроить агентов — записать MCP-конфиг brain-dock',
  'prompt.contextTitle': 'Собрать контекст',
  'prompt.contextPrompt': 'Опишите задачу или вопрос, под который собрать контекст',
  'prompt.aliasTitle': 'Добавить репозиторий — алиас',
  'prompt.aliasPrompt': 'Короткий уникальный алиас (например, api)',
  'prompt.rootTitle': 'Добавить репозиторий — путь',
  'prompt.rootPrompt': 'Путь в файловой системе, доступный серверу/воркеру',
  'progress.generating': 'brain-dock: собираю контекст…',
};

const STRINGS: Record<Lang, Record<MessageKey, string>> = { en, ru };

/** Translate a key for a language, interpolating `{var}` placeholders. Falls back to English. */
export function t(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}
