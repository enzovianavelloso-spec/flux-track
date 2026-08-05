# Checklist de produção — antes de rodar campanha real com dinheiro de verdade

## 🔴 BLOQUEADOR — Landing Page (fora do repo flux-track)

Auditoria em 2026-08-04 confirmou ao vivo em `https://acalanto-page.netlify.app`:

- [ ] **`track.js` não está instalado na LP.** Only script carregado hoje é o Microsoft
      Clarity — nenhuma tag `<script src=".../track.js">`. Sem isso, `utm_content` (clickid)
      chega na LP pela URL mas nunca é persistido nem propagado pro checkout.
- [ ] **Os botões de compra ("Começar com o Essencial", "Quero dormir com o plano VIP") são
      `<button>`, não `<a href>`.** `track.js` (no design atual) só reescreve `href` de links —
      não tem o que reescrever aqui. Testado ao vivo: clicar em "Começar com o Essencial" abre
      um modal de upsell ("SIM, ADICIONAR PACOTE" / "Não, seguir só com o plano Essencial");
      clicando "Não, seguir só..." **nenhuma requisição de rede é disparada, nenhum redirect
      acontece** — fica preso em `#planos`. Não encontrei, nos dois cliques testados, nenhum
      link/redirect pro GGCheckout.
- [ ] Confirmar com quem mantém a LP (projeto separado, provavelmente `acalanto-page/`) qual é
      o mecanismo real de checkout: é um `window.location` via JS depois do modal? Abre em nova
      aba? Ainda não foi implementado? — sem essa resposta, o pipeline inteiro
      (clique → LP → checkout → webhook) não tem como funcionar, independente de quão robusto
      o flux-track em si esteja.
- [ ] Depois de saber o mecanismo real, ajustar `track.js`/a LP de acordo (ex.: se for JS
      chamando uma função de checkout, essa função precisa ler o clickid salvo e anexar como
      `utm_content` na URL que ela monta — troca de abordagem, não é um ajuste no flux-track).

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
