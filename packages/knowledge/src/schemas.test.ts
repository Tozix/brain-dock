import { describe, expect, it } from 'bun:test';
import {
  rememberSchema,
  saveDocumentSchema,
  saveKnowledgeSchema,
  updateDocumentSchema,
} from './schemas';

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

describe('saveDocumentSchema', () => {
  it('defaults format to MD', () => {
    const parsed = saveDocumentSchema.safeParse({ projectId: 'p', title: 'Doc', content: '# Hi' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.format).toBe('MD');
  });

  it('accepts PDF/DOCX formats and rejects unknown formats / empty content', () => {
    expect(
      saveDocumentSchema.safeParse({ projectId: 'p', title: 'D', content: 'base64', format: 'PDF' })
        .success,
    ).toBe(true);
    expect(
      saveDocumentSchema.safeParse({ projectId: 'p', title: 'D', content: 'x', format: 'EXE' })
        .success,
    ).toBe(false);
    expect(saveDocumentSchema.safeParse({ projectId: 'p', title: 'D', content: '' }).success).toBe(
      false,
    );
  });
});

describe('updateDocumentSchema', () => {
  it('accepts an empty patch and partial fields', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(true);
    expect(updateDocumentSchema.safeParse({ title: 'New' }).success).toBe(true);
    expect(updateDocumentSchema.safeParse({ content: '# updated', format: 'MD' }).success).toBe(
      true,
    );
  });

  it('rejects empty content and unknown format', () => {
    expect(updateDocumentSchema.safeParse({ content: '' }).success).toBe(false);
    expect(updateDocumentSchema.safeParse({ format: 'EXE' }).success).toBe(false);
  });
});
