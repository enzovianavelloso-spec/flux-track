# Checklist de deploy — Hostinger VPS + PM2

> **Confirmar antes de tudo**: esse checklist assume acesso SSH root, PM2 e `crontab -e` livre
> — ou seja, um plano **VPS**. "Hostinger Business" é o nome de um plano de hospedagem
> **compartilhada** (o Node.js ali roda via LiteSpeed/Passenger, gerenciado pelo hPanel — sem
> SSH root, sem PM2, sem `crontab -e` tradicional, variáveis de ambiente configuradas pela UI
> do hPanel em vez de arquivo `.env`). Se o plano real for Business (compartilhado) e não VPS,
> os passos 2 e 5 abaixo não se aplicam como estão escritos — o app ainda roda (é só Node.js),
> mas start/restart/env/cron são feitos pela interface do hPanel, não por esses comandos de
> shell. Confirmar o tipo de plano no painel da Hostinger antes de seguir.

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
# copiar public/, .next/static E o .env pra dentro antes de rodar. O build standalone
# NÃO inclui .env automaticamente (de propósito, pra não vazar secret pro bundle) —
# esquecer esse cp faz o processo em produção morrer com "Missing env var: DATABASE_URL"
# no primeiro request, mesmo com tudo certo localmente.
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp .env .next/standalone/.env
cd .next/standalone && pm2 start server.js --name flux-track --cwd "$(pwd)"
pm2 save
```

- [ ] Confirmar que `.next/standalone/.env` existe e tem os valores de PRODUÇÃO (não é o
      mesmo arquivo que fica na raiz durante o `npm run build` — é uma cópia física, então um
      `.env` desatualizado ali fica servindo valores velhos até o próximo deploy).

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
