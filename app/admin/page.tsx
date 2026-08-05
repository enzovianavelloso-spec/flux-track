import Link from "next/link";
import { getAdminDiagnostics } from "@/lib/db/queries/admin";

const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 32 };
const section: React.CSSProperties = { background: "#14171c", border: "1px solid #23272e", borderRadius: 8, padding: 20, marginBottom: 24 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 12 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", color: "#9aa2ad", padding: "6px 8px", borderBottom: "1px solid #23272e" };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #1a1d22" };
const linkBtn: React.CSSProperties = { color: "#9aa2ad", textDecoration: "none", padding: "6px 10px", border: "1px solid #23272e", borderRadius: 6 };

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset ?? 0) || 0);
  const d = await getAdminDiagnostics(offset);

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Diagnóstico</h1>
      <div style={{ display: "flex", gap: 16, marginBottom: 24, fontSize: 13, color: "#9aa2ad" }}>
        <span>Eventos enviados: <b style={{ color: "#e6e8eb" }}>{d.sentCount}</b></span>
        <span>Eventos pendentes: <b style={{ color: "#e6e8eb" }}>{d.pendingEvents.length}</b></span>
        <span>Tempo médio de resposta: <b style={{ color: "#e6e8eb" }}>{d.avgResponseMs === null ? "—" : `${d.avgResponseMs}ms`}</b></span>
        <Link href="/" style={{ marginLeft: "auto", color: "#9aa2ad" }}>← Dashboard</Link>
      </div>

      <div style={section}>
        <div style={title}>Últimos webhooks</div>
        <table style={table}>
          <thead><tr><th style={th}>Recebido</th><th style={th}>Validado</th><th style={th}>Processado</th><th style={th}>Duração</th><th style={th}>Venda</th><th style={th}>Erro</th></tr></thead>
          <tbody>
            {d.recentWebhooks.map((w) => (
              <tr key={w.id}>
                <td style={td}>{fmt(w.receivedAt)}</td>
                <td style={td}>{w.validated ? "sim" : "não"}</td>
                <td style={td}>{w.processed ? "sim" : "não"}</td>
                <td style={td}>{w.durationMs ?? "—"}ms</td>
                <td style={td}>{w.saleId ?? "—"}</td>
                <td style={{ ...td, color: w.error ? "#f87171" : undefined }}>{w.error ?? "—"}</td>
              </tr>
            ))}
            {!d.recentWebhooks.length && <tr><td style={td} colSpan={6}>Nenhum webhook registrado ainda.</td></tr>}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {offset > 0 && <a href={`?offset=${Math.max(0, offset - d.pageSize)}`} style={linkBtn}>← Anteriores</a>}
          {d.recentWebhooks.length === d.pageSize && <a href={`?offset=${offset + d.pageSize}`} style={linkBtn}>Próximos →</a>}
        </div>
      </div>

      <div style={section}>
        <div style={title}>Eventos CAPI pendentes / com falha</div>
        <table style={table}>
          <thead><tr><th style={th}>Venda</th><th style={th}>Status</th><th style={th}>Tentativas</th></tr></thead>
          <tbody>
            {d.pendingEvents.map((e) => (
              <tr key={e.id}><td style={td}>{e.id}</td><td style={td}>{e.capiStatus}</td><td style={td}>{e.capiAttempts}</td></tr>
            ))}
            {!d.pendingEvents.length && <tr><td style={td} colSpan={3}>Nenhum evento pendente.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={section}>
        <div style={title}>Últimos erros</div>
        <table style={table}>
          <thead><tr><th style={th}>Quando</th><th style={th}>Erro</th></tr></thead>
          <tbody>
            {d.recentErrors.map((e) => (
              <tr key={e.id}><td style={td}>{fmt(e.receivedAt)}</td><td style={{ ...td, color: "#f87171" }}>{e.error}</td></tr>
            ))}
            {!d.recentErrors.length && <tr><td style={td} colSpan={2}>Nenhum erro registrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={section}>
        <div style={title}>Últimos redirects (cliques)</div>
        <table style={table}>
          <thead><tr><th style={th}>Quando</th><th style={th}>Clickid</th><th style={th}>Campanha</th><th style={th}>Plataforma</th></tr></thead>
          <tbody>
            {d.recentRedirects.map((r) => (
              <tr key={r.id}><td style={td}>{fmt(r.createdAt)}</td><td style={td}>{r.id}</td><td style={td}>{r.campaign ?? "—"}</td><td style={td}>{r.platform ?? "—"}</td></tr>
            ))}
            {!d.recentRedirects.length && <tr><td style={td} colSpan={4}>Nenhum clique registrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
