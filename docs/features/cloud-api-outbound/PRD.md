# PRD: Envio (outbound) WhatsApp Cloud API

> Feature: envio de mensagens via WhatsApp Cloud API oficial da Meta, roteado pelo Hub (Caminho A).
> Produto: Veltzy (CRM/SDR)
> Banco: Supabase Central `zxefzegggntfjlfsdgvw` (us-east-1, produção)
> Repositórios afetados: `veltzgroup/veltzy-app` e `tonimeloveltz/hub`
> Pré-requisito atendido: inbound Cloud API validado ponta a ponta em 26/06.
> Status: PRD para revisão antes de `/spec`.

---

## 1. Contexto e objetivo

O inbound Cloud API já está vivo e validado: mensagem do cliente entra pela Edge Function `cloud-api-inbound`, vira lead/deal/mensagem na empresa correta. Falta o outro lado da conversa. Hoje o Veltzy não consegue **enviar** pela Cloud API, então o SDR não responde e o operador não manda mensagem por esse canal.

Objetivo: habilitar o envio de mensagem de texto (e mídia) via Cloud API, mantendo a regra cardinal do ecossistema (produto não toca credencial; quem fala com a infra é o Hub), e suportando múltiplos números oficiais por empresa.

Caso de uso primário: o SDR responde um lead dentro da janela de atendimento de 24h, com mensagem livre. Reengajamento fora da janela (template aprovado) é ciclo futuro.

---

## 2. Escopo

### Entra neste ciclo

- Ramo `cloud_api` no caminho de envio do Veltzy (`whatsapp-send`).
- Nova Edge Function no Hub: `cloud-api-send-message`, que detém o token e chama a Graph API.
- Captura do `wamid` retornado pela Meta e gravação em `messages.external_id` (correlação para a Fase 3 de status).
- **Múltiplos números oficiais por empresa**, com resolução por vínculo lead↔número (inbound carimba, outbound lê) e fallback para o número default da empresa.
- Mensagem livre dentro da janela de 24h (texto e mídia).
- Teste de regressão Evolution antes de fechar.

### Não entra neste ciclo (próximos desenhos)

- **Mistura de providers na mesma empresa** (um número oficial e um Evolution convivendo). Hoje o provider é da empresa (`companies.active_whatsapp_provider`, valor único). Suportar isso exige mover o provider do nível da empresa para o nível do número, mexendo no roteamento de inbound e outbound dos dois providers. É o ciclo seguinte. Nada neste PRD contradiz essa direção.
- **Templates** (envio fora da janela de 24h).
- **Tela de integração estilo Clint** (cliente escolhe oficial ou não, cadastra N números, define default). É a próxima pedra grande depois do envio. É lá que a escolha de provider e o cadastro de números ganham UI.
- **`process-message-queue`** (fila de automações e lembretes). O SDR chama `whatsapp-send` direto, então só esse caminho importa para o caso primário. A fila ganha o ramo `cloud_api` quando as automações precisarem do canal oficial, em um passo posterior, idealmente via centralização do envio.
- Reconciliação de `veltzy.cloud_api_numbers` com a tabela de instâncias do Hub (`evolution_instances` virando registro genérico com coluna `provider`, conforme o doc do Hub seção 3.5). Item registrado, ciclo do lado do Hub.

---

## 3. Decisões arquiteturais (travadas)

### 3.1 Caminho A: envio passa pelo Hub

O `whatsapp-send` do Veltzy ganha um ramo `cloud_api` que chama `cloud-api-send-message` no Hub, espelhando o que já faz com `evolution-send-message`. A chamada usa o padrão machine-to-machine já validado em produção em 11/06: service role key nos headers `apikey` e `Authorization: Bearer`.

Motivo: honra a regra cardinal do ecossistema (produto nunca tem a credencial), reusa um padrão já provado em vez de inventar, e deixa o ponto natural para metering futuro do envio no Hub.

### 3.2 Token: vive no Hub, nunca no Veltzy

