// =============================================================================
// seed-stark-tech.mjs — Seed de dados de teste (universo Marvel)
// =============================================================================
//
// Popula a empresa "Stark Tech Soluções" com dados realistas para simular o
// máximo de funcionalidades do CRM (leads, deals, mensagens, tarefas, timeline).
//
// COMO RODAR:
//   node --env-file=.env scripts/seed-stark-tech.mjs
//   (opcional) node --env-file=.env scripts/seed-stark-tech.mjs <COMPANY_ID>
//
// REQUISITOS DE AMBIENTE (lidos do .env local, NUNCA hardcoded):
//   SUPABASE_SERVICE_ROLE_KEY   -> obrigatória (bypassa RLS)
//   VITE_SUPABASE_URL           -> URL do projeto (SUPABASE_URL também aceito)
//
// SEGURANÇA / GARANTIAS:
//   - Sem credenciais hardcoded. Service role só via env.
//   - Idempotente por email: re-rodar NÃO duplica leads (nem filhos).
//   - Sem webhook, sem Evolution API: apenas INSERT no banco.
//   - Sem rollback: em erro no meio, o que já entrou fica; reporta estado parcial.
//   - Todas as tabelas de domínio vivem no schema `veltzy`; profiles em `public`.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

// --- company_id hardcoded SÓ PARA ESTA EXECUÇÃO (não vai no .env). -----------
// Pode ser sobrescrito pelo 1º argumento de linha de comando.
const COMPANY_ID = process.argv[2] || '44f69ec0-cf37-44cc-be4c-130930f45f45' // Stark Tech Soluções

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('❌ Falta SUPABASE_URL / VITE_SUPABASE_URL no ambiente (.env).')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY no ambiente (.env).')
  process.exit(1)
}

// Client no schema veltzy (leads, deals, messages, tasks, pipelines, etc.)
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: 'veltzy' },
  auth: { persistSession: false },
})
// Client no schema public (profiles)
const pub = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// --- Helpers ----------------------------------------------------------------
const counters = { leads: 0, deals: 0, messages: 0, tasks: 0, activity_logs: 0, lead_sources: 0 }
const created = { lead_sources: [] }

function chunk(arr, size = 50) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function daysAgo(n, hour = 10) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, (n * 7) % 60, 0, 0)
  return d.toISOString()
}

function daysFromNow(n, hour = 9) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

async function insertBatch(table, client, rows, returning = false) {
  if (!rows.length) return []
  const result = []
  for (const part of chunk(rows, 50)) {
    let q = client.from(table).insert(part)
    if (returning) q = q.select('id')
    const { data, error } = await q
    if (error) {
      console.error(`\n❌ Erro inserindo em ${table}:`, error.message)
      console.error('   Estado parcial até aqui:', JSON.stringify(counters))
      process.exit(1)
    }
    counters[table] += part.length
    if (returning && data) result.push(...data)
  }
  return result
}

// --- Dados base: 30 personagens Marvel (únicos) -----------------------------
const NAMES = [
  'Tony Stark', 'Steve Rogers', 'Natasha Romanoff', 'Bruce Banner', 'Thor Odinson',
  'Peter Parker', 'Wanda Maximoff', 'Stephen Strange', "T'Challa", 'Scott Lang',
  'Carol Danvers', 'Sam Wilson', 'Bucky Barnes', 'Clint Barton', 'Nick Fury',
  'Pepper Potts', 'Happy Hogan', 'Maria Hill', 'Phil Coulson', 'Loki Laufeyson',
  'Hela Odinsdottir', 'Gamora', 'Nebula', 'Peter Quill', 'Drax',
  'Mantis', 'Rocket Raccoon', 'Groot', 'Vision', 'Shuri',
]

function emailFor(name) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '@marvel.com'
}

function phoneFor(i) {
  const d8 = String(40000000 + (i * 375731) % 50000000).padStart(8, '0')
  return `55 11 9${d8.slice(0, 4)}-${d8.slice(4)}`
}

