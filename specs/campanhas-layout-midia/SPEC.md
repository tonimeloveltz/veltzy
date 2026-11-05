# SPEC: Campanhas, novo layout + anexo + editar/excluir

Trilha: G
Início: 2026-11-05 10:28
Merge: (preencher no merge)

PRD: `specs/campanhas-layout-midia/PRD.md`

## Blocos e ordem
- **B1 (Hub):** migration + tipos. Libera B3.
- **B2 (Veltzy):** página inteira, público, resumo, menu da lista (UI de editar/excluir usando services do B3 como stub até B3). Independe do B1.
- **B3 (Veltzy):** anexo (upload, dispatch, fila), edge `blast-campaign-manage`, expurgo no `process-blast-followups`, deploy das edges no staging. Depende do B1.

## B1 (Hub): migration
Arquivo em `hub/supabase/migrations/`. Aplicar no staging via MCP `apply_migration` e renomear o arquivo para a versão gravada.

```sql
ALTER TABLE veltzy.blast_campaigns
  ADD COLUMN media_url text,
  ADD COLUMN media_type text,
  ADD COLUMN media_name text,
  ADD COLUMN media_path text,
  ADD COLUMN media_purged_at timestamptz;

ALTER TABLE veltzy.blast_campaigns
  ADD CONSTRAINT blast_campaigns_media_type_chk
  CHECK (media_type IS NULL OR media_type IN ('image','audio','video','document'));

-- Expurgo varre por status/data; índice parcial só nas que têm arquivo vivo.
CREATE INDEX blast_campaigns_media_alive_idx
  ON veltzy.blast_campaigns (status, completed_at)
  WHERE media_path IS NOT NULL AND media_purged_at IS NULL;
```
RLS: as policies existentes (`blast_campaigns_select`, `blast_campaigns_write`) cobrem. Regenerar tipos do Hub. PR do Hub para develop.

## Arquivos (Veltzy)
<!-- arquivos -->
src/App.tsx
src/pages/campanhas.tsx
src/pages/campanha-form.tsx
src/components/campanhas/campaign-wizard.tsx
src/components/campanhas/wizard-stepper.tsx
src/components/campanhas/audience-step.tsx
src/components/campanhas/audience-mode-cards.tsx
src/components/campanhas/stage-group-select.tsx
src/components/campanhas/message-step.tsx
src/components/campanhas/settings-step.tsx
src/components/campanhas/review-step.tsx
src/components/campanhas/template-message-fields.tsx
src/components/campanhas/campaign-summary-panel.tsx
src/components/campanhas/campaign-composer.tsx
src/components/campanhas/campaign-attach-menu.tsx
src/components/campanhas/campaign-phone-preview.tsx
src/components/inbox/audio-recorder.tsx
src/components/inbox/audio-bubble.tsx
src/components/inbox/message-bubble.tsx
src/lib/campaign-preview.ts
src/lib/campaign-preview.test.ts
src/styles/globals.css
src/components/campanhas/campaign-row-actions.tsx
src/hooks/use-campaigns.ts
src/services/campaigns.service.ts
src/lib/campaign-media.ts
src/lib/campaign-draft.ts
src/types/database.ts
src/pages/campanha-detalhe.tsx
supabase/functions/blast-dispatch/index.ts
supabase/functions/blast-campaign-manage/index.ts
supabase/functions/process-blast-followups/index.ts
supabase/functions/_shared/campaign-media-purge.ts
supabase/functions/_shared/campaign-media-purge.test.ts
supabase/config.toml
<!-- /arquivos -->

## O que fazer (Veltzy)

