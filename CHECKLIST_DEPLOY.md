# Checklist de deploy — Hostinger VPS + PM2

## 1. Antes de fazer deploy

- [ ] `npm run verify` limpo local (install + build + lint + typecheck).
- [ ] `git status` limpo, último commit é o que vai pro ar.
- [ ] `.env` de produção preparado (não é o `.env` local — valores reais de produção):
  - [ ] `DATABASE_URL` aponta pro Neon (ou provedor atual) de produção.
  - [ ] `LANDING_PAGE_URL` é a LP real.
  - [ ] `GGCHECKOUT_WEBHOOK_SECRET` é o secret real gerado no painel do GGCheckout (não vazio).
  - [ ] `META_CAPI_TOKEN` é o token do System User (não um token de usuário pessoal expirável).
  - [ ] `META_AD_ACCOUNT_ID` tem o prefixo `act_`.
  - [ ] `DEV_MODE` está `false` ou ausente.

## 2. Deploy

```bash
npm run build
# next build com output:"standalone" gera .next/standalone/server.js sozinho —
# copiar public/ e .next/static pra dentro antes de rodar:
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
pm2 start .next/standalone/server.js --name flux-track
pm2 save
```

## 3. Migração (rodar contra o banco de produção, com atenção)

```bash
npm run db:migrate
```

Confirmar antes de rodar: `DATABASE_URL` no shell é realmente o de produção (`echo $DATABASE_URL`
ou conferir o `.env` sendo lido). Migração é idempotente (`drizzle-kit migrate` só aplica o que
falta), mas nunca rodar contra o banco errado.

## 4. Confirmar no ar

```bash
curl https://seudominio.com/api/health
# esperado: {"ok":true,"db":true,"meta":{...:true},"ggcheckout":{"webhookSecretConfigured":true}}

curl -X POST https://seudominio.com/api/webhooks/ggcheckout
# esperado: 401 (sem secret) — confirma que o endpoint existe e a validação está ativa
```

- [ ] `/api/health` responde `ok:true`, `db:true`.
- [ ] `/api/webhooks/ggcheckout` existe e responde 401 pra POST sem secret (nunca 200).
- [ ] `/` (dashboard) carrega sem erro.
- [ ] `/admin` carrega sem erro.

## 5. Cron (crontab -e)

```bash
0 * * * * cd /path/to/flux-track && npm run sync-spend >> /var/log/flux-track-sync.log 2>&1
*/5 * * * * cd /path/to/flux-track && npm run retry-capi >> /var/log/flux-track-retry.log 2>&1
```

- [ ] `crontab -l` confirma as duas linhas.
- [ ] Logs sendo escritos (`tail /var/log/flux-track-sync.log` depois da próxima hora cheia).

## 6. Só então — configurar o webhook no GGCheckout

- [ ] URL do webhook = `https://seudominio.com/api/webhooks/ggcheckout`.
- [ ] Secret configurado no GGCheckout = mesmo valor de `GGCHECKOUT_WEBHOOK_SECRET`.
- [ ] Clicar "Test Webhook" no painel do GGCheckout.
- [ ] Conferir em `/admin` que a linha do teste apareceu em "Últimos webhooks" com
      `validado: sim`.
- [ ] Fazer uma compra real de valor baixo, confirmar em `/admin` e na tabela `sales` que
      `matched=true` (round-trip do `utm_content` funcionou) e `capi_status='sent'`.
