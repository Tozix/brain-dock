// Runtime i18n for the panel + dialogs. Pure (no `vscode` import) so it is unit-testable; the active
// language is resolved in config.ts and passed in. Command-palette titles are localized separately
// via package.nls*.json (those follow the VS Code display language).

export type Lang = 'en' | 'ru';

export type MessageKey =
  | 'status.notConnected'
  | 'status.connected'
  | 'status.error'
  | 'status.connecting'
  | 'panel.pickProjectHint'
  | 'panel.serverHint'
  | 'btn.settings'
  | 'btn.retry'
  | 'btn.signOut'
  | 'btn.setupAgents'
  | 'btn.reindex'
  | 'btn.addRepository'
  | 'btn.viewLogs'
  | 'btn.indexWorkspace'
  | 'msg.noWorkspace'
  | 'progress.provisioning'
  | 'progress.uploading'
  | 'progress.indexing'
  | 'msg.workspaceReady'
  | 'msg.autoIndexAsk'
  | 'btn.autoIndexYes'
  | 'btn.autoIndexNever'
  | 'msg.uploadTruncated'
  | 'msg.multiRootOnlyFirst'
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
  | 'label.actions'
  | 'label.repositories'
  | 'metric.symbols'
  | 'metric.files'
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
  | 'msg.setApiKeyFirst'
  | 'msg.noProjects'
  | 'msg.projectNotFound'
  | 'msg.repoAdded'
  | 'msg.reindexNow'
  | 'msg.setupWrote'
  | 'msg.openFile'
  | 'prompt.apiKeyTitle'
  | 'prompt.apiKeyPrompt'
  | 'prompt.selectProject'
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
  'panel.pickProjectHint': 'Connected. Pick a project to load its index.',
  'panel.serverHint': 'Server: {url} — make sure it points at the brain-dock API.',
  'btn.settings': 'Settings',
  'btn.retry': 'Retry',
  'btn.signOut': 'Sign out',
  'btn.setupAgents': 'Setup Agents',
  'btn.reindex': 'Force Re-index',
  'btn.addRepository': 'Add / Connect Repository',
  'btn.viewLogs': 'View Logs',
  'btn.indexWorkspace': 'Index this workspace',
  'msg.noWorkspace': 'Open a folder in VS Code first.',
  'progress.provisioning': 'brain-dock: setting up the project…',
  'progress.uploading': 'uploading {n} files…',
  'progress.indexing': 'indexing on the server…',
  'msg.workspaceReady': 'Project {name} is indexing.',
  'msg.autoIndexAsk': 'Index this folder in Brain Dock?',
  'btn.autoIndexYes': 'Yes',
  'btn.autoIndexNever': 'Never',
  'msg.uploadTruncated':
    'Upload limit of {mb} MB reached — indexing the first {n} files; the rest were skipped.',
  'msg.multiRootOnlyFirst': 'Multi-root workspace: only the first folder ({name}) is indexed.',
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
  'label.actions': 'ACTIONS',
  'label.repositories': 'REPOSITORIES',
  'metric.symbols': 'symbols',
  'metric.files': 'files',
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
  'msg.setApiKeyFirst': 'Set your API key first (Connect).',
  'msg.noProjects': 'No projects yet — create one via the API.',
  'msg.projectNotFound': 'Active project not found.',
  'msg.repoAdded': 'Added repository {name}.',
  'msg.reindexNow': 'Re-index now',
  'msg.setupWrote':
    'Wrote MCP config to {n} file(s). They contain your API key — gitignore them if this repo is shared.',
  'msg.openFile': 'Open file',
  'prompt.apiKeyTitle': 'brain-dock API key',
  'prompt.apiKeyPrompt': 'Paste your bd_… API key',
  'prompt.selectProject': 'Select brain-dock project',
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
  'panel.pickProjectHint': 'Подключено. Выберите проект, чтобы загрузить индекс.',
  'panel.serverHint': 'Сервер: {url} — проверьте, что он указывает на API brain-dock.',
  'btn.settings': 'Настройки',
  'btn.retry': 'Повторить',
  'btn.signOut': 'Выйти',
  'btn.setupAgents': 'Настроить агентов',
  'btn.reindex': 'Переиндексировать',
  'btn.addRepository': 'Добавить репозиторий',
  'btn.viewLogs': 'Показать логи',
  'btn.indexWorkspace': 'Проиндексировать эту папку',
  'msg.noWorkspace': 'Сначала откройте папку в VS Code.',
  'progress.provisioning': 'brain-dock: настраиваю проект…',
  'progress.uploading': 'загружаю {n} файлов…',
  'progress.indexing': 'индексация на сервере…',
  'msg.workspaceReady': 'Проект {name} индексируется.',
  'msg.autoIndexAsk': 'Проиндексировать эту папку в Brain Dock?',
  'btn.autoIndexYes': 'Да',
  'btn.autoIndexNever': 'Никогда',
  'msg.uploadTruncated':
    'Достигнут лимит выгрузки {mb} МБ — индексируются первые {n} файлов, остальные пропущены.',
  'msg.multiRootOnlyFirst': 'Multi-root workspace: индексируется только первая папка ({name}).',
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
  'label.actions': 'ДЕЙСТВИЯ',
  'label.repositories': 'РЕПОЗИТОРИИ',
  'metric.symbols': 'символов',
  'metric.files': 'файлов',
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
  'msg.setApiKeyFirst': 'Сначала введите API-ключ (Подключиться).',
  'msg.noProjects': 'Проектов пока нет — создайте через API.',
  'msg.projectNotFound': 'Активный проект не найден.',
  'msg.repoAdded': 'Репозиторий {name} добавлен.',
  'msg.reindexNow': 'Переиндексировать сейчас',
  'msg.setupWrote':
    'MCP-конфиг записан в {n} файл(ов). В них ваш API-ключ — добавьте их в .gitignore, если репозиторий общий.',
  'msg.openFile': 'Открыть файл',
  'prompt.apiKeyTitle': 'API-ключ brain-dock',
  'prompt.apiKeyPrompt': 'Вставьте ваш ключ bd_…',
  'prompt.selectProject': 'Выберите проект brain-dock',
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
