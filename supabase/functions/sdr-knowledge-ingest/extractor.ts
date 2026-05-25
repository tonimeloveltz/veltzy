/**
 * Extractor — Extrai texto de PDF, DOCX, TXT, MD.
 */

export async function extractText(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractPdf(fileBuffer)

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractDocx(fileBuffer)

    case 'text/plain':
    case 'text/markdown':
      return new TextDecoder('utf-8').decode(fileBuffer)

    default:
      throw new Error(`Tipo de arquivo nao suportado: ${mimeType} (${fileName})`)
  }
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  // pdf-parse via esm.sh
  const pdfParse = (await import('https://esm.sh/pdf-parse@1.1.1')).default
  const result = await pdfParse(new Uint8Array(buffer))
  return result.text ?? ''
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  // mammoth via esm.sh
  const mammoth = await import('https://esm.sh/mammoth@1.8.0')
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value ?? ''
}
