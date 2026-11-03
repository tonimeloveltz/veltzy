import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  totalRows: number
  previewRows: string[][]
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const isXlsxFile = (file: File) =>
  file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')

const parseXlsxFile = (file: File): Promise<ParsedCsv> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          reject(new Error('Arquivo Excel vazio'))
          return
        }
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
        const [headers, ...rows] = jsonData.map((row) => row.map(String))

        if (!headers || headers.length === 0) {
          reject(new Error('Arquivo Excel vazio ou sem cabeçalho'))
          return
        }

        resolve({
          headers: headers.map((h) => h.trim()),
          rows: rows.filter((r) => r.some((cell) => cell.trim() !== '')),
          totalRows: rows.filter((r) => r.some((cell) => cell.trim() !== '')).length,
          previewRows: rows.filter((r) => r.some((cell) => cell.trim() !== '')).slice(0, 5),
        })
      } catch {
        reject(new Error('Erro ao ler arquivo Excel'))
      }
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo Excel'))
    reader.readAsArrayBuffer(file)
  })
}

export const parseCsvFile = (file: File): Promise<ParsedCsv> => {
  if (file.size > MAX_FILE_SIZE) {
    return Promise.reject(new Error('Arquivo excede o limite de 10MB'))
  }

  if (isXlsxFile(file)) {
    return parseXlsxFile(file)
  }

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          reject(new Error(`Erro ao ler CSV: ${result.errors[0].message}`))
          return
        }

        const [headers, ...rows] = result.data
        if (!headers || headers.length === 0) {
          reject(new Error('Arquivo CSV vazio ou sem cabeçalho'))
          return
        }

        resolve({
          headers: headers.map((h) => h.trim()),
          rows,
          totalRows: rows.length,
          previewRows: rows.slice(0, 5),
        })
      },
      error: (err) => reject(new Error(`Erro ao ler CSV: ${err.message}`)),
    })
  })
}

const AUTO_MAP: Record<string, string> = {
  // pt-BR (formato Veltzy export)
  'nome': 'name',
  'sobrenome': 'last_name',
  'último nome': 'last_name',
  'ultimo nome': 'last_name',
  'telefone': 'phone',
  'email': 'email',
  'origem': 'source_id',
  'pipeline': 'pipeline_id',
  'etapa': 'stage_id',
  'fase': 'stage_id',
  'temperatura': 'temperature',
  'valor do negócio': 'deal_value',
  'valor do negocio': 'deal_value',
  'valor': 'deal_value',
  'responsável': 'assigned_to',
  'responsavel': 'assigned_to',
  'observacoes': 'observations',
  'observações': 'observations',
  'tags': 'tags',
  // Inglês
  'name': 'name',
  'last name': 'last_name',
  'last_name': 'last_name',
  'surname': 'last_name',
  'phone': 'phone',
  'phone number': 'phone',
  'telephone': 'phone',
  'mobile': 'phone',
  'email address': 'email',
  'source': 'source_id',
  'stage': 'stage_id',
  'pipeline stage': 'stage_id',
  'temperature': 'temperature',
  'deal value': 'deal_value',
  'value': 'deal_value',
  'amount': 'deal_value',
  'assigned to': 'assigned_to',
  'owner': 'assigned_to',
  'responsible': 'assigned_to',
  'notes': 'observations',
  'comments': 'observations',
  // HubSpot
  'first name': 'name',
  'contact name': 'name',
  'contact owner': 'assigned_to',
  // RD Station
  'nome completo': 'name',
  'celular': 'phone',
}

export type LeadField = 'name' | 'last_name' | 'phone' | 'email' | 'source_id' | 'pipeline_id' | 'stage_id' | 'temperature' | 'deal_value' | 'assigned_to' | 'observations' | 'tags'

export const LEAD_FIELD_LABELS: Record<LeadField, string> = {
  name: 'Nome',
  last_name: 'Sobrenome',
  phone: 'Telefone',
  email: 'Email',
  source_id: 'Origem',
  pipeline_id: 'Pipeline',
  stage_id: 'Etapa',
  temperature: 'Temperatura',
  deal_value: 'Valor do Negocio',
  assigned_to: 'Responsavel',
  observations: 'Observações',
  tags: 'Tags',
}

export const autoMapColumns = (headers: string[]): Record<number, LeadField | null> => {
  const mapping: Record<number, LeadField | null> = {}
  const usedFields = new Set<string>()

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim()
    const field = AUTO_MAP[normalized] as LeadField | undefined
    if (field && !usedFields.has(field)) {
      mapping[index] = field
      usedFields.add(field)
    } else {
      mapping[index] = null
    }
  })

  return mapping
}