### B2: layout
1. **Rotas** (`App.tsx`): `/campanhas/nova` e `/campanhas/:id/editar` → `campanha-form.tsx`, mesmo `ProtectedRoute` de `/campanhas`. Declarar antes de `/campanhas/:id`.
2. **`campanha-form.tsx`**: página fina. Header com voltar para `/campanhas` + título ("Nova campanha" / "Editar campanha"). Grid `lg:grid-cols-[1fr_360px]`: esquerda `CampaignWizard`, direita `CampaignSummaryPanel` sticky (`lg:sticky lg:top-6`). Abaixo de `lg`, o resumo vira bloco compacto acima dos botões.
3. **`campaign-wizard.tsx`**: deixa de ser Dialog. Vira o orquestrador de estado (mesmos estados de hoje) e recebe `campaignId?` para edição (carrega a campanha e preenche o estado; se status não for draft/scheduled, redireciona com toast "Esta campanha já começou a enviar e não pode ser editada."). Ao concluir, navega para `/campanhas`. Quebrar em `audience-step`, `message-step`, `settings-step`, `review-step` (máx ~200 linhas por arquivo). `wizard-stepper.tsx` sai do wizard sem mudança de comportamento. Rodapé com Voltar/Continuar no fim do formulário.
4. **`audience-mode-cards.tsx`**: 5 cartões (grid 2 colunas no desktop, 1 no mobile), ícone lucide + título + 1 linha: Todos ativos (`Users`, "Todos os contatos ativos com telefone"), Por etapa (`Columns3`, "Contatos em etapas específicas do funil"), Por origem (`Globe`), Por tag (`Tag`), Seleção manual (`ListChecks`). Selecionado: `border-primary bg-primary/5` + ícone `text-primary`.
5. **`stage-group-select.tsx`** (substitui o `StageMultiSelect` só no wizard; cadências seguem com o atual): um bloco recolhível por funil (Radix Collapsible ou `details` estilizado), cabeçalho com nome do funil, badge "N selecionadas" e ação "Marcar todas / Limpar". Dentro, checkboxes (`components/ui/checkbox`) em grid de 2 colunas. Funil com etapa selecionada abre por padrão; com 1 funil só, abre sempre. Mesma fonte de dados e mesmo `value: string[]` do `StageMultiSelect`.
6. **Excluir recentes**: `Switch` + texto "Não enviar para quem recebeu mensagem nos últimos [N] dias".
7. **`campaign-summary-panel.tsx`**: Card com: nome; público ("**508** contatos vão receber", carregando = skeleton; nota "Sem quem pediu para não receber e sem telefone" em `text-muted-foreground`); prévia da mensagem em bolha (`bg-muted rounded-lg`, quebra de linha preservada, variáveis com `font-medium`), com miniatura do anexo (imagem: thumb; vídeo/áudio/arquivo: ícone + nome); "N versões" quando houver; número de envio; quando (Agora / data); estimativa. Substitui as caixas avulsas de público e estimativa dos passos.
8. **Passo Revisão**: lista em `dl` com separadores; aviso de canal não oficial com tokens do tema (sem `amber-*`). Texto: "Número não oficial. As pausas de proteção contra bloqueio são aplicadas no envio."
9. **Tokens**: trocar `text-red-600`, `text-amber-*`, `bg-amber-*` do wizard e de `anti-ban-settings`/`sender-number-select` por tokens existentes (`text-destructive`, e o token de aviso que o design system tiver; se não houver, `text-muted-foreground` com ícone). Sem em dash nos textos.
10. **Lista (`campanhas.tsx`)**: botão "Nova campanha" navega para `/campanhas/nova`. Nova coluna à direita com `campaign-row-actions.tsx`: DropdownMenu "⋯" (`MoreHorizontal`), `stopPropagation` no clique. Itens: "Editar" (só draft/scheduled; navega para editar) e "Excluir" (AlertDialog: "Excluir a campanha X? Envios que ainda não saíram serão cancelados. Mensagens já enviadas continuam nas conversas."). Coluna "Template" mostra "Texto livre" quando não houver template, com ícone de clipe se tiver anexo.