O Veltzy passa apenas `phone_number_id` (identificador público, não segredo) mais `company_id`. O Hub resolve a credencial do lado dele:

- Atual: lê `META_SYSTEM_USER_TOKEN` do Supabase Secret (igual `evolution-send-message` lê `EVOLUTION_GLOBAL_API_KEY`). Cobre o número de teste e qualquer número sob o app do Veltz Group.
- Futuro (clientes reais via Embedded Signup): token por número na tabela `oauth_integrations` (Hub-owned, token criptografado), resolvido por `phone_number_id` no `metadata`. Direção registrada, não escopo agora.

O que cruza a fronteira Veltzy → Hub é sempre o `phone_number_id`, jamais o token. A coluna `access_token` em `cloud_api_numbers` fica sem uso no escopo atual; seu destino se resolve junto com a reconciliação da tabela com o Hub.

### 3.3 `external_id`: reusa o campo, sem coluna nova

O `wamid` da mensagem enviada vai em `messages.external_id`. Não há colisão real com o uso de inbound (dedup): `wamid` é único global, então o id de uma mensagem recebida e o de uma enviada nunca coincidem, e os dois lookups (dedup do inbound, status da Fase 3) jamais acham a linha um do outro. O significado de `external_id` generaliza para "id do provider para esta mensagem", coerente nos dois sentidos.

Ação: adicionar comentário no schema documentando o duplo uso. O PVO confirma que nenhuma query trata `external_id` como exclusivo de inbound.

### 3.4 Multi-número: resolução por vínculo lead↔número

O lead guarda qual número Cloud API ele conversa. O inbound carimba esse vínculo quando a mensagem chega (lead falou no número X, fica colado no X). O outbound lê o vínculo e responde por esse número. Quando o lead não tem vínculo (mensagem iniciada pela empresa), usa o número default da empresa.

É o mesmo princípio que o Evolution já aplica para multi-instância (lead, depois pipeline, depois default), aplicado ao Cloud API. Garante que cada lead é respondido pelo número onde ele falou, com isolamento correto entre números da mesma empresa.

---

## 4. Modelo de dados (migration mínima)

A migration 068 já preparou o schema de mensagem. Esta migration adiciona apenas o necessário para multi-número. É aditiva, não altera dado existente.

1. **Vínculo no lead.** Coluna em `veltzy.leads` apontando para o número Cloud API:
   - `cloud_api_number_id UUID NULL REFERENCES veltzy.cloud_api_numbers(id)`
   - Nullable: leads de Evolution/Z-API não têm; leads Cloud API ganham via carimbo do inbound.

2. **Default por empresa.** Coluna em `veltzy.cloud_api_numbers`:
   - `is_default BOOLEAN NOT NULL DEFAULT false`
   - Índice único parcial garantindo um default por empresa:
     `CREATE UNIQUE INDEX cloud_api_numbers_one_default_per_company ON veltzy.cloud_api_numbers (company_id) WHERE is_default;`

3. **Comentário de schema** em `veltzy.messages.external_id` documentando o duplo uso (id do provider, inbound e outbound).

Nota: nomes exatos de tabela e coluna do lead a confirmar contra o código na fase de Spec. Até a tela de integração existir, `is_default` é setado manualmente via SQL (mesmo modelo operacional usado hoje para o número de teste).

---

## 5. Áreas de mudança

### Veltzy (`veltzgroup/veltzy-app`)

