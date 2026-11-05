# PRD: Campanhas, novo layout + anexo + editar/excluir

Trilha: G
Início: 2026-11-05 10:28
Merge: (preencher no merge)

## Problema e objetivo
O wizard de campanha (popup) está apertado para o volume de informação e a seleção de público ficou poluída (todas as etapas de todos os funis como chips). Faltam anexo de mídia na mensagem e editar/excluir na lista.

Objetivo: (1) criação em página inteira com resumo lateral, dentro do design system; (2) anexo de áudio, imagem, vídeo ou arquivo na mensagem livre, com expurgo do arquivo 30 dias após a campanha terminar; (3) editar (antes de enviar) e excluir campanhas na lista. Fora isso, nada novo.

## Estado atual
- Wizard: `src/components/campanhas/campaign-wizard.tsx` (Dialog, 4 passos).
- Fila e providers já enviam mídia (`message_queue.file_url` + `message_type`; waha/evolution mandam `caption`).
- Bucket `chat-attachments` (público, 50 MB, RLS por pasta `<company_id>/...`).
- `blast_campaigns` sem campos de mídia. `blast_recipients` com FK ON DELETE CASCADE.

## Requisitos funcionais
1. Rota `/campanhas/nova` e `/campanhas/:id/editar` em página inteira. Stepper no topo, formulário à esquerda, resumo fixo à direita (público, prévia da mensagem com anexo, número de envio, estimativa, quando).
2. Público em cartões com ícone e descrição. Etapas agrupadas por funil em seções recolhíveis, com contador e "marcar todas".
3. Anexo opcional no modo "Escrever agora": imagem, vídeo, áudio ou arquivo, até 16 MB. Mesmo anexo para todas as versões.
4. Áudio com texto: texto vai primeiro, áudio em seguida (WhatsApp não aceita legenda em áudio).
5. Lista: menu por linha com Editar (só Rascunho/Agendada) e Excluir (qualquer status, com confirmação; cancela envios pendentes antes).
6. Expurgo: arquivo apagado do storage 30 dias após a campanha terminar (ou 30 dias após criada, se nunca foi enviada).

## Repos envolvidos e contrato
- Hub: migration adicionando campos de mídia em `veltzy.blast_campaigns`; regenera tipos.
- Veltzy: UI, upload, `blast-dispatch` com mídia, edge nova `blast-campaign-manage`, expurgo dentro do `process-blast-followups`.
- Ordem: Hub B1 antes do Veltzy B3. Veltzy B2 (layout) independe.

## Modelo de dados
`veltzy.blast_campaigns` + `media_url text`, `media_type text` (image|audio|video|document), `media_name text`, `media_path text`, `media_purged_at timestamptz`. RLS existente cobre.

## LGPD
Sem dado pessoal novo. O anexo é material de marketing da empresa. Retenção do arquivo: 30 dias após o fim da campanha.

## O que não entra
Mídia no canal oficial (Cloud API segue só template). Mídia no modo template. Pausar/cancelar campanha em andamento como ação separada. Mudanças na tela de detalhe além de mostrar o anexo.

## Critérios de aceite
Ver SPEC.

## Decisões tomadas
- Página inteira no lugar do popup (Toni aprovou).
- Excluir permitido em qualquer status, inclusive enviada; mensagens ficam nas conversas (Toni aprovou).
- Mudança de schema no Central aprovada pelo Toni.
