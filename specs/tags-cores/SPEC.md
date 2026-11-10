# SPEC: cores personalizadas nas tags

## Objetivo
Ao criar uma tag, o usuário escolhe a cor dela. A cor vale para a empresa toda e aparece em todo lugar onde a tag é exibida.

## Situação atual
- A tag é só texto: `veltzy.leads.tags text[]` (baseline do Hub, linha 3523). Não existe tabela de tags.
- O input é `src/components/pipeline/lead-tags-input.tsx` e é usado em 4 telas: editar lead, novo contato, painel do contato no Inbox e público da campanha (filtro).
- O chip só é exibido fora do input em `src/components/pipeline/deal-card.tsx:282`.

## Decisão de modelo (aprovada)
Catálogo por empresa. `leads.tags` continua `text[]`, sem migrar dados. A cor fica na tabela nova `veltzy.lead_tags`, e o vínculo é pelo nome, sem diferenciar maiúscula de minúscula. Tag sem cadastro no catálogo aparece no estilo atual (cor padrão).

## B1: migration no Hub
Arquivo `hub/supabase/migrations/<timestamp>_veltzy_lead_tags_cores.sql`, sem BEGIN/COMMIT.

- `veltzy.lead_tags`: `id uuid pk`, `company_id uuid not null` FK `public.companies` on delete cascade, `name text not null`, `color text not null` com CHECK `^#[0-9a-fA-F]{6}$`, `created_by uuid` FK `public.profiles` on delete set null, `created_at`, `updated_at` com trigger `handle_updated_at`.
- Índice único `(company_id, lower(name))`.
- RLS:
  - SELECT, INSERT e UPDATE para membros da empresa (`company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin()`). O vendedor também cria tags hoje, então não pode ser só admin.
  - DELETE só para admin (`veltzy.is_company_admin()`) ou super_admin.
- GRANT para `authenticated` e `service_role`, igual ao de `lead_sources`.

## B2: front
| Arquivo | Mudança |
|---|---|
| `src/lib/tag-colors.ts` (novo) | `normalizeTagKey` (trim + lower), `isValidTagColor` e `getReadableTextColor(hex)`, que escolhe texto claro ou escuro pelo contraste. **Desvio na implementação:** a paleta não é nova. Reaproveita as 12 cores do `PALETTE` de `src/components/shared/color-picker.tsx`, as mesmas de etapas, pipelines e origens. |
| `src/types/database.ts` | `interface LeadTag`. |
| `src/services/lead-tags.service.ts` (novo) | `getLeadTags(companyId)` e `createLeadTag(companyId, { name, color })`. Se o nome já existe (erro 23505), não sobrescreve a cor: devolve a tag que já está lá. |
| `src/hooks/use-lead-tags.ts` + `use-create-lead-tag.ts` (novos) | React Query, chave `['lead-tags', companyId]`. Também devolvem um mapa nome → cor. |
| `src/components/shared/tag-badge.tsx` (novo) | Chip da tag. Com cor: fundo na cor escolhida e texto em contraste (via `style`, porque a cor é dado do usuário, mesmo padrão de `lead_sources.color`). Sem cor: estilo atual com tokens. |
| `src/components/pipeline/tag-color-picker.tsx` (novo) | Popover com a paleta + `input type=color` para cor livre. |
| `lead-tags-input.tsx` | Botão de cor ao lado do input. A cor escolhida vale para a próxima tag **nova**, e quem ainda não está no catálogo é gravado com essa cor quando é adicionado. Tag que já existe mantém a cor dela. Chips passam a usar `TagBadge`. Prop nova `allowCreate` (padrão `true`). |
| `audience-step.tsx` | `allowCreate={false}`: o filtro da campanha mostra as cores, mas não grava no catálogo. |
| `deal-card.tsx` | Chips passam a usar `TagBadge` (tamanho pequeno). |

