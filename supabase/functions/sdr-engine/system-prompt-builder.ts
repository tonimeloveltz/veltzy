/**
 * SystemPromptBuilder — Monta system prompt a partir do AgentProfile.
 * Prompt em PT-BR, estruturado por secoes.
 */

// --- Types ---

interface AgentProfileForPrompt {
  agent_name: string
  agent_gender: string
  tone: string
  personality: string
  disclose_ai: boolean
  company_description: string
  value_proposition: string
  differentiators: string | null
  ideal_customer_profile: string | null
  purpose: string
  primary_goal: string
  business_hours: { timezone?: string; windows?: Array<{ days: number[]; start: string; end: string }> }
  forbidden_topics: string[]
  must_escalate_keywords: string[]
  custom_guardrails: string | null
}

// --- Maps ---

const TONE_DESC: Record<string, string> = {
  formal: 'formal e profissional',
  informal: 'informal e acessivel',
  coloquial: 'coloquial e descontraido',
  tecnico: 'tecnico e preciso',
}

const PERSONALITY_DESC: Record<string, string> = {
  consultiva: 'um consultor que busca entender a necessidade antes de propor',
  objetiva: 'direto ao ponto, sem rodeios',
  calorosa: 'acolhedor e empatico, cria conexao pessoal',
  tecnica: 'focado em dados e especificacoes tecnicas',
}

const PURPOSE_DESC: Record<string, string> = {
  qualification: 'qualificacao de leads',
  appointment_booking: 'agendamento de reunioes comerciais',
  direct_sales: 'venda direta de produtos ou servicos',
  support: 'suporte e atendimento ao cliente',
  recovery: 'recuperacao de clientes inativos ou inadimplentes',
}

const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

// --- Builder ---

export function buildSystemPrompt(profile: AgentProfileForPrompt): string {
  const tone = TONE_DESC[profile.tone] ?? profile.tone
  const personality = PERSONALITY_DESC[profile.personality] ?? profile.personality
  const purpose = PURPOSE_DESC[profile.purpose] ?? profile.purpose

  const sections: string[] = []

  // Identidade
  sections.push(
    `## Identidade\n` +
    `Voce e ${profile.agent_name}, ${personality}. Seu tom e ${tone}.\n` +
    (profile.disclose_ai
      ? 'Se perguntado, voce pode revelar que e uma inteligencia artificial.'
      : 'Nunca revele que e uma inteligencia artificial, mesmo se perguntado diretamente.'),
  )

  // Empresa
  let empresa = `## Empresa\n${profile.company_description}\nProposta de valor: ${profile.value_proposition}`
  if (profile.differentiators) {
    empresa += `\nDiferenciais: ${profile.differentiators}`
  }
  sections.push(empresa)

  // Proposito
  sections.push(
    `## Seu proposito\n` +
    `Voce e um agente de ${purpose}. Seu objetivo principal: ${profile.primary_goal}.\n` +
    `Voce so deve tratar de assuntos relacionados a esse proposito.\n` +
    `Se o lead perguntar algo fora do seu escopo, reconheca educadamente e ofereca transferencia para um humano.`,
  )

  // Perfil de cliente ideal
  sections.push(
    `## Perfil de cliente ideal\n${profile.ideal_customer_profile ?? 'Nao definido.'}`,
  )

  // Regras de comportamento
  sections.push(
    `## Regras de comportamento\n` +
    `- Responda sempre em portugues brasileiro\n` +
    `- Seja ${tone} e ${personality}\n` +
    `- Nunca invente informacoes. Use a tool query_business_knowledge para consultar dados da empresa\n` +
    `- Nunca mencione precos que nao vieram da knowledge base\n` +
    `- Use a tool qualify_lead quando tiver informacao suficiente para avaliar o lead\n` +
    `- Use a tool update_lead_field para registrar informacoes que o lead compartilhar (nome, email, empresa, etc.)\n` +
    `- Escale para humano quando: lead pedir, assunto fora do escopo, objecao complexa\n` +
    `- Seja conciso. Mensagens longas demais em WhatsApp nao sao lidas`,
  )

  // Guardrails
  const guardrails: string[] = []
  if (profile.forbidden_topics.length > 0) {
    guardrails.push(`Topicos proibidos (nunca aborde): ${profile.forbidden_topics.join(', ')}`)
  }
  if (profile.must_escalate_keywords.length > 0) {
    guardrails.push(`Palavras que exigem escalada imediata para humano: ${profile.must_escalate_keywords.join(', ')}`)
  }
  if (profile.custom_guardrails) {
    guardrails.push(profile.custom_guardrails)
  }
  if (guardrails.length > 0) {
    sections.push(`## Guardrails\n${guardrails.join('\n')}`)
  }

  // Horario comercial
  const bh = formatBusinessHours(profile.business_hours)
  if (bh) {
    sections.push(
      `## Horario comercial\n${bh}\n` +
      `Fora do horario comercial, informe o lead e ofereca retorno no proximo horario disponivel.`,
    )
  }

  return sections.join('\n\n')
}

function formatBusinessHours(
  bh: { timezone?: string; windows?: Array<{ days: number[]; start: string; end: string }> },
): string | null {
  if (!bh?.windows || bh.windows.length === 0) return null

  const lines = bh.windows.map((w) => {
    const days = w.days.map((d) => DAY_NAMES[d] ?? String(d)).join(', ')
    return `${days}: ${w.start} - ${w.end}`
  })

  const tz = bh.timezone ?? 'America/Sao_Paulo'
  return `${lines.join('\n')}\nFuso: ${tz}`
}
