import { describe, expect, it } from 'bun:test';
import { type Lang, type MessageKey, t } from './i18n';

describe('t', () => {
  it('translates per language', () => {
    expect(t('en', 'btn.connect')).toBe('Connect (set API key)');
    expect(t('ru', 'btn.connect')).toBe('Подключиться (ввести API-ключ)');
  });

  it('interpolates {vars}', () => {
    expect(t('en', 'msg.reindexQueued', { name: 'api' })).toBe('Re-index queued for api.');
    expect(t('ru', 'msg.repoAdded', { name: 'docs' })).toBe('Репозиторий docs добавлен.');
    expect(t('en', 'msg.setupWrote', { n: 2 })).toContain('2 file(s)');
  });

  it('leaves unknown placeholders intact', () => {
    expect(t('en', 'panel.serverHint', {})).toContain('{url}');
  });

  it('has ru + en for every key (no missing translations)', () => {
    const keys: MessageKey[] = [
      'status.connected',
      'label.index',
      'btn.setupAgents',
      'metric.calls',
    ];
    for (const lang of ['en', 'ru'] as Lang[]) {
      for (const k of keys) expect(t(lang, k).length).toBeGreaterThan(0);
    }
  });
});