### B3: anexo, editar/excluir no servidor, expurgo
11. **`lib/campaign-media.ts`**: `MEDIA_MAX_BYTES = 16 * 1024 * 1024`; `mediaTypeFromMime(mime)` → image|video|audio|document; `buildMediaPath(companyId, file)` → `<company_id>/campaigns/<uuid>/<nome-sanitizado>` (nome sanitizado = original sem acento, espaços→`-`, só `[a-zA-Z0-9._-]`, preserva extensão; o nome no path é o que o WhatsApp mostra no documento).
12. **`campaign-media-input.tsx`**: no `message-step`, só no modo "Escrever agora" e só em provider não oficial. Botão "Anexar" (`Paperclip`) com `accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"`. Upload imediato para `chat-attachments` (mesmo padrão de `inbox/chat-input.tsx`), mostra progresso, prévia e "Remover" (remove do storage). Acima de 16 MB: erro inline "Arquivo maior que 16 MB." Áudio com texto: aviso "O texto vai em uma mensagem e o áudio logo depois." Com anexo, mensagem de texto passa a ser opcional (`messageOk` aceita corpo vazio se houver anexo; versões com IA continuam exigindo texto).
13. **Service/hooks**: `createCampaign` e novo `updateCampaign` gravam `media_url/media_type/media_name/media_path`. Novos `useUpdateCampaign`, `useResetCampaign` e `useDeleteCampaign` (estes dois chamam a edge `blast-campaign-manage`). Edição: salvar = `reset` (se scheduled) → `updateCampaign` → `dispatch` (se havia data futura ou o usuário confirmou envio). Rascunho editado e salvo sem disparar continua draft. Trocar/remover anexo na edição apaga o arquivo antigo do storage.
14. **`blast-dispatch`**: com `campaign.media_path` e `media_purged_at IS NULL`:
    - `image|video|document`: item único com `message_type = media_type`, `file_url = media_url`, `content` = texto renderizado (vira legenda; pode ser vazio).
    - `audio`: se houver texto, dois itens por lead: texto em `scheduled_at` e áudio em `scheduled_at + 3s`. O `message_queue_id` do recipient aponta para o item de áudio. Sem texto, só o áudio.
    - Cloud API com mídia: 422 `reason: 'media_not_supported_official'`. Template + mídia: 422 `reason: 'media_requires_free_text'`.
    - `media_purged_at` preenchido: 422 `reason: 'media_expired'` (UI mostra "O anexo expirou. Anexe de novo.").
    - Texto vazio sem mídia continua 400 como hoje.
15. **`blast-campaign-manage`** (edge nova, `verify_jwt = false` no `config.toml`, auth manual igual ao `blast-dispatch`, valida `company_id` e papel admin/manager/super_admin). Body `{ campaign_id, action: 'reset' | 'delete' }`.
    - Comum: `message_queue` dos recipients da campanha com `status='pending'` → `cancelled` (pelos `message_queue_id` dos recipients + itens de texto de áudio: buscar por `source='campaign'` e `id in` recipients; para o par texto do áudio, gravar `metadata.campaign_id` no dispatch e cancelar por ele).
    - `reset`: só draft/scheduled (409 caso contrário); apaga `blast_recipients`; campanha volta a `draft`, zera contadores e `started_at`.
    - `delete`: qualquer status; remove `media_path` do storage (se vivo); `DELETE` da campanha (recipients caem por cascade).
    - Para facilitar, `blast-dispatch` passa a gravar `metadata.campaign_id` em todo item da fila (aditivo).
16. **Expurgo** (`_shared/campaign-media-purge.ts` chamado como passo (4) do `process-blast-followups`, sem cron novo): até 50 campanhas por execução com `media_path NOT NULL AND media_purged_at IS NULL` e (`status IN ('completed','failed','cancelled') AND coalesce(completed_at, updated_at) < now() - 30 dias`) ou (`status = 'draft' AND created_at < now() - 30 dias`). Para cada: `storage.from('chat-attachments').remove([media_path])`, depois `media_purged_at = now()`. Erro no remove: loga e segue (não marca). Mantém `media_url` (o inbox já mostra "indisponível" quando o arquivo some).
17. **`campanha-detalhe.tsx`**: mostra o anexo (miniatura ou ícone + nome) ou "Anexo expirado" se `media_purged_at`.
18. **`types/database.ts`**: `BlastCampaign` + `media_url/media_type/media_name/media_path/media_purged_at`.
19. **Deploy no staging**: `blast-dispatch`, `blast-campaign-manage`, `process-blast-followups`.

