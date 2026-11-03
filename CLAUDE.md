# CLAUDE.md - Veltzy CRM

## O QUE É O VELTZY
CRM multi-tenant SaaS white-label com IA SDR, pipeline drag & drop, inbox multicanal (WhatsApp, Instagram, LinkedIn) e distribuição hierárquica de leads. Produto da Daxen Labs.

## STACK
- **Frontend:** React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3 + shadcn/ui + Radix UI
- **State:** TanStack React Query v5 (server state) + Zustand (client state)
- **Backend:** Supabase (Auth, PostgreSQL, Realtime, Storage, Edge Functions)
- **Drag & Drop:** dnd-kit
- **Charts:** Recharts
- **Forms:** react-hook-form + zod
- **Deploy:** Vercel (frontend) + Supabase (backend)
- **Idioma:** pt-BR | Fuso: America/Sao_Paulo

## ESTRUTURA DO PROJETO
```
veltzy/
├── CLAUDE.md                    # Este arquivo
├── docs/
│   ├── PRD.md                   # Product Requirements Document
│   ├── SPECS.md                 # Especificações técnicas
│   ├── DESIGN_SYSTEM.md         # Tokens, cores, componentes visuais
│   └── phases/                  # Specs por fase de implementação
│       ├── phase-01-foundation.md
│       ├── phase-02-pipeline.md
│       └── ...
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui customizados
│   │   ├── layout/              # MainLayout, Sidebar, Header
│   │   ├── auth/                # Login, Register, ProtectedRoute
│   │   ├── onboarding/          # Fluxo de criação de empresa
│   │   ├── pipeline/            # Kanban, LeadCard, StageColumn
│   │   ├── inbox/               # Chat, ConversationList, MessageBubble
│   │   ├── dashboard/           # Charts, Metrics, Filters
│   │   ├── admin/               # Painel admin do tenant
│   │   ├── super-admin/         # Painel Daxen Labs
│   │   ├── settings/            # Configurações do usuário/empresa
│   │   └── shared/              # Componentes reutilizáveis
│   ├── hooks/                   # Custom hooks organizados por domínio
│   ├── stores/                  # Zustand stores
│   ├── lib/                     # Utilities, helpers, constants
│   ├── types/                   # TypeScript interfaces e enums
│   ├── services/                # Camada de acesso ao Supabase
│   ├── pages/                   # Route components (leves, delegam para components)
│   └── styles/                  # CSS global, tokens, animações
├── supabase/
│   ├── config.toml              # [db.migrations] desligado: migration mora no Hub
│   └── functions/               # Edge Functions (Deno)
└── public/
```

## CONVENÇÕES DE CÓDIGO

### TypeScript
- Strict mode habilitado
- Interfaces para objetos de domínio, types para unions/primitivos
- Nenhum `any` permitido. Usar `unknown` quando necessário
- Paths com alias `@/` para src/

### Componentes React
- Functional components com arrow functions
- Props tipadas com interface dedicada (ex: `interface LeadCardProps`)
- Componentes de página são FINOS: apenas composição, sem lógica
- Lógica em hooks customizados, acesso a dados em services
- Máximo ~200 linhas por componente. Decompor se passar

### Hooks
- Prefixo `use` + domínio (ex: `useLeads`, `usePipelineStages`)
- Um hook por arquivo
- React Query para server state, Zustand para client state

### Services (camada de dados)
- Arquivo por domínio (ex: `leads.service.ts`, `messages.service.ts`)
- Funções puras que recebem supabase client e retornam dados
- Sem lógica de UI, sem hooks, sem estado

### Estilos
- Tailwind + design tokens via CSS variables (HSL)
- Nunca cores diretas (`bg-blue-500`). Sempre tokens semânticos (`bg-primary`)
- Variantes com `cva` (class-variance-authority)
- 3 temas: light, dark, sand

### Supabase
- RLS em TODAS as tabelas multi-tenant
- Padrão de policy: `company_id = get_current_company_id() OR is_super_admin()`
- Functions `SECURITY DEFINER` com `SET search_path = public`
- Edge Functions com CORS headers padrão