function avatarFor(name) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`
}

// Títulos de negócio temáticos por personagem
const DEAL_TITLES = {
  'Tony Stark': 'Implantação de IA na manufatura',
  'Steve Rogers': 'Programa de liderança e treinamento de equipes',
  'Natasha Romanoff': 'Plataforma de inteligência e análise de dados',
  'Bruce Banner': 'Infraestrutura de computação científica',
  'Thor Odinson': 'Expansão internacional da operação',
  'Peter Parker': 'Plano de automação para pequena empresa',
  'Wanda Maximoff': 'Consultoria de transformação digital',
  'Stephen Strange': 'Sistema de gestão para clínica',
  "T'Challa": 'Modernização tecnológica corporativa',
  'Scott Lang': 'Solução de logística para PME',
  'Carol Danvers': 'Plataforma de comando e operações',
  'Sam Wilson': 'Sistema de monitoramento e suporte',
  'Bucky Barnes': 'Programa de reintegração e RH',
  'Clint Barton': 'CRM para equipe de vendas regional',
  'Nick Fury': 'Plataforma de segurança e compliance',
  'Pepper Potts': 'ERP financeiro corporativo',
  'Happy Hogan': 'Sistema de gestão de frotas e segurança',
  'Maria Hill': 'Plataforma de operações e BI',
  'Phil Coulson': 'Automação de processos administrativos',
  'Loki Laufeyson': 'Consultoria de reposicionamento de marca',
  'Hela Odinsdottir': 'Expansão agressiva de mercado',
  'Gamora': 'Plataforma de gestão de equipes remotas',
  'Nebula': 'Sistema de integração de dados',
  'Peter Quill': 'Marketing e aquisição de clientes',
  'Drax': 'Treinamento técnico de equipe',
  'Mantis': 'Plataforma de atendimento e CX',
  'Rocket Raccoon': 'Automação de engenharia e DevOps',
  'Groot': 'Plano de sustentabilidade ambiental',
  'Vision': 'Plataforma de analytics preditivo',
  'Shuri': 'P&D e inovação tecnológica',
}

const SECOND_DEAL_TITLES = [
  'Renovação de contrato anual', 'Upgrade de plano', 'Projeto piloto (encerrado)',
  'Expansão de licenças', 'Módulo adicional', 'Contrato anterior',
]

// Conversas temáticas (L = lead/inbound, H = human/vendedor/outbound). 3–5 cada.
const CONVERSATIONS = {
  'Tony Stark': [
    ['L', 'Recebi o material que enviaram. JARVIS já rodou uma análise do ROI da proposta.'],
    ['H', 'Que ótimo, Tony! E o que os números apontaram?'],
    ['L', 'Payback em 14 meses. Topo conversar amanhã 14h pra fechar os detalhes.'],
    ['H', 'Fechado, deixo agendado pra amanhã às 14h e te mando o convite.'],
  ],
  'Steve Rogers': [
    ['L', 'Bom dia. Queria entender melhor como funciona o treinamento da equipe.'],
    ['H', 'Bom dia, Steve! Posso te explicar por aqui ou prefere uma call rápida?'],
    ['L', 'Call cai melhor. Tenho disponibilidade depois das 16h.'],
    ['H', 'Perfeito, marco 16h30 então.'],
  ],
  'Natasha Romanoff': [
    ['L', 'Posso ligar agora?'],
    ['H', 'Pode sim, Natasha. Estou disponível.'],
    ['L', 'Ótimo. Quero alinhar os prazos antes de decidir.'],
  ],
  'Bruce Banner': [
    ['L', 'Oi, desculpa a demora pra responder. Semana corrida no laboratório.'],
    ['H', 'Sem problema, Bruce! Conseguiu dar uma olhada na proposta?'],
    ['L', 'Vi sim. Faz sentido, só preciso revisar a parte de infraestrutura com calma.'],
    ['H', 'Claro. Qualquer dúvida técnica eu chamo nosso especialista.'],
  ],
  'Thor Odinson': [
    ['L', 'Saudações! Esta tecnologia funciona em qualquer região ou apenas por aí?'],
    ['H', 'Funciona em qualquer lugar com internet, Thor 😄 e integra com várias regiões.'],
    ['L', 'Excelente. A expansão da minha operação exige algo à altura.'],
    ['H', 'Então acho que vai gostar do nosso plano de expansão internacional.'],
  ],
  'Peter Parker': [
    ['L', 'Oi! Tia May tá perguntando se dá pra parcelar em 6x sem juros.'],
    ['H', 'Oi Peter! Dá sim, 6x sem juros tranquilo.'],
    ['L', 'Aí sim, valeu! Vou confirmar com ela e te aviso.'],
  ],
  'Wanda Maximoff': [
    ['L', 'Ainda estou em dúvida se é o momento certo pra esse investimento.'],
    ['H', 'Entendo, Wanda. Quer que eu te mande um comparativo de cenários?'],
    ['L', 'Quero sim, isso ajudaria bastante a decidir.'],
  ],
  'Stephen Strange': [
    ['L', 'Preciso de algo que organize a agenda da clínica sem complicação.'],
    ['H', 'Temos exatamente isso, Dr. Strange. Posso te mostrar uma demo?'],
    ['L', 'Pode. Meu tempo é escasso, então que seja objetiva.'],
    ['H', 'Combinado, 20 minutos diretos ao ponto.'],
  ],
  "T'Challa": [
    ['L', 'Boa tarde. Buscamos modernizar nossa operação com responsabilidade.'],
    ['H', 'Boa tarde! Conta um pouco do cenário atual de vocês?'],
    ['L', 'Estrutura sólida, mas processos ainda manuais. Queremos evoluir com critério.'],
  ],
  'Scott Lang': [
    ['L', 'Cara, preciso de algo simples. Não sou muito de tecnologia, te falo a real.'],
    ['H', 'Relaxa, Scott! A plataforma é bem intuitiva, te mostro o básico.'],
    ['L', 'Boa, porque da última vez que mexi num sistema desses deu ruim haha'],
  ],
  'Carol Danvers': [
    ['L', 'Quero entender capacidade e limite da plataforma antes de bater o martelo.'],
    ['H', 'Claro, Carol. Suporta operação de alto volume sem perder performance.'],
    ['L', 'É o que preciso. Me manda os números de escalabilidade.'],
  ],
  'Sam Wilson': [
    ['L', 'Oi! To avaliando algumas opções, a de vocês tá entre as finalistas.'],
    ['H', 'Que bom, Sam! O que pesaria a favor pra fechar com a gente?'],
    ['L', 'Suporte ágil. Não quero ficar na mão depois de contratar.'],
    ['H', 'Esse é nosso ponto forte: suporte responde em minutos.'],
  ],
  'Bucky Barnes': [
    ['L', 'Tive experiências ruins com fornecedores antes. To cauteloso.'],
    ['H', 'Justo, Bucky. Posso te conectar com um cliente nosso pra referência?'],
    ['L', 'Isso ajudaria. Confio mais em quem já usou.'],
  ],
  'Clint Barton': [
    ['L', 'Oi, sou direto: preço e prazo de implantação?'],
    ['H', 'Direto também: o plano fecha conforme a proposta e a implantação leva 2 semanas.'],
    ['L', 'Bom. Vou levar pra equipe e te retorno.'],
  ],
  'Nick Fury': [
    ['L', 'Preciso saber como vocês tratam segurança e acesso aos dados.'],
    ['H', 'Boa pergunta. Temos criptografia, logs de auditoria e controle de permissão.'],
    ['L', 'Quero a documentação de compliance antes de seguir.'],
    ['H', 'Envio ainda hoje o material completo de segurança.'],
  ],
  'Pepper Potts': [
    ['L', 'Oi, tudo bem? Conseguem emitir a NF até sexta?'],
    ['H', 'Oi Pepper! Conseguimos sim, sexta de manhã está emitida.'],
    ['L', 'Perfeito, obrigada. Assim consigo fechar o mês certinho.'],
  ],
  'Happy Hogan': [
    ['L', 'Preciso de algo confiável pra gestão da frota, sem dor de cabeça.'],
    ['H', 'Entendi, Happy. Nosso módulo de frota cobre tudo isso.'],
    ['L', 'Confiável é a palavra-chave. Não posso ter sistema caindo.'],
  ],
  'Maria Hill': [
    ['L', 'Quero relatórios operacionais em tempo real. É possível?'],
    ['H', 'Sim, Maria. Os dashboards atualizam em tempo real e exportam fácil.'],
    ['L', 'Ótimo. Marca uma demo focada em BI pra mim.'],
  ],
  'Phil Coulson': [
    ['L', 'Boa tarde, gostei muito da abordagem de vocês. Bem profissional.'],
    ['H', 'Muito obrigado, Phil! Como posso ajudar a avançar?'],
    ['L', 'Queria entender o processo de implantação passo a passo.'],
  ],
  'Loki Laufeyson': [
    ['L', 'Recebi a proposta, mas tenho dúvidas sobre alguns termos do contrato.'],
    ['H', 'Claro, Loki. Quais pontos te deixaram inseguro?'],
    ['L', 'A cláusula de renovação automática. Não gosto de ser pego de surpresa.'],
    ['H', 'Entendo perfeitamente. Podemos ajustar pra renovação mediante aprovação.'],
  ],
  'Hela Odinsdottir': [
    ['L', 'Quero dominar meu mercado. Vocês entregam resultado ou só promessa?'],
    ['H', 'Resultado, com metas claras e acompanhamento. Te mostro os cases?'],
    ['L', 'Mostra. Mas saiba que minha paciência é curta.'],
  ],
  'Gamora': [
    ['L', 'Trabalho com equipe distribuída. Preciso de algo que funcione remoto.'],
    ['H', 'Perfeito, Gamora. Foi feito pra times remotos e distribuídos.'],
    ['L', 'Bom. Me explica como funciona o controle de acesso por pessoa.'],
  ],
  'Nebula': [
    ['L', 'Os dados precisam integrar com sistemas que já uso. Sem retrabalho.'],
    ['H', 'Temos API e integrações prontas, Nebula. Quais ferramentas vocês usam?'],
    ['L', 'Várias. Te mando a lista. Se integrar tudo, fechamos.'],
  ],
  'Peter Quill': [
    ['L', 'E aí! Curti a vibe da proposta. Como funciona pra trazer mais clientes?'],
    ['H', 'Fala Quill! A plataforma ajuda a captar e nutrir leads automaticamente.'],
    ['L', 'Massa. É o que eu preciso, minha agenda tá uma bagunça.'],
  ],
  'Drax': [
    ['L', "Não compreendo a metáfora 'mergulhar no projeto'. Vamos nadar?"],
    ['H', 'Haha é só uma expressão, Drax. Significa começar com tudo.'],
    ['L', 'Entendo agora. Sua explicação foi literal e satisfatória.'],
  ],
  'Mantis': [
    ['L', 'Oi! Senti uma energia boa na conversa de vocês. Quero seguir.'],
    ['H', 'Que bom, Mantis! Vamos dar o próximo passo então?'],
    ['L', 'Sim. Só me explica com calma, fico um pouco perdida nos detalhes.'],
  ],
  'Rocket Raccoon': [
    ['L', 'Olha, ou isso automatiza meu deploy de verdade ou não me interessa.'],
    ['H', 'Automatiza sim, Rocket. CI/CD completo, do commit ao deploy.'],
    ['L', 'Tá, me impressiona então. Manda a doc técnica que eu mesmo testo.'],
  ],
  'Groot': [
    ['L', 'I am Groot.'],
    ['H', 'Oi Groot! Recebi seu contato. Posso te enviar a proposta?'],
    ['L', 'I am Groot.'],
    ['H', 'Perfeito, mando agora mesmo então 🌱'],
  ],
  'Vision': [
    ['L', 'Avaliei a proposta de forma analítica. Os indicadores são favoráveis.'],
    ['H', 'Fico feliz, Vision. Algum ponto que eu possa esclarecer?'],
    ['L', 'A precisão do modelo preditivo. Quero entender a margem de erro.'],
  ],
  'Shuri': [
    ['L', 'Oi! A tecnologia de vocês é de ponta mesmo ou só marketing?'],
    ['H', 'Pode testar, Shuri 😄 te dou acesso a um ambiente de avaliação.'],
    ['L', 'Aí sim. Me manda o acesso que eu coloco à prova.'],
  ],
}

// Sources desejadas (cria as que faltarem). Mapeadas por slug.
const DESIRED_SOURCES = [
  { slug: 'whatsapp', name: 'WhatsApp', color: '#25D366', icon_name: 'MessageCircle' },
  { slug: 'instagram', name: 'Instagram', color: '#E1306C', icon_name: 'Instagram' },
  { slug: 'google-ads', name: 'Google Ads', color: '#4285F4', icon_name: 'Megaphone' },
  { slug: 'indicacao', name: 'Indicação', color: '#F59E0B', icon_name: 'Users' },
  { slug: 'site', name: 'Site', color: '#6B7280', icon_name: 'Globe' },
]

// Distribuição de leads por estágio (posição -> qtd), conforme ajuste C.
const STAGE_DISTRIBUTION = [8, 7, 6, 5, 2, 2] // Novo, Qualificando, Em Negociação, Proposta, Ganho, Perdido

// Tarefas: 1 por lead, ciclando tipo/título.
const TASK_TEMPLATES = [
  { type: 'call', title: 'Ligar para o lead' },
  { type: 'todo', title: 'Enviar proposta comercial' },
  { type: 'meeting', title: 'Agendar reunião de apresentação' },
  { type: 'followup', title: 'Fazer follow-up da proposta' },
]

// =============================================================================
async function main() {
  console.log('🚀 Seed Stark Tech Soluções — universo Marvel')
  console.log('   company_id:', COMPANY_ID)
  console.log('   URL:', SUPABASE_URL)
  console.log('')

  // --- 1) Pipeline + estágios (se não existir, REPORTA e PARA) ---------------
  const { data: pipelines, error: pErr } = await db
    .from('pipelines').select('id, name, is_default')
    .eq('company_id', COMPANY_ID).order('is_default', { ascending: false }).order('position')
  if (pErr) { console.error('❌ Erro lendo pipelines:', pErr.message); process.exit(1) }
  if (!pipelines || pipelines.length === 0) {
    console.error('🛑 A Stark Tech NÃO possui pipeline. Abortando (não crio pipeline automaticamente).')
    process.exit(1)
  }
  const pipeline = pipelines.find(p => p.is_default) || pipelines[0]

  const { data: stages, error: sErr } = await db
    .from('pipeline_stages').select('id, name, slug, position, is_final, is_positive')
    .eq('company_id', COMPANY_ID).eq('pipeline_id', pipeline.id).order('position')
  if (sErr) { console.error('❌ Erro lendo pipeline_stages:', sErr.message); process.exit(1) }
  if (!stages || stages.length === 0) {
    console.error('🛑 Pipeline sem estágios. Abortando.')
    process.exit(1)
  }
  console.log(`📊 Pipeline: "${pipeline.name}" (${pipeline.id}) — ${stages.length} estágios:`)
  stages.forEach(s => console.log(`     [${s.position}] ${s.name}  final=${s.is_final} positive=${s.is_positive}`))

  const finalWonStage = stages.find(s => s.is_final && s.is_positive === true) || stages[stages.length - 2]
  const finalLostStage = stages.find(s => s.is_final && s.is_positive === false) || stages[stages.length - 1]

  function statusForStage(s) {
    if (s.is_final && s.is_positive === true) return 'deal'
    if (s.is_final && s.is_positive === false) return 'lost'
    if (s.position === 0) return 'new'
    if (s.position === 1) return 'qualifying'
    return 'open'
  }

  // --- 2) Profiles dos usuários da empresa -----------------------------------
  const { data: profiles, error: prErr } = await pub
    .from('profiles').select('id, user_id, email')
    .in('email', ['tonifmelo@gmail.com', 'weveltzgroup@gmail.com'])
  if (prErr) { console.error('❌ Erro lendo profiles:', prErr.message); process.exit(1) }
  const owners = profiles || []
  console.log(`\n👤 Profiles encontrados (${owners.length}):`, owners.map(o => o.email).join(', ') || '(nenhum)')
  const ownerProfileId = (i) => owners.length ? owners[i % owners.length].id : null
  const ownerUserId = (i) => owners.length ? owners[i % owners.length].user_id : null

  // --- 3) Lead sources (cria as que faltarem) --------------------------------
  const { data: existingSources, error: lsErr } = await db
    .from('lead_sources').select('id, slug, name').eq('company_id', COMPANY_ID)
  if (lsErr) { console.error('❌ Erro lendo lead_sources:', lsErr.message); process.exit(1) }
  const sourceMap = new Map((existingSources || []).map(s => [s.slug, s.id]))
  console.log(`\n🏷️  Lead sources existentes: ${[...sourceMap.keys()].join(', ') || '(nenhuma)'}`)
  for (const src of DESIRED_SOURCES) {
    if (sourceMap.has(src.slug)) {
      console.log(`     • ${src.slug} — já existe`)
      continue
    }
    const { data, error } = await db.from('lead_sources').insert({
      company_id: COMPANY_ID, name: src.name, slug: src.slug, color: src.color,
      icon_name: src.icon_name, is_active: true, is_system: false,
    }).select('id').single()
    if (error) { console.error(`❌ Erro criando source ${src.slug}:`, error.message); process.exit(1) }
    sourceMap.set(src.slug, data.id)
    counters.lead_sources++
    created.lead_sources.push(src.slug)
    console.log(`     • ${src.slug} — CRIADA`)
  }
  const sourceSlugByIndex = DESIRED_SOURCES.map(s => s.slug)

  // --- 4) Idempotência: leads já existentes por email ------------------------
  const allEmails = NAMES.map(emailFor)
  const { data: existingLeads, error: elErr } = await db
    .from('leads').select('email').eq('company_id', COMPANY_ID).in('email', allEmails)
  if (elErr) { console.error('❌ Erro lendo leads existentes:', elErr.message); process.exit(1) }
  const existingEmailSet = new Set((existingLeads || []).map(l => l.email))
  if (existingEmailSet.size) {
    console.log(`\n♻️  ${existingEmailSet.size} lead(s) já existem — serão pulados (idempotência).`)
  }

  // Monta a distribuição de estágios (índice de estágio por lead), permutada.
  const stageIndexExpanded = []
  STAGE_DISTRIBUTION.forEach((qty, pos) => {
    const stagePos = Math.min(pos, stages.length - 1)
    for (let k = 0; k < qty; k++) stageIndexExpanded.push(stagePos)
  })
  while (stageIndexExpanded.length < NAMES.length) stageIndexExpanded.push(0)

  // --- 5) Monta e insere LEADS (novos) ---------------------------------------
  function tempFor(pos, i) {
    if (pos === 0) return i % 3 === 0 ? 'warm' : 'cold'
    if (pos === 1) return i % 2 === 0 ? 'cold' : 'warm'
    if (pos === 2) return i % 2 === 0 ? 'warm' : 'hot'
    if (pos === 3) return 'hot'
    if (pos >= stages.length - 1) return 'cold'
    return 'warm'
  }

  const leadRows = []
  const leadMeta = [] // paralelo, p/ montar filhos: { name, email, stage, status, lastAt, idx }
  NAMES.forEach((name, i) => {
    const email = emailFor(name)
    if (existingEmailSet.has(email)) return
    const stagePos = stageIndexExpanded[(i * 7) % NAMES.length] // 7 e 30 coprimos -> permutação
    const stage = stages[stagePos]
    const status = statusForStage(stage)
    const slug = sourceSlugByIndex[i % sourceSlugByIndex.length]
    const conv = CONVERSATIONS[name] || []
    const lastSender = conv.length ? conv[conv.length - 1][0] : 'H'
    const lastAt = daysAgo((i % 20) + 1, 9 + (i % 8))
    const convStatus = lastSender === 'L' ? 'unread' : 'replied'
    leadRows.push({
      company_id: COMPANY_ID,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      name,
      phone: phoneFor(i),
      email,
      source_id: sourceMap.get(slug) || null,
      status,
      temperature: tempFor(stagePos, i),
      avatar_url: avatarFor(name),
      assigned_to: ownerProfileId(i),
      conversation_status: convStatus,
      last_customer_message_at: lastSender === 'L' ? lastAt : null,
      created_at: daysAgo((i % 20) + 8, 8),
    })
    leadMeta.push({ name, email, stage, status, lastAt, idx: i })
  })

  if (!leadRows.length) {
    console.log('\n✅ Nada a inserir — todos os 30 leads já existem. Seed idempotente, encerrando.')
    printSummary()
    return
  }

  console.log(`\n📥 Inserindo ${leadRows.length} leads...`)
  await insertBatch('leads', db, leadRows, false)
  // Precisamos do mapeamento email->id para os filhos. Refetch por email.
  const { data: leadsWithIds, error: lwErr } = await db
    .from('leads').select('id, email').eq('company_id', COMPANY_ID).in('email', leadMeta.map(m => m.email))
  if (lwErr) { console.error('❌ Erro relendo leads inseridos:', lwErr.message); process.exit(1) }
  const leadIdByEmail = new Map(leadsWithIds.map(l => [l.email, l.id]))

  // --- 6) DEALS --------------------------------------------------------------
  // 10 leads com 2 deals (5 open+won, 5 open+lost), 20 com 1 deal.
  // Two-deal leads escolhidos entre os que NÃO estão em estágio final.
  const activeMeta = leadMeta.filter(m => !(m.stage.is_final))
  const twoDealMeta = activeMeta.slice(0, 10)
  const twoDealEmails = new Set(twoDealMeta.map(m => m.email))

  const dealRows = []
  leadMeta.forEach((m, k) => {
    const leadId = leadIdByEmail.get(m.email)
    const baseValue = 5000 + ((m.idx * 6500) % 195000)
    const value = Math.round(baseValue / 500) * 500

    if (twoDealEmails.has(m.email)) {
      // Deal 1: open (no estágio atual do lead)
      dealRows.push({
        company_id: COMPANY_ID, lead_id: leadId, name: DEAL_TITLES[m.name] || 'Negócio',
        value, status: 'open', stage_id: m.stage.id, pipeline_id: pipeline.id,
        assigned_to: ownerProfileId(m.idx), created_at: daysAgo((m.idx % 15) + 3, 11),
      })
      // Deal 2: won (primeiros 5 leads) ou lost (próximos 5 leads)
      const isWon = twoDealMeta.findIndex(x => x.email === m.email) < 5
      dealRows.push({
        company_id: COMPANY_ID, lead_id: leadId,
        name: SECOND_DEAL_TITLES[m.idx % SECOND_DEAL_TITLES.length],
        value: Math.round((value * 0.6) / 500) * 500,
        status: isWon ? 'won' : 'lost',
        stage_id: isWon ? finalWonStage.id : finalLostStage.id,
        pipeline_id: pipeline.id, assigned_to: ownerProfileId(m.idx),
        created_at: daysAgo((m.idx % 10) + 25, 10),
        closed_at: daysAgo((m.idx % 10) + 15, 16),
      })
    } else {
      // 1 deal, status coerente com o estágio do lead
      const st = m.status === 'deal' ? 'won' : m.status === 'lost' ? 'lost' : 'open'
      dealRows.push({
        company_id: COMPANY_ID, lead_id: leadId, name: DEAL_TITLES[m.name] || 'Negócio',
        value, status: st, stage_id: m.stage.id, pipeline_id: pipeline.id,
        assigned_to: ownerProfileId(m.idx),
        created_at: daysAgo((m.idx % 18) + 2, 12),
        closed_at: st === 'open' ? null : daysAgo((m.idx % 8) + 1, 15),
      })
    }
  })
  console.log(`📥 Inserindo ${dealRows.length} deals...`)
  await insertBatch('deals', db, dealRows, false)

  // --- 7) MESSAGES -----------------------------------------------------------
  const messageRows = []
  leadMeta.forEach((m) => {
    const leadId = leadIdByEmail.get(m.email)
    const conv = CONVERSATIONS[m.name] || [['L', 'Olá, tenho interesse na solução de vocês.']]
    const n = conv.length
    conv.forEach(([who, text], j) => {
      // Espalha no tempo: primeira msg mais antiga, última perto de lastAt.
      const offsetDays = (m.idx % 18) + (n - j)
      messageRows.push({
        company_id: COMPANY_ID, lead_id: leadId, content: text,
        sender_type: who === 'L' ? 'lead' : 'human',
        message_type: 'text', source: 'whatsapp', delivery_status: 'sent',
        is_read: who === 'L' ? (m.idx % 3 !== 0) : true,
        created_at: daysAgo(offsetDays, 9 + (j % 9)),
      })
    })
  })
  console.log(`📥 Inserindo ${messageRows.length} mensagens...`)
  await insertBatch('messages', db, messageRows, false)

  // --- 8) TASKS (1 por lead) -------------------------------------------------
  const taskRows = []
  leadMeta.forEach((m, k) => {
    const leadId = leadIdByEmail.get(m.email)
    const tpl = TASK_TEMPLATES[m.idx % TASK_TEMPLATES.length]
    const done = m.idx % 3 === 0 // ~1/3 concluídas
    taskRows.push({
      company_id: COMPANY_ID, lead_id: leadId,
      type: tpl.type, title: `${tpl.title} — ${m.name}`,
      description: `Tarefa de acompanhamento do lead ${m.name}.`,
      status: done ? 'done' : 'pending',
      due_date: done ? daysAgo((m.idx % 5) + 1, 14) : daysFromNow((m.idx % 14), 10),
      completed_at: done ? daysAgo((m.idx % 4) + 1, 15) : null,
      assigned_to: ownerProfileId(m.idx),
      created_by: ownerProfileId(m.idx),
    })
  })
  console.log(`📥 Inserindo ${taskRows.length} tarefas...`)
  await insertBatch('tasks', db, taskRows, false)

  // --- 9) ACTIVITY LOGS (timeline) -------------------------------------------
  const activityRows = []
  leadMeta.forEach((m) => {
    const leadId = leadIdByEmail.get(m.email)
    const uid = ownerUserId(m.idx)
    activityRows.push({
      company_id: COMPANY_ID, user_id: uid, action: 'lead_created',
      resource_type: 'lead', resource_id: leadId,
      metadata: { name: m.name, source: 'seed' }, created_at: daysAgo((m.idx % 20) + 8, 8),
    })
    activityRows.push({
      company_id: COMPANY_ID, user_id: uid, action: 'message_received',
      resource_type: 'lead', resource_id: leadId,
      metadata: { channel: 'whatsapp' }, created_at: daysAgo((m.idx % 18) + 6, 9),
    })
    activityRows.push({
      company_id: COMPANY_ID, user_id: uid, action: 'stage_changed',
      resource_type: 'lead', resource_id: leadId,
      metadata: { to_stage: m.stage.name }, created_at: daysAgo((m.idx % 14) + 4, 11),
    })
    activityRows.push({
      company_id: COMPANY_ID, user_id: uid, action: 'deal_created',
      resource_type: 'lead', resource_id: leadId,
      metadata: { title: DEAL_TITLES[m.name] || 'Negócio' }, created_at: daysAgo((m.idx % 15) + 3, 12),
    })
  })
  console.log(`📥 Inserindo ${activityRows.length} activity_logs...`)
  await insertBatch('activity_logs', db, activityRows, false)

  printSummary()
}

function printSummary() {
  console.log('\n=============================================')
  console.log('✅ SEED CONCLUÍDA — contadores inseridos nesta execução:')
  console.log(`   leads ........... ${counters.leads}`)
  console.log(`   deals ........... ${counters.deals}`)
  console.log(`   messages ........ ${counters.messages}`)
  console.log(`   tasks ........... ${counters.tasks}`)
  console.log(`   activity_logs ... ${counters.activity_logs}`)
  console.log(`   lead_sources .... ${counters.lead_sources} (criadas: ${created.lead_sources.join(', ') || 'nenhuma'})`)
  console.log('=============================================')
}

main().catch((e) => {
  console.error('\n❌ Erro inesperado:', e?.message || e)
  console.error('   Estado parcial:', JSON.stringify(counters))
  process.exit(1)
})
