import { describe, expect, it } from 'bun:test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractText } from './parsers';

async function makePdfBase64(text: string): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 18, font });
  return Buffer.from(await doc.save()).toString('base64');
}

async function makeDocxBase64(text: string): Promise<string> {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }],
  });
  return (await Packer.toBuffer(doc)).toString('base64');
}

describe('extractText', () => {
  it('passes text formats through unchanged', async () => {
    expect(await extractText('MD', '# Heading\n\nbody')).toBe('# Heading\n\nbody');
  });

  it('extracts text from a real PDF (base64)', async () => {
    const b64 = await makePdfBase64('brain dock pdf extraction works');
    expect(await extractText('PDF', b64)).toContain('brain dock pdf extraction works');
  });

  it('extracts text from a real DOCX (base64)', async () => {
    const b64 = await makeDocxBase64('brain dock docx extraction works');
    expect(await extractText('DOCX', b64)).toContain('brain dock docx extraction works');
  });
});