- `_shared/whatsapp-provider.ts`: mudar o retorno de `sendMessage` de `Promise<void>` para um retorno que carrega o id externo (ex.: `Promise<{ externalId?: string }>`). É uma ampliação de retorno, segura: Evolution e Z-API continuam sem devolver nada de útil e ninguém depende disso. Esta é a única costura compartilhada pelos três providers e o ponto de maior atenção do PVO.
- `_shared/whatsapp-config.ts` (`getActiveProvider`): reconhecer `cloud_api` no tipo de retorno e remover o fallback que hoje força qualquer valor desconhecido para `zapi`.
- `_shared/whatsapp-factory.ts`: registrar `cloud_api` no mapa de providers.
- `_shared/providers/cloud-api.ts` (novo): provider Cloud API. O `sendMessage` recebe o `phone_number_id` já resolvido via payload (espelhando como o Evolution recebe `instanceName`), chama `cloud-api-send-message` no Hub pelo padrão m2m, lê `{ wamid }` da resposta e retorna `{ externalId: wamid }`.
- `whatsapp-send/index.ts`: adicionar o ramo `cloud_api` no roteamento por provider; resolver o `phone_number_id` (vínculo do lead, fallback default) antes de chamar o provider; capturar o `wamid` retornado e incluir `external_id` no insert de `messages`; gravar `instance_label` do número em `messages.instance_name` para manter a auditoria multi-instância.

### Hub (`tonimeloveltz/hub`)

- `cloud-api-send-message` (novo): recebe `{ phone_number_id, company_id, to, message }`, resolve o token (atual: `META_SYSTEM_USER_TOKEN`; futuro: `oauth_integrations` por `phone_number_id`), faz `POST graph.facebook.com/v25.0/{phone_number_id}/messages`, no 200 extrai `messages[0].id` e devolve `{ wamid }`, no erro devolve a estrutura de erro mapeada. Aceita auth service role m2m, igual `evolution-send-message`. Deploy a partir do repo do Hub (mesmo projeto Supabase).

### Inbound (adição pequena ao fluxo já validado)

- Carimbar o vínculo: quando uma mensagem Cloud API cria ou atualiza um lead, gravar `leads.cloud_api_number_id` com o número de entrada. Implementar como campo opcional em `InboundParams` (padrão dos campos `source`, `pipelineId`, etc.), preenchido só pelo `cloud-api-inbound`. Evolution e Z-API passam vazio e ficam intocados.

---

## 6. Contrato: `cloud-api-send-message` (Hub)

### Request (Veltzy → Hub)

Headers: `Content-Type: application/json`, `apikey: <service_role>`, `Authorization: Bearer <service_role>`.

Body:
```json
{
  "phone_number_id": "1101736456367508",
  "company_id": "44f69ec0-cf37-44cc-be4c-130930f45f45",
  "to": "5511917162109",
  "message": { "text": "conteudo" }
}
```
Para mídia: `"message": { "media": { "type": "...", "url": "...", "caption": "..." } }`.

### Request (Hub → Graph API, texto)