## Contratos não óbvios
```ts
type CampaignMediaType = 'image' | 'audio' | 'video' | 'document'
interface CampaignMediaFields {
  media_url: string | null
  media_type: CampaignMediaType | null
  media_name: string | null   // nome original, para exibir
  media_path: string | null   // <company_id>/campaigns/<uuid>/<nome-sanitizado>
  media_purged_at: string | null
}
// POST /functions/v1/blast-campaign-manage
// { campaign_id: string, action: 'reset' | 'delete' } → { ok: true, cancelled: number }
```

## Critérios de aceite
1. "Nova campanha" abre `/campanhas/nova` em página inteira; resumo lateral atualiza ao vivo (público, prévia, anexo, número, quando, estimativa).
2. Público em cartões; "Por etapa" mostra funis recolhíveis com contador e marcar todas; dá para escolher etapas de funis diferentes; contagem bate com a de hoje.
3. Anexo de imagem, vídeo, áudio e PDF sobe, aparece na prévia e chega no WhatsApp (staging, número waha) com o texto como legenda; áudio com texto chega em 2 mensagens, texto primeiro.
4. Arquivo acima de 16 MB é recusado com mensagem clara.
5. Cloud API: botão Anexar não aparece.
6. Lista: "⋯" com Editar só em Rascunho/Agendada; editar agendada e salvar não duplica envios (fila antiga cancelada, nova criada).
7. Excluir campanha agendada cancela os pendentes (nenhuma mensagem sai depois) e some da lista; excluir enviada some da lista e as mensagens ficam no inbox.
8. Expurgo: campanha concluída há mais de 30 dias com anexo tem o arquivo removido e `media_purged_at` preenchido; detalhe mostra "Anexo expirado".
9. Sem cor fixa nova (`*-red-*`, `*-amber-*`) nos arquivos de campanha; sem em dash na copy.
10. `npm run build` verde; `deno check` sem erro novo nas edges tocadas.

