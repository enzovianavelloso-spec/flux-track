import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, clicks, sales, adSpendSnapshots } from "@/lib/db/schema";

// Mesmo raciocínio de dashboard.ts: ad_spend_snapshots.date já é calendário local da Meta,
// sales.received_at é timestamptz (UTC) — precisa converter pra não desalinhar spend vs
// receita perto da meia-noite. sql.raw porque Postgres exige GROUP BY textualmente idêntico
// ao SELECT; três interpolações de bind param do mesmo valor não seriam reconhecidas como a
// mesma chave de agrupamento.
const ACCOUNT_TIMEZONE = "America/Sao_Paulo";
const TZ = sql.raw(`'${ACCOUNT_TIMEZONE}'`);

export interface AnunciosFilters {
  from?: string;
  to?: string;
}

export interface CampanhaRow {
  id: string;
  nome: string;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  gasto: number;
  receita: number;
  lucro: number;
  roas: number | null;
  initiateCheckout: number;
  custoPorCheckout: number | null; // gasto / IC — sinal mais confiável que ROAS pra achar
  // onde o funil quebra (baixa amostragem faz ROAS mentir; ver AUDITORIA de 2026-08-20)
  vendas: number;
  taxaConversao: number | null;
}

export interface AnunciosResult {
  campanhas: CampanhaRow[];
  totais: {
    gasto: number;
    receita: number;
    lucro: number;
    roas: number | null;
    initiateCheckout: number;
    vendas: number;
  };
}

export async function getCampanhas(f: AnunciosFilters): Promise<AnunciosResult> {
  const spendConds = [];
  if (f.from) spendConds.push(gte(adSpendSnapshots.date, f.from));
  if (f.to) spendConds.push(lte(adSpendSnapshots.date, f.to));

  const salesConds = [eq(sales.status, "paid")];
  if (f.from) salesConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) salesConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date <= ${f.to}::date`);

  // checkoutConds cobre qualquer status (InitiateCheckout dispara em .generated, antes de
  // saber se a venda vai ser paga — filtrar por status='paid' aqui perderia carrinho
  // abandonado, que é justamente o dado que mostra o funil quebrando).
  const checkoutConds = [eq(sales.capiCheckoutStatus, "sent")];
  if (f.from) checkoutConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) checkoutConds.push(sql`(${sales.receivedAt} at time zone ${TZ})::date <= ${f.to}::date`);

  // Três agregados independentes + merge em JS — mais legível que um LEFT JOIN triplo com
  // duas subqueries agregadas, e LEFT JOIN a partir de `campaigns` garante que campanha sem
  // gasto/venda no período ainda aparece (com zeros), não some da lista.
  const [campanhasBase, spendRows, revenueRows, checkoutRows] = await Promise.all([
    db.select().from(campaigns),
    db.select({
      campaignId: adSpendSnapshots.campaignId,
      spend: sql<string>`coalesce(sum(${adSpendSnapshots.spend}), 0)`,
    }).from(adSpendSnapshots)
      .where(spendConds.length ? and(...spendConds) : undefined)
      .groupBy(adSpendSnapshots.campaignId),
    db.select({
      campaignId: clicks.metaCampaignId,
      receita: sql<string>`coalesce(sum(${sales.amount}), 0)`,
      vendas: sql<number>`count(*)`,
    }).from(sales)
      .innerJoin(clicks, eq(sales.clickid, clicks.id))
      .where(and(...salesConds))
      .groupBy(clicks.metaCampaignId),
    db.select({
      campaignId: clicks.metaCampaignId,
      n: sql<number>`count(*)`,
    }).from(sales)
      .innerJoin(clicks, eq(sales.clickid, clicks.id))
      .where(and(...checkoutConds))
      .groupBy(clicks.metaCampaignId),
  ]);

  const spendById = new Map(spendRows.map((r) => [r.campaignId, Number(r.spend)]));
  const revenueById = new Map(revenueRows.map((r) => [r.campaignId, { receita: Number(r.receita), vendas: Number(r.vendas) }]));
  const checkoutById = new Map(checkoutRows.map((r) => [r.campaignId, Number(r.n)]));

  const campanhas: CampanhaRow[] = campanhasBase
    // Campanha sem nenhuma atividade no período filtrado só aparece se ainda for
    // ativa/pausada de verdade — sem isso, toda campanha deletada/arquivada da história da
    // conta apareceria pra sempre, zerada, mesmo filtrando "Hoje". Ativa/pausada sem gasto
    // no período continua aparecendo (é o caso que a sessão existe pra mostrar).
    .filter((c) => {
      const teveAtividade = (spendById.get(c.id) ?? 0) > 0 || revenueById.has(c.id) || checkoutById.has(c.id);
      return teveAtividade || c.status === "ACTIVE" || c.status === "PAUSED";
    })
    .map((c) => {
      const gasto = spendById.get(c.id) ?? 0;
      const receitaRow = revenueById.get(c.id);
      const receita = receitaRow?.receita ?? 0;
      const vendas = receitaRow?.vendas ?? 0;
      const initiateCheckout = checkoutById.get(c.id) ?? 0;
      const lucro = receita - gasto;
      return {
        id: c.id,
        nome: c.name ?? c.id,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null,
        lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null,
        gasto,
        receita,
        lucro,
        roas: gasto > 0 ? receita / gasto : null,
        initiateCheckout,
        custoPorCheckout: initiateCheckout > 0 ? gasto / initiateCheckout : null,
        vendas,
        taxaConversao: initiateCheckout > 0 ? vendas / initiateCheckout : null,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);

  const totais = campanhas.reduce((acc, c) => ({
    gasto: acc.gasto + c.gasto,
    receita: acc.receita + c.receita,
    lucro: acc.lucro + c.lucro,
    initiateCheckout: acc.initiateCheckout + c.initiateCheckout,
    vendas: acc.vendas + c.vendas,
  }), { gasto: 0, receita: 0, lucro: 0, initiateCheckout: 0, vendas: 0 });

  return {
    campanhas,
    totais: { ...totais, roas: totais.gasto > 0 ? totais.receita / totais.gasto : null },
  };
}
