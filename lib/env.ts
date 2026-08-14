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
  get cronSecret() { return required("CRON_SECRET"); },
  get devMode() { return process.env.DEV_MODE === "true"; },
  // VAPID: private key never leaves the server (used only to sign push payloads via
  // web-push). Public key is meant to reach the client — passed as a prop from a server
  // component to the subscribe button, not baked in via NEXT_PUBLIC_ so it stays out of
  // the JS bundle for pages that don't render the notification UI.
  get vapidPublicKey() { return required("VAPID_PUBLIC_KEY"); },
  get vapidPrivateKey() { return required("VAPID_PRIVATE_KEY"); },
};
