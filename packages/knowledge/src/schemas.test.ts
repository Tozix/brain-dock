import { describe, expect, it } from 'bun:test';
import { rememberSchema, saveKnowledgeSchema } from './schemas';

describe('rememberSchema', () => {
  it('accepts a minimal memory and defaults type later', () => {
    const parsed = rememberSchema.safeParse({ projectId: 'p1', content: 'we chose Bun' });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty content / project and bad type', () => {
    expect(rememberSchema.safeParse({ projectId: '', content: 'x' }).success).toBe(false);
    expect(rememberSchema.safeParse({ projectId: 'p', content: '' }).success).toBe(false);
    expect(rememberSchema.safeParse({ projectId: 'p', content: 'x', type: 'WAT' }).success).toBe(
      false,
    );
  });
});

describe('saveKnowledgeSchema', () => {
  it('requires title and content', () => {
    expect(
      saveKnowledgeSchema.safeParse({ projectId: 'p', title: 'Auth', content: 'JWT + refresh' })
        .success,
    ).toBe(true);
    expect(saveKnowledgeSchema.safeParse({ projectId: 'p', content: 'x' }).success).toBe(false);
  });

  it('accepts a valid knowledge type and tags', () => {
    const parsed = saveKnowledgeSchema.safeParse({
      projectId: 'p',
      title: 'ADR-1',
      content: 'use bun',
      type: 'ADR',
      tags: ['stack'],
    });
    expect(parsed.success).toBe(true);
  });
});
