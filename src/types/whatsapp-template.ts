// Espelha veltzy.whatsapp_templates (catalogo de templates HSM da Cloud API).
// O catalogo guarda so metadados (texto generico com {{n}}), sem PII.

export type TemplateStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED'

// Componente cru da Graph (HEADER/BODY/FOOTER/BUTTONS). Mantido flexivel: usado
// para preview e contagem de variaveis ({{n}}); a forma exata varia por tipo.
export interface TemplateComponent {
  type: string
  [key: string]: unknown
}

export interface WhatsAppTemplate {
  id: string
  company_id: string
  cloud_api_number_id: string | null
  waba_id: string
  meta_template_id: string | null
  name: string
  language: string
  category: TemplateCategory
  status: TemplateStatus
  quality_rating: QualityRating | null
  components: TemplateComponent[]
  rejected_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Variavel {{n}} de um template (indice 1-based + exemplo).
export interface TemplateVariable {
  index: number
  example?: string
}
