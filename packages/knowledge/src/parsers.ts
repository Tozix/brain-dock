import mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';

export const TEXT_FORMATS = ['MD', 'TXT', 'MDX', 'JSON', 'YAML'] as const;
export const BINARY_FORMATS = ['PDF', 'DOCX'] as const;
export const ALL_FORMATS = [...TEXT_FORMATS, ...BINARY_FORMATS] as const;
export type TextFormat = (typeof TEXT_FORMATS)[number];
export type DocFormatValue = (typeof ALL_FORMATS)[number];

async function fromPdf(base64: string): Promise<string> {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractPdfText(pdf, { mergePages: true });
  return text;
}

async function fromDocx(base64: string): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(base64, 'base64') });
  return value;
}

/**
 * Extract plain searchable text from a document payload.
 * Text formats (md/txt/mdx/json/yaml) pass through; PDF/DOCX expect **base64** content.
 */
export async function extractText(format: DocFormatValue, raw: string): Promise<string> {
  switch (format) {
    case 'MD':
    case 'MDX':
    case 'TXT':
    case 'JSON':
    case 'YAML':
      return raw;
    case 'PDF':
      return fromPdf(raw);
    case 'DOCX':
      return fromDocx(raw);
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }
}
