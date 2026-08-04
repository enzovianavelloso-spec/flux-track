# Flux Track

Tracker de atribuição pessoal (Meta Ads → GGCheckout → dashboard). Ver plano completo em
`C:\Users\User\.claude\plans\flux-track-prompt-frolicking-sutherland.md`.

## Setup local

```bash
npm install
cp .env.example .env      # preencher DATABASE_URL (Neon), LANDING_PAGE_URL, etc
npm run db:generate
npm run db:migrate
npm run dev
```

## Deploy (Hostinger VPS + PM2)

```bash
npm run build
# next build com output:"standalone" gera .next/standalone/server.js sozinho —
# copiar public/ e .next/static pra dentro antes de rodar:
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
pm2 start .next/standalone/server.js --name flux-track
```

## Endpoints

- `GET /r?cid=&aid=&adid=&cname=&aname=&adnm=&plat=&fbclid=` — redirect de clique, gera clickid, grava em `clicks`, 302 pra LP com `utm_content=<clickid>`.
- `POST /api/webhooks/ggcheckout` — recebe venda, header `x-secret` ou `Authorization: Bearer` = `GGCHECKOUT_WEBHOOK_SECRET`.
- `GET /api/health` — 200 ok.
- `/` — dashboard.
- `public/track.js` — incluir na LP: `<script src="/track.js" data-checkout-selector="a.checkout-btn"></script>`.

## Cron

```bash
# hourly, crontab -e
0 * * * * cd /path/to/flux-track && npm run sync-spend >> /var/log/flux-track-sync.log 2>&1
```

## Pendências antes de rodar campanha real

Ver fases 0-8 no plano. Resumo: confirmar plano Hostinger com Node, criar App Meta
(developers.facebook.com), System User com `ads_read`, atribuir pixel por produto em
`products.meta_pixel_id`, configurar webhook no GGCheckout, validar round-trip de
`utm_content` com pagamento real de valor baixo antes de escalar.
