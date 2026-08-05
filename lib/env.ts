// Central env accessor — never log these values, never send to client.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get landingPageUrl() { return required("LANDING_PAGE_URL"); },
  get ggcheckoutWebhookSecret() { return process.env.GGCHECKOUT_WEBHOOK_SECRET ?? ""; },
  get metaCapiToken() { return required("META_CAPI_TOKEN"); },
  get metaAdAccountId() { return required("META_AD_ACCOUNT_ID"); },
  get metaTestEventCode() { return process.env.META_TEST_EVENT_CODE ?? undefined; },
  get devMode() { return process.env.DEV_MODE === "true"; },
};
