# Auditoria de confiabilidade — Flux Track (2026-08-04)

Escopo: fase final antes de substituir o RedTrack. Auditoria completa do código +
validação ao vivo do fluxo real (Meta Ads → `/r` → clickid → LP → checkout → webhook →
Neon → Meta CAPI → dashboard). Nenhuma funcionalidade nova — só bugs, robustez, estabilidade.

Configuração considerada definitiva: Neon Postgres + Drizzle + Hostinger Business (Node.js),
LP em `https://acalanto-page.netlify.app`, `META_AD_ACCOUNT_ID=act_1506732607447317`,
`META_CAPI_TOKEN` configurado, Pixel `2093293154728170`, `GGCHECKOUT_WEBHOOK_SECRET` pendente.

---

## 1. Problema mais crítico — fora do código do flux-track

**A Landing Page real não está preparada pro pipeline de tracking.** Testado ao vivo em
`https://acalanto-page.netlify.app`:

- `track.js` **não está instalado** — o único script carregado é o Microsoft Clarity.
- Os botões de compra ("Começar com o Essencial", "Quero dormir com o plano VIP") são
  `<button>`, não `<a href>`. `track.js` (como funciona hoje) só reescreve `href` de links —
  não tem o que fazer nesses botões.
- Clique em "Começar com o Essencial" abre um modal de upsell. Clicando "Não, seguir só com
  o plano Essencial", **nenhuma requisição de rede dispara, nenhum redirect acontece** — fica
  preso em `#planos`. Não achei, nos cliques testados, nenhum link pro GGCheckout.

**Consequência**: o pipeline inteiro (clique → LP → checkout → webhook) não fecha hoje,
independente de o backend do flux-track estar 100% sólido. Isso é um problema na LP
(`acalanto-page`, projeto separado), não no flux-track. Precisa confirmar com quem mantém a
LP qual é o mecanismo real de checkout antes de ligar qualquer campanha. Detalhado em
`CHECKLIST_PRODUCAO.md`.

---

## 2. Bugs reais encontrados e corrigidos no flux-track

| # | Bug | Onde | Impacto | Fix |
|---|-----|------|---------|-----|
| 1 | Webhook redelivery (comum — providers de webhook são "at-least-once") disparava um **novo envio real ao Meta CAPI mesmo para venda já confirmada como enviada** | `app/api/webhooks/ggcheckout/route.ts` | Conversão duplicada potencial, gasto de quota da API | Só dispara `sendPurchaseEvent` se `capiStatus !== "sent"` — testado ao vivo: 2 entregas seguidas incrementam `capi_attempts`, mas depois de marcar `sent` manualmente, a 3ª entrega não reenvia |
| 2 | Cron de retry (`retry-capi.ts`, a cada 5min) podia colidir com o envio inline do próprio webhook (fire-and-forget, não aguardado) e disparar **2 chamadas concorrentes pro Meta pra mesma venda** | `scripts/retry-capi.ts` | Chamada duplicada à API (Meta dedupa por `event_id`, então não gera conversão duplicada no Ads Manager — mas desperdiça requisições) | Retry só pega linhas `pending` com mais de 2 minutos (dá tempo do envio inline terminar); `failed` continua imediato |
| 3 | Exceção no envio ao Meta com **pixel não mapeado nunca incrementava `capi_attempts`** | `lib/meta/capi.ts` | `retry-capi.ts` reprocessaria essa venda pra sempre, nunca batendo o limite de 5 tentativas | Attempts incrementa em todos os caminhos, inclusive "sem pixel mapeado" |
| 4 | 3 pontos de falha silenciosa: insert de clique em `/r`, escrita em `webhook_logs`, e a própria escrita de recuperação de erro no CAPI — todos com `.catch(() => {})` sem log nenhum | `app/r/route.ts`, `app/api/webhooks/ggcheckout/route.ts`, `lib/meta/capi.ts` | Perda de clickid ou de log de erro sem nenhum rastro, nem no `/admin` nem no console do processo | `console.error` em todos — visível no log do PM2 mesmo quando a linha nunca chega no banco |
| 5 | Resposta de erro do Meta CAPI sem JSON válido virava `{}` — perdia o único dado útil (`res.status`) | `lib/meta/capi.ts` | Diagnóstico do `/admin` ficava sem pista nenhuma pra falhas HTTP não-JSON | `capi_response` sempre grava `{ status, body }` |
| 6 | **Mismatch de timezone**: filtro de data do dashboard comparava `sales.received_at` (UTC) contra `f.from`/`f.to` como se fossem UTC, mas `ad_spend_snapshots.date` vem do Meta no fuso da conta (América/São_Paulo). ROAS/lucro perto de meia-noite comparava dia errado | `lib/db/queries/dashboard.ts` | Números de ROAS/lucro incorretos perto de virada de dia | Todas as comparações de data por `sales.received_at`/`clicks.created_at` agora convertem pro fuso `America/Sao_Paulo` antes de comparar — mesma base do `ad_spend_snapshots.date` |
| 7 | Pool do `pg` sem `connectionTimeoutMillis` — sob esgotamento do pool, requests ficavam pendurados indefinidamente em vez de falhar rápido | `lib/db/client.ts` | Requests travados em vez de erro claro | `max: 10`, `idleTimeoutMillis: 30s`, `connectionTimeoutMillis: 5s` explícitos |
| 8 | Timeout de 800ms no insert de clique em `/r` era curto demais pra sobreviver a cold-start do Neon depois de scale-to-zero (típico: 1-2s pra acordar) | `app/r/route.ts` | Perda silenciosa de clique justamente no primeiro clique depois de uma pausa de campanha | Timeout subiu pra 2.5s (a query em si não é cancelada ao perder a corrida — ela termina em background de qualquer jeito; o timeout só afeta quanto tempo o visitante espera) |
| 9 | Checklist de deploy não mencionava copiar `.env` pro build standalone (`.next/standalone/`) | `CHECKLIST_DEPLOY.md` | Deploy quebraria em produção com "Missing env var: DATABASE_URL" mesmo com tudo certo localmente — Next standalone não inclui `.env` automaticamente, de propósito | Passo explícito adicionado, com checklist de conferência |

