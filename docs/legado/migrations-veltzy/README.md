# Migrations legadas do Veltzy (aposentadas)

Estes 84 arquivos (`001_foundation.sql` a `084_cadences_recurring_last_run.sql`) ficavam
em `supabase/migrations/` e saíram de lá em 03/11/2026.

**Nenhuma versão destes arquivos está no histórico do banco.** Conferido em 03/11/2026 com
`supabase migration list` no staging (`hfebvugdsztnzgpybdwj`) e na produção
(`zxefzegggntfjlfsdgvw`): 178 versões em cada um, todas com arquivo no repo do Hub, e
nenhuma com a numeração `001` a `084` daqui.

## Onde está a fonte de verdade

- Migration do banco Central, inclusive de tabela do schema `veltzy`, é arquivo novo em
  `hub/supabase/migrations/`, com timestamp. Nunca aqui.
- O schema real está na baseline e nas migrations do Hub. Policy, índice, constraint e
  função se conferem lá, não nestes arquivos: alguns citam objetos que não existem no
  banco, e vários foram substituídos depois por migrations do Hub.

## Por que os arquivos ficaram

Specs e auditorias antigas citam estes arquivos pelo caminho e pela linha
(`supabase/migrations/047_...sql:8`). Eles continuam aqui só para essa leitura histórica,
com o mesmo nome. Onde um doc antigo diz `supabase/migrations/NNN_...`, leia
`docs/legado/migrations-veltzy/NNN_...`.

Não copie SQL daqui para uma migration nova sem conferir o objeto atual no Hub.

## Proteções

- `supabase/config.toml` deste repo tem `[db.migrations] enabled = false`: um
  `supabase db push` rodado daqui não aplica nada.
- A pasta `supabase/migrations/` deste repo não existe mais. Não recrie.