## Decisões tomadas
- Página inteira com resumo lateral no lugar do popup (Toni aprovou).
- Excluir em qualquer status, cancelando pendentes antes; mensagens enviadas ficam nas conversas (Toni aprovou).
- Schema: 5 colunas em `blast_campaigns` (Toni aprovou). `media_path` e `media_purged_at` além dos 3 combinados, para o expurgo saber o que apagar e a UI saber que expirou.
- Editar só em Rascunho/Agendada: depois que começou a enviar, editar geraria envio parcial com conteúdo misto.
- Limite de 16 MB para todos os tipos: limite de vídeo/áudio do WhatsApp; um teto só é mais simples de explicar.
- Áudio + texto vira 2 mensagens (texto antes, 3s depois o áudio): WhatsApp não aceita legenda em áudio.
- Anexo só no texto livre e só em número não oficial: Cloud API exige template aprovado; mídia em template HSM fica fora.
- Mesmo anexo para todas as versões da mensagem: versões variam texto, não material.
- Expurgo dentro do `process-blast-followups` (já roda a cada 5 min) em vez de cron/função nova: menos peça nova, sem migration de cron com URL por ambiente.
- Expurgo também em rascunho parado há 30 dias: evita arquivo órfão eterno; ao editar, a UI pede para anexar de novo.
- Arquivo no bucket `chat-attachments` em `<company_id>/campaigns/...`: reaproveita bucket e RLS por pasta existentes.
- Nome do arquivo sanitizado no path: o WhatsApp mostra esse nome no documento, sem precisar de campo novo na fila.
- `metadata.campaign_id` em todo item da fila da campanha: permite cancelar inclusive o item de texto do par áudio.
- `StageMultiSelect` das cadências não muda: fora do escopo pedido.
- Estado do formulário num objeto único (`lib/campaign-draft.ts`: rascunho vazio, rascunho a partir da campanha, filtro de público e payload) para manter wizard e passos abaixo de ~200 linhas.
- Campos de template saem do `message-step` para `template-message-fields.tsx` (limite de tamanho).
- O wizard monta o grid (formulário + resumo) porque é dono do estado; a página só tem header e o wizard. Resumo renderizado duas vezes: lateral sticky no `lg` e compacto (sem prévia) acima dos botões abaixo do `lg`.
- Edição de rascunho ganha o botão "Salvar sem enviar" (grava como draft, sem data); agendada salva sempre reagenda/dispara.
- `BlastCampaign` passa a tipar `followup_cadence_id/followup_mode/followup_delay_days` (já existiam no banco) para a edição carregar o follow-up.
- Aviso de canal não oficial com `bg-muted/40` + `text-muted-foreground` + ícone `Info`: o design system não tem token de aviso.
- Lista: contador de falhas passa de `text-red-600` para `text-destructive`; badges de status ficam como estão (fora do escopo).
- Anexo enviado e descartado na mesma edição (Trocar/Remover) sai do storage na hora; o arquivo já salvo só sai depois que a edição grava. Upload abandonado sem salvar fica órfão (não está no banco; aceito).
- Upload sem barra de porcentagem (o client do Storage não expõe progresso): botão com spinner "Enviando arquivo…".
- `blast-dispatch`: anexo com `media_type` inválido ou sem `media_url` responde 422 `media_invalid` (defesa). `queued_count` passa a contar destinatários, não itens da fila (par texto+áudio gera 2 itens).
- Expurgo: pré-filtro no banco por `created_at < now() - 30 dias` (condição necessária nos dois casos), lote de até 200 candidatos, regra fina em `isPurgeDue` (testada em `campaign-media-purge.test.ts`). Falha no expurgo não derruba os passos (1) a (3) do cron.
- Erros 422 do `blast-dispatch` viram mensagem de negócio no toast (`media_expired` → "O anexo expirou. Anexe de novo.").
- `anti-ban-settings.tsx` e `sender-number-select.tsx` saem do bloco de arquivos: não tinham cor fixa (item 9), nada a mudar.
- B4 (compositor e prévia WhatsApp): `campaign-media-input.tsx` vira `campaign-composer.tsx` (barra com clipe, texto, microfone, chip do anexo, chips de variáveis) + `campaign-attach-menu.tsx` (popover com 3 origens; um input de arquivo só, `accept` trocado por opção).
- B4: `AudioRecorder` do inbox ganha `onSend(file)` opcional (e `leadId` opcional); sem `onSend` o fluxo do inbox fica igual. A gravação vira `audio-<ts>.webm` e sobe pelo mesmo `uploadCampaignMedia` (path de campanha, `media_type` audio).
- B4: gravar ou anexar com anexo já escolhido troca o anexo (o anterior é descartado pela regra de sempre).
- B4: `AudioBubble` ganha `hideTranscription` (a prévia não mostra "Transcrição indisponível"); `MediaImage`/`MediaVideo` exportados do `message-bubble` e `MediaVideo` aceita `maxWidth`.
- B4: prévia resolve variáveis com o mesmo mapa do `blast-render.ts` (variável desconhecida some, como no envio); template usa `variable_mapping` com o mesmo contato de exemplo. Lógica pura em `campaign-preview.ts`, testada.
- B4: tamanho do documento na prévia só quando o arquivo foi escolhido nesta sessão (`CampaignMedia.size`, não gravado); na edição mostra só o tipo.
- B4: moldura do celular `border-foreground/80` e padrão de pontos via `radial-gradient` com `hsl(var(--border))` (token, sem imagem). O resumo mostra a prévia também no bloco compacto do mobile; o nome da campanha segue só no desktop.
- B5: resumo sem o celular no passo 1 (Destinatários), em desktop e no bloco compacto; prop `showPreview` (`step > 1`) no `CampaignSummaryPanel`. Sem o celular, a lista de público/quando perde a borda superior.
- B5: borda quadrada dentro da barra do compositor vinha do glow global de foco (`textarea:focus-visible` com `box-shadow !important` em `globals.css`). Classe opt-out `focus-glow-none` no `globals.css`; foco fica só no contêiner (`focus-within:ring-1`). Textarea de 1 a 8 linhas (44 a 184 px) com rolagem acima; clipe e microfone em caixas de 44 px presas à base.
