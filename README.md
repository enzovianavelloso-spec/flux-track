# Flux Track

Tracker de atribuição pessoal (Meta Ads → GGCheckout → Meta CAPI → dashboard). Clone funcional
do RedTrack, single-user, sem login/multi-tenant. Stack: Next.js 15 (App Router, standalone) +
Drizzle ORM + `pg` (node-postgres) + Neon Postgres (portável — só `DATABASE_URL` é
provider-specific).

## Setup local

```bash
npm install
cp .env.example .env      # preencher DATABASE_URL (Neon), LANDING_PAGE_URL, etc
npm run db:generate
npm run db:migrate
npm run dev
```

## Verificação antes de considerar pronto

```bash
npm run verify   # install + build + lint + typecheck
```

`verify` **não** roda `db:migrate` nem healthcheck contra um host real de propósito —
migração é passo explícito de deploy (ver `CHECKLIST_DEPLOY.md`), pra nunca rodar sem querer
contra produção.

## DEV_MODE

`DEV_MODE=true` no `.env`:
- Meta CAPI não envia de verdade — simula e loga (`sales.capi_response = {devMode:true}`).
- Webhook aceita o secret fixo `"dev-secret"` mesmo sem `GGCHECKOUT_WEBHOOK_SECRET` real
  configurado (útil pra testar antes do domínio/webhook do GGCheckout estarem prontos).
- Mais logs no console.

**Nunca deixar `DEV_MODE=true` em produção** — bypassa a validação normal do secret.

## Endpoints

- `GET /r?cid=&aid=&adid=&cname=&aname=&adnm=&plat=&fbclid=` — redirect de clique. Gera
  clickid, grava em `clicks` (timeout de 2.5s, tolerante a cold-start do Neon depois de
  scale-to-zero; nunca trava o redirect), seta cookie `flux_clickid` (30 dias) no domínio do
  flux-track, 302 pra LP com `utm_content=<clickid>`. **Atenção**: se a LP mora em domínio
  diferente do flux-track (ex.: LP na Netlify, backend na Hostinger — configuração atual), esse
  cookie fica no domínio do flux-track e **não** chega na LP — ele não serve de backup pro
  `track.js`. A persistência do clickid na LP depende inteiramente do `track.js` capturando
  `utm_content` da URL, então confirmar que ele está de fato instalado na LP é obrigatório
  (ver `CHECKLIST_PRODUCAO.md`).
- `POST /api/webhooks/ggcheckout` — recebe venda. Header `x-secret` ou
  `Authorization: Bearer` = `GGCHECKOUT_WEBHOOK_SECRET` (comparação constant-time). Sem
  secret configurado = rejeita tudo (a não ser em `DEV_MODE`). Toda request — validada ou
  não — vira uma linha em `webhook_logs`. Responde 2xx logo após persistir a venda; o envio
  pro Meta CAPI roda depois, sem bloquear a resposta (processo sempre-ligado via PM2, não
  serverless — a chamada continua após o `return`).
- `GET /api/health` — checa conexão real com o banco (`select 1`), se `META_CAPI_TOKEN`/
  `META_AD_ACCOUNT_ID`/`GGCHECKOUT_WEBHOOK_SECRET` estão configurados (só booleano, nunca o
  valor), versão do app. Retorna 503 se o banco estiver fora do ar.
- `GET /` — dashboard: faturamento, gasto, ROAS, lucro, EPC, CPA, taxa de conversão, funil
  (cliques → gerados → pagos), sparkline de receita (14 dias), filtros rápidos (hoje/7d/30d)
  e filtros por data/fonte/plataforma/produto.
- `GET /admin` — painel de diagnóstico: últimos webhooks (validado/processado/erro/duração),
  eventos CAPI pendentes/com falha, últimos erros, últimos redirects, tempo médio de
  resposta. Paginado via `?offset=`.
- `public/track.js` — incluir na LP: `<script src="/track.js" data-checkout-selector="a.checkout-btn"></script>`.
  Persiste o clickid em cookie + localStorage + sessionStorage (30 dias), reinjeta os UTMs no
  link de checkout no momento do clique — sobrevive a refresh, voltar no navegador, nova aba,
  e demora entre clique e compra.

## Confiabilidade do CAPI (retry sem fila externa)

`sales.capi_status` (`not_applicable` / `pending` / `sent` / `failed`) + `sales.capi_attempts`
funcionam como fila por coluna — sem Redis/BullMQ, mesmo padrão do cron `sync-spend`. Qualquer
falha (HTTP não-ok, exceção de rede, pixel não mapeado) sempre grava um status final, nunca
deixa a venda "esquecida". `scripts/retry-capi.ts` varre `pending`/`failed` com menos de 5
tentativas e reenvia.

## Cron

```bash
# hourly, crontab -e
0 * * * * cd /path/to/flux-track && npm run sync-spend >> /var/log/flux-track-sync.log 2>&1

# a cada 5 min — reenvia conversões que o Meta CAPI não confirmou
*/5 * * * * cd /path/to/flux-track && npm run retry-capi >> /var/log/flux-track-retry.log 2>&1
```

## Deploy

Ver `CHECKLIST_DEPLOY.md` (passo a passo completo), `CHECKLIST_PRODUCAO.md` (o que confirmar
antes de rodar campanha real com dinheiro de verdade) e `CHECKLIST_BACKUP.md` (backup do Neon).

## Pendências antes de rodar campanha real

Ver `CHECKLIST_PRODUCAO.md`.