## Fora do escopo
- Trocar a cor de uma tag que já existe (tela de gestão de tags).
- Tags criadas por importação, webhook, automação, cadência ou edge function: continuam sem cor (estilo padrão) até alguém cadastrar a tag pela UI.
- Edge functions, `get_conversation_list`, import e export.

## Critérios de aceite
1. Criar a tag "VIP" em vermelho no editar lead → o chip aparece vermelho no modal e no card do kanban, depois de salvar e recarregar a página.
2. Adicionar "vip" em outro lead → reaproveita o vermelho, sem perguntar a cor e sem criar uma segunda linha.
3. Tag antiga sem cadastro aparece no estilo padrão, sem erro no console.
4. Funciona igual em novo contato e no painel do contato do Inbox.
5. No público da campanha, a tag mostra a cor, mas digitar uma tag nova não cria linha em `lead_tags`.
6. Texto do chip legível nos 3 temas (light, dark, sand), tanto com cor clara (amarelo) quanto escura.
7. Vendedor consegue criar tag colorida; usuário de outra empresa não vê as tags dessa.

## PVO
`tsc -b`, `npm run build`, `npm run lint` (sem erro novo contra o merge-base), diff revisado e teste no browser no staging depois de aplicar a migration.

### Resultado (2026-11-10)
- Migration `20261110120000_veltzy_lead_tags_cores` aplicada no staging (`hfebvugdsztnzgpybdwj`) por `db push`; `migration list` confirma local = remoto.
- `tsc -b` ok; `npm run build` ok; testes 39 arquivos / 316 ok; lint sem achado nos arquivos da feature (110 problemas no total, todos fora deles; sem baseline medido, porque a árvore está sem commit).
- Browser (localhost ligado ao staging, admin):

| # | Resultado |
|---|---|
| 1 | ok: "PVO Vermelha" no lead "Teste", vermelha no modal e no card depois de recarregar |
| 2 | ok: "pvo vermelha" em outro lead reaproveitou o vermelho com o verde selecionado |
| 3 | ok: "alterou-etapa" (automação) no estilo padrão, sem erro no console |
| 4 | ok: botão de cor no novo contato e no painel do Inbox; "PVO Verde" verde no painel |
| 5 | ok: filtro sem botão de cor; tag nova digitada não gerou requisição para `lead_tags` (rede conferida) |
| 6 | ok em claro e escuro; sand não conferido no browser (o chip tem fundo próprio; contraste da paleta coberto por teste) |
| 7 | vendedor: ok no pipeline (testado pela Leticia). Outra empresa: **pendente** |

- Achado no teste e corrigido: o foco só voltava ao campo no fim da animação do seletor, e o que era digitado nesse intervalo se perdia. Agora volta no clique da cor.

### Correção fora do escopo, feita nesta branch (pedido da Leticia, 2026-11-10)
Bug do painel de contato do Inbox, existente desde `f0b7817` (11/06): editar um campo sem clicar em Salvar e trocar de conversa gravava a edição no contato **seguinte**. O salvamento da troca lia `leadIdRef`, que o render do contato novo já tinha atualizado, junto com os valores do contato antigo. Valia para qualquer campo do painel (tags, nome, email, empresa etc.), não só para tags.

- Correção: `src/components/inbox/contact-panel.tsx`. O id do contato é capturado no efeito de troca e passado para `flushFields(leadId)`.
- Teste de regressão: `src/components/inbox/contact-panel.switch-lead.test.tsx`, que falha sem a correção (grava em `lead-b`) e passa com ela.
- Browser: "PVO Verde" pendente no "leticia teste", troca para 551135852916 e recarga das duas conversas. A tag ficou no "leticia teste" e o 551135852916 continuou sem tags. Depois a tag de teste foi removida.
- Lint do arquivo: os mesmos 5 erros que já existiam (3 deles, "refs atualizados durante o render", apontam o padrão que causou o bug). Refatorar isso fica fora daqui.
- **Em aberto:** dados que já foram gravados no contato errado desde junho, no staging e em produção. Levantamento por consulta ainda não feito.