### Naming
- Arquivos: kebab-case (ex: `lead-card.tsx`, `use-leads.ts`)
- Componentes: PascalCase (ex: `LeadCard`)
- Hooks: camelCase com prefixo use (ex: `useLeads`)
- Services: camelCase (ex: `getLeadsByCompany`)
- SQL: snake_case (ex: `pipeline_stages`)
- Branches: `feat/`, `fix/`, `refactor/` + descrição curta

## MULTI-TENANT (REGRA DE OURO)
- TODA query filtra por `company_id`
- TODA tabela de domínio tem `company_id NOT NULL` com FK para `companies`
- RLS é a última linha de defesa, NÃO a única
- Services também filtram por company_id no código
- Edge Functions validam company_id antes de processar

## ROLES E PERMISSÕES
```
super_admin  → Acesso total, bypass RLS, impersonação
admin        → Gerencia empresa, equipe, integrações, config
manager      → Supervisiona pipeline, equipe, métricas
seller       → Atende leads atribuídos, chat, disponibilidade
```
Roles armazenadas em `user_roles` (tabela separada, NUNCA em profiles).

## WHATSAPP - EVOLUTION API (multi-instancia)

O Veltzy suporta dois providers WhatsApp: Z-API (legado) e Evolution API (via Hub).
O campo `companies.active_whatsapp_provider` ('zapi' | 'evolution') controla qual provider cada empresa usa.

**Arquitetura:**
- Hub (mesmo projeto Supabase) e dono da infra Evolution. Veltzy nunca chama Evolution API diretamente.
- Envio: `whatsapp-send` roteia por provider. Para Evolution, chama `evolution-send-message` do Hub.
- Recebimento: Hub chama `evolution-inbound` do Veltzy com payload normalizado.
- Logica de criacao/atualizacao de lead: `_shared/lead-inbound-handler.ts` (compartilhado entre zapi-webhook e evolution-inbound).
- Resolucao de instancia: `_shared/resolve-instance.ts` (prioridade: lead > pipeline SDR > profile vendedor).

**Multi-instancia por empresa:**
- Cada empresa tem N numeros WhatsApp (N instancias Evolution).
- `profiles.default_whatsapp_instance`: numero padrao do vendedor.
- `leads.whatsapp_instance_name`: instancia que originou a conversa.
- `pipelines.sdr_instance_name`: instancia dedicada para AI SDR.
- `messages.instance_name`: auditoria de qual instancia enviou/recebeu.
- `messages.delivery_status`: 'sent' | 'failed' | 'pending'.

**Transfer SDR -> vendedor:**
- SDR retorna `transfer: true` no JSON. sdr-ai envia mensagem de transfer pelo numero do SDR, gera resumo IA, troca instancia do lead, notifica vendedor.
- `leads.transfer_summary`: resumo IA salvo para exibicao no kanban.
- `pipelines.sdr_transfer_message_template`: template configuravel com {vendedor_nome}.

**Docs:** `docs/features/evolution-integration/PRD.md`, `Spec.md`, `MIGRATION-RUNBOOK.md`

## WORKFLOW DE DESENVOLVIMENTO (SDD)
1. Leia o spec da fase atual em `docs/phases/`
2. Implemente seguindo o spec fielmente
3. Teste manualmente
4. Commite com mensagem descritiva
5. `/clear` entre fases para limpar contexto

## COMANDOS ÚTEIS
```bash
# Dev
npm run dev              # Start dev server
npm run build            # Build de produção
npm run lint             # Lint

# Deploy
alias vzpush='git add . && git commit -m "$(date +%H:%M)" && git push'

# Supabase
# Migration do Central: arquivo novo em hub/supabase/migrations/, nunca aqui.
# Este repo nao aplica migration (legado em docs/legado/migrations-veltzy/).
npx supabase functions serve  # Edge Functions local
```

## O QUE NÃO FAZER
- NÃO usar Lovable AI Gateway (removido). IA SDR usa OpenAI/Gemini diretamente
- NÃO usar Clerk (removido). Auth é 100% Supabase Auth
- NÃO criar god components. Decompor sempre
- NÃO usar `lovable-tagger` ou qualquer dependência do Lovable
- NÃO usar cores hardcoded. Sempre design tokens
- NÃO commitar .env com credenciais reais
- NÃO criar `supabase/migrations/` neste repo nem rodar `db push` daqui. Migration do Central é arquivo no Hub
- NÃO usar em dash (—) em textos/copy
