import { Cabecalho } from "../cabecalho";
import { Anima } from "../anima";
import { getAdminDiagnostics } from "@/lib/db/queries/admin";

function quando(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function Selo({ tipo, children }: { tipo: "ok" | "erro" | "espera" | "neutro"; children: React.ReactNode }) {
  return <span className={`selo selo-${tipo}`}>{children}</span>;
}

function Secao({
  titulo, descricao, children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cartao" data-anima style={{ marginBottom: "var(--e3)" }}>
      <h2 className="metrica-rotulo" style={{ fontSize: 14, fontWeight: 600, color: "var(--texto)" }}>
        {titulo}
      </h2>
      <p className="metrica-nota" style={{ marginTop: 0, marginBottom: "var(--e3)" }}>{descricao}</p>
      <div className="tabela-rolagem">{children}</div>
    </section>
  );
}

export default async function DiagnosticoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const offset = Math.max(0, Number(sp.offset ?? 0) || 0);
  const d = await getAdminDiagnostics(offset);

  return (
    <>
      <Cabecalho atual="diagnostico" />

      <Anima>
        <main className="pagina">
          <div className="cabecalho">
            <h1 className="titulo">Diagnóstico</h1>
            <p className="subtitulo">O que entrou, o que saiu e o que deu errado no caminho.</p>
          </div>

          <div className="grade grade-3" style={{ marginBottom: "var(--e5)" }}>
            <div className="cartao cartao-metrica" data-anima>
              <div className="metrica-rotulo">Conversões enviadas à Meta</div>
              <div className="metrica-valor num positivo" data-num-valor={d.sentCount} data-num-formato="inteiro">
                {d.sentCount}
              </div>
            </div>
            <div className="cartao cartao-metrica" data-anima>
              <div className="metrica-rotulo">Aguardando reenvio</div>
              <div
                className={`metrica-valor num ${d.pendingEvents.length > 0 ? "negativo" : ""}`}
                data-num-valor={d.pendingEvents.length}
                data-num-formato="inteiro"
              >
                {d.pendingEvents.length}
              </div>
              <div className="metrica-nota">Reenvio automático a cada 5 minutos</div>
            </div>
            <div className="cartao cartao-metrica" data-anima>
              <div className="metrica-rotulo">Tempo médio de resposta</div>
              <div
                className="metrica-valor num"
                data-num-valor={d.avgResponseMs === null ? undefined : d.avgResponseMs}
                data-num-formato="ms"
              >
                {d.avgResponseMs === null ? <span className="vazio">—</span> : `${d.avgResponseMs}ms`}
              </div>
              <div className="metrica-nota">Do webhook recebido até a resposta</div>
            </div>
          </div>

          <Secao
            titulo="Webhooks recebidos"
            descricao="Cada aviso de venda que o GGCheckout mandou pra cá — inclusive os recusados."
          >
            <table className="tabela">
              <thead>
                <tr>
                  <th>Recebido</th>
                  <th>Autenticado</th>
                  <th>Processado</th>
                  <th>Duração</th>
                  <th>Venda</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {d.recentWebhooks.map((w) => (
                  <tr key={w.id} data-anima-linha>
                    <td className="num">{quando(w.receivedAt)}</td>
                    <td>{w.validated ? <Selo tipo="ok">Sim</Selo> : <Selo tipo="erro">Recusado</Selo>}</td>
                    <td>{w.processed ? <Selo tipo="ok">Sim</Selo> : <Selo tipo="neutro">Não</Selo>}</td>
                    <td className="num">{w.durationMs ?? "—"}ms</td>
                    <td className="id-curto">{w.saleId ?? "—"}</td>
                    <td className={w.error ? "negativo" : "vazio"}>{w.error ?? "—"}</td>
                  </tr>
                ))}
                {!d.recentWebhooks.length && (
                  <tr><td className="sem-dado" colSpan={6}>Nenhum webhook recebido até agora.</td></tr>
                )}
              </tbody>
            </table>

            {(offset > 0 || d.recentWebhooks.length === d.pageSize) && (
              <div className="filtros" style={{ marginTop: "var(--e3)", marginBottom: 0 }}>
                {offset > 0 && (
                  <a href={`?offset=${Math.max(0, offset - d.pageSize)}`} className="pill">← Mais recentes</a>
                )}
                {d.recentWebhooks.length === d.pageSize && (
                  <a href={`?offset=${offset + d.pageSize}`} className="pill">Mais antigos →</a>
                )}
              </div>
            )}
          </Secao>

          <Secao
            titulo="Conversões pendentes de envio"
            descricao="Vendas que a Meta ainda não confirmou. O reenvio é automático — desiste após 5 tentativas."
          >
            <table className="tabela">
              <thead>
                <tr><th>Venda</th><th>Situação</th><th>Tentativas</th></tr>
              </thead>
              <tbody>
                {d.pendingEvents.map((e) => (
                  <tr key={e.id} data-anima-linha>
                    <td className="id-curto">{e.id}</td>
                    <td>
                      {e.capiStatus === "failed"
                        ? <Selo tipo="erro">Falhou</Selo>
                        : <Selo tipo="espera">Aguardando</Selo>}
                    </td>
                    <td className="num">{e.capiAttempts} de 5</td>
                  </tr>
                ))}
                {!d.pendingEvents.length && (
                  <tr><td className="sem-dado" colSpan={3}>Nada pendente — toda conversão foi confirmada pela Meta.</td></tr>
                )}
              </tbody>
            </table>
          </Secao>

          <Secao titulo="Últimos erros" descricao="Falhas no processamento de webhooks, da mais recente pra mais antiga.">
            <table className="tabela">
              <thead>
                <tr><th>Quando</th><th>Erro</th></tr>
              </thead>
              <tbody>
                {d.recentErrors.map((e) => (
                  <tr key={e.id} data-anima-linha>
                    <td className="num">{quando(e.receivedAt)}</td>
                    <td className="negativo" style={{ whiteSpace: "normal" }}>{e.error}</td>
                  </tr>
                ))}
                {!d.recentErrors.length && (
                  <tr><td className="sem-dado" colSpan={2}>Nenhum erro registrado.</td></tr>
                )}
              </tbody>
            </table>
          </Secao>

          <Secao titulo="Cliques registrados" descricao="Quem passou pelo link de rastreio antes de cair na página de vendas.">
            <table className="tabela">
              <thead>
                <tr><th>Quando</th><th>ID do clique</th><th>Campanha</th><th>Plataforma</th></tr>
              </thead>
              <tbody>
                {d.recentRedirects.map((r) => (
                  <tr key={r.id} data-anima-linha>
                    <td className="num">{quando(r.createdAt)}</td>
                    <td className="id-curto">{r.id}</td>
                    <td>{r.campaign ?? <span className="vazio">—</span>}</td>
                    <td>{r.platform ?? <span className="vazio">—</span>}</td>
                  </tr>
                ))}
                {!d.recentRedirects.length && (
                  <tr><td className="sem-dado" colSpan={4}>Nenhum clique registrado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </Secao>
        </main>
      </Anima>
    </>
  );
}
