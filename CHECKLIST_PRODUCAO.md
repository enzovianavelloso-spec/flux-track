# Checklist de produção — antes de rodar campanha real com dinheiro de verdade

## Meta

- [ ] App criado em developers.facebook.com.
- [ ] System User criado com permissão `ads_read` (e gestão de pixel, se aplicável).
- [ ] `META_CAPI_TOKEN` é o token desse System User (não expira como token de usuário comum).
- [ ] `META_AD_ACCOUNT_ID` confere com a conta de anúncio real (`act_...`).
- [ ] Pixel ID mapeado em `products.meta_pixel_id` pra cada produto que vai vender
      (sem isso o CAPI marca a venda como `capi_status='failed'` — sem pixel, sem envio).
- [ ] `META_TEST_EVENT_CODE` removido do `.env` de produção (só serve pra teste no Events
      Manager; deixar configurado filtra os eventos reais pro modo de teste).

## Webhook GGCheckout

- [ ] `GGCHECKOUT_WEBHOOK_SECRET` configurado tanto no `.env` quanto no painel do GGCheckout,
      com o mesmo valor.
- [ ] `DEV_MODE=false` (ou variável ausente) em produção.
- [ ] Round-trip de `utm_content` validado com uma compra real de valor baixo: clique em
      `/r` → LP → checkout → webhook → `sales.matched=true`, `sales.clickid` preenchido.

## Segurança

- [ ] `.env` de produção não está em nenhum repositório git (confirmar `.gitignore`).
- [ ] `GGCHECKOUT_WEBHOOK_SECRET` não é uma string óbvia/curta.
- [ ] `/api/health` não expõe valores de secret/token, só booleanos — confirmado no
      `CHECKLIST_DEPLOY.md` passo 4.

## Dados

- [ ] Rodar `SELECT count(*) FROM sales WHERE id LIKE 'test-%'` — zero linhas de teste
      esquecidas em produção antes de ligar campanha real.
- [ ] `/admin` sem erros acumulados de teste/desenvolvimento (`recentErrors` limpo ou só
      erros esperados/entendidos).

## Depois de ligar a campanha

- [ ] Acompanhar `/admin` nas primeiras horas — eventos pendentes/com falha devem cair a
      zero com o cron de retry rodando a cada 5 min.
- [ ] Comparar ROAS do dashboard com o Ads Manager do Meta pra validar que o `spend` sincronizado
      (via `sync-spend`, hourly) está batendo.
