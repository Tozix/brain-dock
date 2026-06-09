export const TEXT_FORMATS = ['MD', 'TXT', 'MDX', 'JSON', 'YAML'] as const;
export type TextFormat = (typeof TEXT_FORMATS)[number];
export type DocFormatValue = TextFormat | 'PDF' | 'DOCX';

/**
 * Extract plain searchable text from a document payload. Text formats pass through;
 * PDF/DOCX parsing is not wired yet (the interface is ready for it).
 */
export function extractText(format: DocFormatValue, raw: string): string {
  switch (format) {
    case 'MD':
    case 'MDX':
    case 'TXT':
    case 'JSON':
    case 'YAML':
      return raw;
    default:
      throw new Error(`Ingestion of ${format} is not supported yet (text formats only).`);
  }
}
