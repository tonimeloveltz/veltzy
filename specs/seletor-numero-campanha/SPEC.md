# SPEC: Seletor de número na campanha

Trilha: P
Início: 2026-10-05
Merge: (preencher no merge)

## Contexto

O `blast-dispatch` enfileira cada destinatário com `instance_name = lead.whatsapp_instance_name`.
Em WAHA/Evolution, lead sem esse campo (importado, cadastrado à mão) falha no
`process-message-queue` com "No session for WAHA" / "No instance_name for Evolution". Ele entra na
contagem do público, mas não recebe. Não existe na campanha um jeito de dizer por qual número enviar.

## O que entra / o que não entra

**Entra:**
1. Passo 3 (Configurações) do wizard ganha **"Número de envio"**: select com os números
   **conectados** do provider ativo da empresa (WAHA ou Evolution). Default = primeiro conectado.
2. Regra (decisão da Leticia, 05/10): **o lead mantém o número dele**. Quem tem
   `whatsapp_instance_name` sai pelo número da conversa; quem não tem sai pelo escolhido.
3. Checkbox **"Enviar todos por este número"** (default desligado) força todos pelo escolhido.
4. Revisão mostra o número de envio.
5. `whatsapp-numbers-list` passa a aceitar **manager** (campanha é liberada para manager; a lista é só leitura).

**Não entra:**
- Cloud API (seletor some; o ramo cloud_api já cai no número padrão da empresa).
- Migration. Nada de coluna nova.
- Alterar `leads.whatsapp_instance_name` no disparo (a resposta do lead já grava, `lead-inbound-handler.ts:125`).
- Seletor nas Automações.

## Decisões tomadas
- **Armazenamento:** dentro do jsonb `blast_campaigns.anti_ban` (criado na 083), chaves
  `sender_instance` (string) e `sender_force` (boolean). Zero migration. O `blast-dispatch` separa
  essas chaves antes de passar o resto ao `computeBlastSchedule`.
- `anti_ban` só com as chaves de envio (usuário não mexeu no anti-ban) = throttle com os defaults.
- O teto diário (por número) passa a agrupar pelo número **efetivo** de envio, não pelo do lead.
- Número escolhido que não pertence à empresa: ignorado (dispatch valida contra `waha_instances` /
  `evolution_instances` da company, conectado ou não, e loga). Regra de ouro multi-tenant.

## Arquivos
<!-- arquivos -->
specs/seletor-numero-campanha/SPEC.md
supabase/functions/_shared/blast-sender.ts
supabase/functions/_shared/blast-sender.test.ts
supabase/functions/blast-dispatch/index.ts
supabase/functions/whatsapp-numbers-list/index.ts
src/types/database.ts
src/components/campanhas/sender-number-select.tsx
src/components/campanhas/campaign-wizard.tsx
<!-- /arquivos -->

## Contratos não óbvios

```ts
// anti_ban (jsonb) estendido:
interface AntiBan extends ThrottleConfig {
  sender_instance?: string | null // session_name (waha) | instance_name (evolution)
  sender_force?: boolean          // true = todos pelo sender; false/ausente = só quem não tem número
}

// _shared/blast-sender.ts (puro, testado)
splitAntiBan(antiBan) -> { throttle: ThrottleConfig | null, sender: string | null, force: boolean }
resolveSenderInstance(leadInstance, sender, force) -> string | null
//   force && sender      -> sender
//   leadInstance         -> leadInstance
//   senão                -> sender (pode ser null = comportamento antigo)
```

## Critérios de aceite
- [ ] Em empresa WAHA/Evolution, passo 3 mostra "Número de envio" só com números conectados do provider ativo.
- [ ] Lead **sem** número, campanha com número X: o item da `message_queue` sai com `instance_name = X` e a mensagem chega.
- [ ] Lead **com** número Y, checkbox desligado: sai por Y. Checkbox ligado: sai por X.
- [ ] Usuário manager abre o passo 3 e vê a lista (sem 403).
- [ ] Empresa Cloud API: seletor não aparece; disparo idêntico ao de hoje.
- [ ] `npx --yes deno test` do `blast-sender.test.ts` verde; `tsc -b`, `npm run build`, `npm run lint` sem erro novo.
