import { db } from "@/lib/db/client";
import { adAccounts, campaigns, adSpendSnapshots } from "@/lib/db/schema";
import { fetchYesterdayAndTodayInsights, fetchCampaignsMeta, fetchAdsetBudgets } from "@/lib/meta/marketing-api";
import { env } from "@/lib/env";

// Centavos (Meta) -> reais (numeric column). Ausente, vazio E zero viram null: a Meta manda
// "0" no campo de orçamento que a estrutura não usa (lifetime_budget numa campanha diária, e
// vice-versa), então tratar 0 como valor real gravaria "R$ 0,00/total" — e, pior, faria o
// `??` do fallback ABO achar que já tem orçamento e nunca somar os adsets.
function centavosParaReais(v: string | number | undefined): string | null {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) && n !== 0 ? String(n / 100) : null;
}

export async function syncSpend() {
  const [rows, campaignMetaRows, adsetBudgets] = await Promise.all([
    fetchYesterdayAndTodayInsights(),
    fetchCampaignsMeta(),
    fetchAdsetBudgets(),
  ]);

  if (rows.length) {
    await db.insert(adAccounts)
      .values({ id: env.metaAdAccountId, currency: rows[0].account_currency, updatedAt: new Date() })
      .onConflictDoUpdate({ target: adAccounts.id, set: { currency: rows[0].account_currency, updatedAt: new Date() } });
  }

  // Fonte é a UNIÃO de campaignMetaRows (todas as campanhas da conta — cobre pausadas sem
  // gasto recente, que /insights nunca retornaria) com os campaign_id vistos em `rows`
  // (spend de hoje/ontem). A união é obrigatória, não só a preferência: ad_spend_snapshots
  // abaixo tem FK pra campaigns.id — se /campaigns não devolver um id que /insights devolveu
  // (ex: campanha arquivada/deletada mas com gasto histórico no período), faltaria a linha
  // pai e o insert de spend quebraria a constraint, derrubando o cron inteiro.
  const insightNameById = new Map(rows.map((r) => [r.campaign_id, r.campaign_name]));
  const metaById = new Map(campaignMetaRows.map((c) => [c.id, c]));
  const todosOsIds = new Set([...metaById.keys(), ...insightNameById.keys()]);

  for (const id of todosOsIds) {
    const c = metaById.get(id);
    const name = c?.name ?? insightNameById.get(id) ?? id;
    // CBO traz o orçamento na campanha; ABO deixa vazio ali e guarda no adset. Preferir o da
    // campanha e cair pro somatório dos adsets ativos cobre as duas estruturas com uma regra só.
    const doAdset = adsetBudgets.get(id);
    const set = {
      name,
      status: c?.status ?? null,
      effectiveStatus: c?.effective_status ?? null,
      objective: c?.objective ?? null,
      dailyBudget: centavosParaReais(c?.daily_budget) ?? centavosParaReais(doAdset?.daily),
      lifetimeBudget: centavosParaReais(c?.lifetime_budget) ?? centavosParaReais(doAdset?.lifetime),
      updatedAt: new Date(),
    };
    await db.insert(campaigns)
      .values({ id, adAccountId: env.metaAdAccountId, ...set })
      .onConflictDoUpdate({ target: campaigns.id, set });
  }

  if (!rows.length) return { upserted: 0, campaigns: campaignMetaRows.length };

  for (const r of rows) {
    await db.insert(adSpendSnapshots).values({
      date: r.date_start,
      adAccountId: env.metaAdAccountId,
      campaignId: r.campaign_id,
      adsetId: r.adset_id,
      adsetName: r.adset_name,
      adId: r.ad_id,
      adName: r.ad_name,
      spend: r.spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      currency: r.account_currency,
    }).onConflictDoUpdate({
      target: [adSpendSnapshots.date, adSpendSnapshots.adAccountId, adSpendSnapshots.campaignId, adSpendSnapshots.adsetId, adSpendSnapshots.adId],
      set: { spend: r.spend, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0), syncedAt: new Date() },
    });
  }

  return { upserted: rows.length };
}