`POST https://graph.facebook.com/v25.0/{phone_number_id}/messages`
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5511917162109",
  "type": "text",
  "text": { "body": "conteudo" }
}
```

### Response sucesso (Hub → Veltzy)

A Graph API responde 200 com `messages[0].id = wamid`. O 200 significa **aceito pela API, não entregue**. O Hub devolve:
```json
{ "wamid": "wamid.HBgL..." }
```
O Veltzy grava `delivery_status = 'sent'`. Os estados `delivered` e `read` só chegam na Fase 3 via webhook de status.

### Response erro (Hub → Veltzy)

A Graph API retorna `error.{ code, type, message, error_data.details, fbtrace_id }`. O Hub propaga isso. O Veltzy grava `delivery_status = 'failed'` e monta `delivery_error` como string combinando `code`, `message`, `details` e `fbtrace_id` (ex.: `[130429] (#130429) Rate limit hit | Cloud API throughput reached | fbtrace=Az8or...`). O `code` permite tratamento programático futuro; o `fbtrace_id` é essencial para suporte junto à Meta.

---

## 7. Resolução de número (outbound)

1. Se `lead.cloud_api_number_id` estiver setado, usa esse número.
2. Senão, usa o número default da empresa (`cloud_api_numbers` com `company_id = X AND status = 'active' AND is_default = true`).
3. Se não houver default e nenhum vínculo, é erro de configuração: registra falha clara, não envia.

A resolução acontece no `whatsapp-send` (espelhando `resolveInstanceName` do Evolution) e passa o `phone_number_id` resultante para o provider.

---

## 8. Fluxo ponta a ponta (caso primário, SDR responde)

```
Lead manda mensagem
  → cloud-api-inbound cria/atualiza lead, carimba leads.cloud_api_number_id
  → SDR decide responder, chama whatsapp-send (service role, senderType 'ai')
  → whatsapp-send resolve provider = cloud_api
  → whatsapp-send resolve phone_number_id (vínculo do lead)
  → provider Cloud API chama Hub cloud-api-send-message {phone_number_id, company_id, to, message}
  → Hub lê token, POST Graph API, recebe messages[0].id
  → Hub devolve { wamid }
  → whatsapp-send grava messages: content, delivery_status='sent', external_id=wamid, instance_name=label
  → mensagem chega no WhatsApp do lead
```

---

## 9. Plano de validação

### Teste de regressão Evolution (obrigatório, por causa da mudança em `sendMessage`)

Antes de declarar pronto: enviar uma mensagem por um cliente Evolution em contexto de teste e confirmar que sai idêntico ao comportamento atual. Valida que a ampliação de retorno de `sendMessage` não quebrou os providers existentes. Os 10 clientes ativos não devem ser tocados.

### Teste Cloud API (encenado em dois passos)

1. **Envio manual primeiro.** Com a janela da conversa "Toni Melo" na Stark Tech aberta (reabrir com `hello_world` se passou de 24h), mandar uma mensagem pelo inbox do Veltzy (sender humano). Confirma: chega no celular, e a linha em `messages` tem `external_id = wamid` e `delivery_status = 'sent'`. Isola o mecanismo de envio do SDR.
2. **SDR responde depois.** Com o envio manual provado, validar o loop completo do SDR respondendo um lead.

### Multi-número (quando houver segundo número)

Carimbar dois leads em números diferentes e confirmar que cada um é respondido pelo número correto. No escopo atual (Stark Tech com um número), o vínculo aponta sempre para o mesmo, e o caminho fica exercitado.

---

## 10. Riscos e mitigação

- **Mudança em `sendMessage` (costura compartilhada).** Risco baixo: ampliar retorno é seguro. Mitigação: teste de regressão Evolution + atenção no PVO.
- **Impacto nos clientes atuais.** Próximo de zero. Ramo `cloud_api` só roda para empresa com esse provider (hoje só Stark Tech). Código aditivo, banco sem dado alterado, `process-message-queue` fora do ciclo.
- **Janela de 24h.** Fora da janela, mensagem livre falha. No caso primário (SDR responde lead recente) a janela está aberta. Reengajamento por template é ciclo futuro.
- **Dependência cross-repo.** O envio precisa do `cloud-api-send-message` no Hub deployado antes do teste. Sequenciar: Hub primeiro, depois ligar o ramo no Veltzy.

---

## 11. Critérios de aceite

- Uma empresa com `active_whatsapp_provider = 'cloud_api'` envia mensagem de texto pela Cloud API, e a mensagem chega no WhatsApp do destinatário.
- A linha gravada em `messages` tem `external_id` igual ao `wamid` retornado pela Meta e `delivery_status = 'sent'`.
- Falha de envio grava `delivery_status = 'failed'` e `delivery_error` com `code` e `fbtrace_id`.
- Um lead carimbado com vínculo é respondido pelo número do vínculo; sem vínculo, pelo default da empresa.
- O token da Meta nunca aparece em código ou variável do Veltzy.
- Um cliente Evolution envia mensagem idêntica ao comportamento anterior (regressão verde).
- PVO limpo: tudo commitado e pushado nos dois repos, `develop` e `main` no fluxo correto, working tree restaurada.

---

## 12. Ordem de implementação sugerida

1. Migration mínima (vínculo no lead, `is_default`, comentário de schema).
2. Hub: `cloud-api-send-message` + deploy.
3. Veltzy: mudança de retorno em `sendMessage`, `getActiveProvider`, factory.
4. Veltzy: provider Cloud API + ramo no `whatsapp-send` + resolução de número.
5. Inbound: carimbo do vínculo.
6. Validação: regressão Evolution, depois envio manual Cloud API, depois SDR.
