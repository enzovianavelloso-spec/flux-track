import { getDashboard, type DashboardFilters } from "@/lib/db/queries/dashboard";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const card: React.CSSProperties = { background: "#14171c", border: "1px solid #23272e", borderRadius: 8, padding: 20, flex: 1 };
const label: React.CSSProperties = { fontSize: 13, color: "#9aa2ad", marginBottom: 8 };
const value: React.CSSProperties = { fontSize: 28, fontWeight: 600 };
const select: React.CSSProperties = { background: "#14171c", color: "#e6e8eb", border: "1px solid #23272e", borderRadius: 6, padding: "8px 10px" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filters: DashboardFilters = {
    from: sp.from, to: sp.to, adAccountId: sp.adAccountId,
    trafficSource: sp.trafficSource, platform: sp.platform, productId: sp.productId,
  };
  const d = await getDashboard(filters);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Flux Track</h1>

      <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <input type="date" name="from" defaultValue={sp.from} style={select} />
        <input type="date" name="to" defaultValue={sp.to} style={select} />
        <select name="trafficSource" defaultValue={sp.trafficSource ?? ""} style={select}>
          <option value="">Fonte de tráfego (todas)</option>
          {d.filterOptions.trafficSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ""} style={select}>
          <option value="">Plataforma (todas)</option>
          {d.filterOptions.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="productId" defaultValue={sp.productId ?? ""} style={select}>
          <option value="">Produto (todos)</option>
          {d.filterOptions.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit" style={{ ...select, cursor: "pointer" }}>Filtrar</button>
      </form>

      <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
        <div style={card}><div style={label}>Faturamento líquido</div><div style={value}>{money(d.netRevenue)}</div></div>
        <div style={card}><div style={label}>Gasto com anúncios</div><div style={value}>{money(d.adSpend)}</div></div>
        <div style={card}><div style={label}>ROAS</div><div style={value}>{d.roas === null ? "—" : d.roas.toFixed(2) + "x"}</div></div>
        <div style={card}><div style={label}>Lucro</div><div style={{ ...value, color: d.profit >= 0 ? "#4ade80" : "#f87171" }}>{money(d.profit)}</div></div>
      </div>

      <div style={card}>
        <div style={label}>Funil</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>Cliques <b>{d.funnel.clicks}</b></div>
          <div>Gerados <b>{d.funnel.generated}</b></div>
          <div>Pagos <b>{d.funnel.paid}</b></div>
        </div>
      </div>
    </main>
  );
}
