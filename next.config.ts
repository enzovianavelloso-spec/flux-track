import type { NextConfig } from "next";

const config: NextConfig = {
  // "standalone" removido: a hospedagem Hostinger (deploy via Git) roda `next start` padrão e
  // não copia .next/static pro output standalone (esse passo manual só existe no
  // CHECKLIST_DEPLOY.md, pra VPS+PM2) — com standalone ligado aqui o CSS sumia em produção.
  outputFileTracingRoot: __dirname, // silences workspace-root warning while flux-track/ sits nested inside Projeto/'s repo
};

export default config;