Todos os fixes rodaram contra o Neon real: `npm run typecheck` / `npm run lint` / `npm run build`
limpos, teste end-to-end do bug #1 confirmado ao vivo (ver seção 2 da tabela).

**Addendum (mesmo dia, pego ao vivo abrindo o preview)**: o próprio fix #7 (`connectionTimeoutMillis`)
tinha valor curto demais (5s) — primeira carga do dashboard depois de idle bateu exatamente no
cold-start do Neon descrito no bug #8 e caiu com 500 ("Connection terminated due to connection
timeout"). Reload seguinte funcionou (compute já acordado). Corrigido pra 10s (commit `e6626a6`),
reconfirmado funcionando: dashboard, `/admin` e `/api/health` todos 200 depois do ajuste.

---

## 3. Checklist do audit original — resultado item a item

| Item pedido | Resultado |
|---|---|
| Perda de clickid | `/r` grava o clique em background mesmo perdendo a corrida do timeout (query não é cancelada) — risco real só em falha genuína de conexão, agora logada (bug #4). Persistência client-side (cookie+localStorage+sessionStorage, 30 dias) é sólida **quando `track.js` roda** — que não é o caso na LP real hoje (seção 1). |
| Duplicidade de conversões | Bug #1 corrigido e testado. Concorrência genuína (2 webhooks simultâneos pro mesmo pagamento) ainda não tem lock — risco residual, ver seção 4. |
| Duplicidade de webhooks (processamento) | `sales.id` é PK com `onConflictDoUpdate` — nunca cria linha duplicada, mesmo id repetido só atualiza. Confirmado. |
| Race conditions | Bug #1 e #2 eram exatamente isso — corrigidos. Concorrência verdadeiramente simultânea (não sequencial) seguue como risco residual de baixo impacto (Meta dedupa por `event_id`). |
| Vazamento de memória | Nenhum encontrado. Pool único reaproveitado (correto pra processo sempre-ligado); scripts de cron (`sync-spend`, `retry-capi`) chamam `process.exit()` a cada execução — sem acúmulo entre runs. Bug #7 endurece o pool contra esgotamento sob carga. |
| Queries lentas | Nenhuma lenta identificada — volume de dados é zero hoje (pré-lançamento). Dashboard faz ~7 round-trips por load; aceitável pra uso single-user, sem motivo pra otimizar sem dado real de produção. |
| Índices ausentes | Conferidos contra o schema real — todos os índices relevantes (`clickid`, `payment_id`/PK, `created_at`, `campaign/adset/ad`, `capi_status`) já existem desde a sessão anterior. |
| Erros silenciosos | Bug #4 — 3 pontos corrigidos. |
| Timezone | Bug #6 — corrigido. |
| Deploy | Bug #9 — corrigido. Plano Hostinger "Business" precisa confirmação (seção 4). |
| Incompatibilidade Neon/Drizzle | Nenhuma real encontrada. `pg` (não `@neondatabase/serverless`) evita lock-in, já decisão de sessão anterior. Prepared statements do `node-postgres` são unnamed por padrão — não colidem com o pooler transaction-mode do Neon (diferente do problema conhecido do Prisma, que usa prepared statements nomeados). |
| Problemas específicos da Hostinger | Depende do tipo de plano — seção 4. |
| Códigos HTTP | Conferidos endpoint por endpoint — todos corretos (`/r` sempre 302, webhook 401/400/500/200, health 200/503, GET não suportado em rota POST retorna 405 automático do Next). |

---

## 4. Riscos restantes (não corrigidos — decisão consciente ou fora do escopo do flux-track)

- **LP sem `track.js` e sem checkout ligado** (seção 1) — bloqueador, fora do repo flux-track.
- **Hostinger "Business" pode ser hospedagem compartilhada, não VPS** — todo o `CHECKLIST_DEPLOY.md`
  assume SSH root + PM2 + `crontab -e`. Se for compartilhado, start/restart/env/cron são feitos
  pela UI do hPanel, os comandos do checklist não se aplicam como estão. Confirmar o plano antes
  de seguir o checklist ao pé da letra (aviso adicionado no topo do arquivo).
- **Concorrência verdadeiramente simultânea de webhooks** (2 requests processando o mesmo
  `payment.id` ao mesmo tempo, não sequencialmente) ainda pode gerar 2 chamadas CAPI concorrentes.
  Não implementei lock (ex.: advisory lock do Postgres) porque o dedup do Meta por `event_id`
  já cobre esse caso na prática (mesmo evento duplicado no lado do Meta não vira conversão
  duplicada no Ads Manager) — só desperdiça uma chamada HTTP. Adicionar lock seria complexidade
  nova pra um cenário raro e já coberto pelo dedup nativo do Meta.
- **`GGCHECKOUT_WEBHOOK_SECRET` ainda placeholder** — domínio não é público, secret real pendente
  do usuário.
- **Nenhum produto cadastrado ainda** — `products.meta_pixel_id` só é preenchido quando o
  primeiro webhook real chegar com o `product.id` do GGCheckout. Até lá, toda venda paga fica
  `capi_status='failed'` por falta de pixel mapeado (comportamento correto, não é bug).
- **Volume de dados real é zero** — queries "rápidas hoje" não têm garantia sob volume real;
  reavaliar depois de rodar campanha de verdade.

---

## 5. Checklist para publicação

Ver `CHECKLIST_DEPLOY.md` completo. Resumo:

1. Confirmar tipo real do plano Hostinger (VPS vs compartilhado) — muda o passo a passo.
2. `.env` de produção com valores reais, `DEV_MODE=false`.
3. `npm run build` → copiar `public/`, `.next/static` **e `.env`** pro `.next/standalone/`.
4. `npm run db:migrate` contra o Neon de produção (confirmar `DATABASE_URL` antes).
5. `curl /api/health` → `db:true`. `curl -X POST /api/webhooks/ggcheckout` → 401 (nunca 200
   sem secret).
6. Cron de `sync-spend` (hourly) e `retry-capi` (5 em 5 min) configurados.
7. Só então configurar o webhook real no painel do GGCheckout.

## 6. Checklist para o primeiro teste com dinheiro real

1. **Resolver o bloqueador da seção 1** — `track.js` instalado na LP e checkout de fato
   redirecionando pro GGCheckout com os UTMs anexados. Sem isso, `clickid` nunca chega no
   webhook e toda venda fica `matched=false`.
2. Cadastrar o Pixel (`2093293154728170`) em `products.meta_pixel_id` assim que o `product.id`
   real do GGCheckout for conhecido (aparece no primeiro webhook, ou pode ser inserido manual
   se o ID já for conhecido de antemão).
3. Clique de teste em `/r?...` → confirmar cookie e redirect corretos → percorrer a LP até o
   checkout → confirmar que a URL do checkout carrega `utm_content=<clickid>`.
4. Compra real de valor baixo → conferir em `/admin`: webhook chegou, `validado=sim`,
   `processado=sim`, sem erro.
5. Conferir na tabela `sales`: `matched=true`, `clickid` preenchido, `capi_status='sent'`.
6. Conferir no Events Manager do Meta que o evento `Purchase` chegou (usar
   `META_TEST_EVENT_CODE` pra esse teste, remover depois).
7. Rodar `npm run retry-capi` manualmente uma vez pra confirmar que não reenvia a venda que já
   está `sent` (regressão do bug #1).
