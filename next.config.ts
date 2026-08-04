import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone", // always-on Node process, not serverless — plan.md § Arquitetura técnica
  outputFileTracingRoot: __dirname, // silences workspace-root warning while flux-track/ sits nested inside Projeto/'s repo
};

export default config;
