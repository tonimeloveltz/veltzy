/**
 * Chunker — Divide texto em chunks com overlap para embeddings.
 * Estrategia: chunk por paragrafos/sentencas com fallback por tamanho.
 */

const TARGET_CHUNK_CHARS = 2000   // ~500 tokens (1 token ~= 4 chars PT-BR)
const OVERLAP_CHARS = 200         // ~50 tokens overlap

export interface Chunk {
  content: string
  index: number
  metadata: {
    word_count: number
    page_number?: number
  }
}

/**
 * Divide texto em chunks respeitando limites de paragrafo/sentenca.
 * pageBreaks: array de indices de caractere onde muda de pagina (para PDFs).
 */
export function chunkText(text: string, pageBreaks?: number[]): Chunk[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!cleaned) return []

  const paragraphs = cleaned.split(/\n\n+/)
  const chunks: Chunk[] = []
  let currentContent = ''
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue

    // Se paragrafo sozinho ja excede o limite, dividir por sentencas
    if (trimmed.length > TARGET_CHUNK_CHARS) {
      // Flush buffer atual antes
      if (currentContent) {
        chunks.push(makeChunk(currentContent, chunkIndex++, pageBreaks))
        currentContent = getOverlap(currentContent)
      }

      const sentences = splitSentences(trimmed)
      for (const sentence of sentences) {
        if (currentContent.length + sentence.length + 1 > TARGET_CHUNK_CHARS && currentContent) {
          chunks.push(makeChunk(currentContent, chunkIndex++, pageBreaks))
          currentContent = getOverlap(currentContent)
        }
        currentContent += (currentContent ? ' ' : '') + sentence
      }
      continue
    }

    // Paragrafo cabe no chunk atual?
    if (currentContent.length + trimmed.length + 2 > TARGET_CHUNK_CHARS && currentContent) {
      chunks.push(makeChunk(currentContent, chunkIndex++, pageBreaks))
      currentContent = getOverlap(currentContent)
    }

    currentContent += (currentContent ? '\n\n' : '') + trimmed
  }

  // Flush ultimo chunk
  if (currentContent.trim()) {
    chunks.push(makeChunk(currentContent, chunkIndex++, pageBreaks))
  }

  return chunks
}

function makeChunk(content: string, index: number, pageBreaks?: number[]): Chunk {
  const trimmed = content.trim()
  return {
    content: trimmed,
    index,
    metadata: {
      word_count: trimmed.split(/\s+/).length,
      ...(pageBreaks ? { page_number: resolvePageNumber(trimmed, pageBreaks) } : {}),
    },
  }
}

function getOverlap(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text
  // Pegar ultimos OVERLAP_CHARS, cortando no inicio da sentenca mais proxima
  const tail = text.slice(-OVERLAP_CHARS)
  const sentenceStart = tail.indexOf('. ')
  if (sentenceStart > 0 && sentenceStart < OVERLAP_CHARS / 2) {
    return tail.slice(sentenceStart + 2)
  }
  return tail
}

function splitSentences(text: string): string[] {
  // Split por pontuacao final seguida de espaco ou fim
  const raw = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g)
  return (raw ?? [text]).map((s) => s.trim()).filter(Boolean)
}

function resolvePageNumber(_content: string, _pageBreaks: number[]): number | undefined {
  // Simplificacao: retorna undefined por ora (page tracking exigiria offset tracking no split)
  return undefined
}
