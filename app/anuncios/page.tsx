import Link from "next/link";
import { Cabecalho } from "../cabecalho";
import { Anima } from "../anima";
import { getCampanhas } from "@/lib/db/queries/anuncios";
import { dinheiro, porcento, comFiltros, calcularPeriodo, Metrica, Selo } from "../_lib/ui";

/** Meta manda `status` (ACTIVE/PAUSED/DELETED/ARCHIVED) e `effective_status`, mais granular
 *  (ex: PENDING_REVIEW, CAMPAIGN_PAUSED, ADSET_PAUSED). Cor + texto sempre juntos — nunca
 *  só a cor carrega o significado. */
function seloStatus(status: string | null, effectiveStatus: string | null) {
  if (status === "ACTIVE") return <Selo tipo="ok">Ativo</Selo>;
  if (status === "PAUSED") return <Selo tipo="neutro">Pausado</Selo>;
  if (status === null) return <Selo tipo="espera">Sem dado</Selo>;
  return <Selo tipo="espera">{effectiveStatus ?? status}</Selo>;
}

function orcamentoTexto(dailyBudget: number | null, lifetimeBudget: number | null) {
  if (dailyBudget) return `${dinheiro(dailyBudget)}/dia`;
  if (lifetimeBudget) return `${dinheiro(lifetimeBudget)}/total`;
  return null;
}

export default async function AnunciosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { periodos, from, to, semFiltroData, filtroHojeImplicito } = calcularPeriodo(sp, new Date());
  const { campanhas, totais } = await getCampanhas({ from, to });

  return (
    <>
      <Cabecalho atual="anuncios" />

      <Anima>
        <main className="pagina">
          <div className="cabecalho">
            <h1 className="titulo">Anúncios</h1>
            <p className="subtitulo">
              {semFiltroData
                ? "Todo o período registrado"
                : filtroHojeImplicito
                ? "Hoje"
                : "Período filtrado"}
              {" — gasto e performance por campanha, direto da Meta."}
            </p>
          </div>

          <div className="filtros filtros-periodo">
            {periodos.map((p, i) => (
              <Link
                key={p.rotulo}
                href={comFiltros(sp, { from: p.de, to: p.ate, periodo: undefined })}
                className="pill"
                aria-current={p.ativo || (i === 0 && filtroHojeImplicito) ? "true" : undefined}
              >
                {p.rotulo}
              </Link>
            ))}
            <Link href={comFiltros(sp, { from: undefined, to: undefined, periodo: "tudo" })} className="pill" aria-current={semFiltroData ? "true" : undefined}>
              Tudo
            </Link>
          </div>

          <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Resumo do período</div>
          <div className="grade grade-4">
            <Metrica
              hero
              rotulo="Lucro"
              valorNum={totais.lucro}
              valorTexto={dinheiro(totais.lucro)}
              formato="moeda"
              nota="Receita menos gasto, todas as campanhas"
              cor={totais.lucro >= 0 ? "positivo" : "negativo"}
            />
            <Metrica rotulo="Gasto total" valorNum={totais.gasto} valorTexto={dinheiro(totais.gasto)} formato="moeda" nota="Investido na Meta" />
            <Metrica rotulo="Receita total" valorNum={totais.receita} valorTexto={dinheiro(totais.receita)} formato="moeda" nota="Vendas pagas atribuídas" />
            <Metrica
              rotulo="ROAS médio"
              valorNum={totais.roas}
              valorTexto={totais.roas === null ? "—" : totais.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x"}
              formato="roas"
              nota="Reais faturados por real investido"
            />
          </div>

          <div className="rotulo-seccao" style={{ marginTop: "var(--e5)" }}>Campanhas</div>
          <section className="cartao" data-anima>
            <p className="metrica-nota" style={{ marginTop: 0, marginBottom: "var(--e3)" }}>
              Ordenadas por gasto. Custo por checkout é o sinal mais confiável pra achar onde o funil quebra — ROAS engana com pouca amostra.
            </p>
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Status</th>
                    <th>Orçamento</th>
                    <th>Gasto</th>
                    <th>Receita</th>
                    <th>Lucro</th>
                    <th>ROAS</th>
                    <th>Checkouts</th>
                    <th>Custo/checkout</th>
                    <th>Vendas</th>
                    <th>Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((c) => {
                    const orcamento = orcamentoTexto(c.dailyBudget, c.lifetimeBudget);
                    const stopLoss = c.roas !== null && c.roas < 1;
                    return (
                      <tr key={c.id} data-anima-linha>
                        <td>{c.nome}</td>
                        <td>{seloStatus(c.status, c.effectiveStatus)}</td>
                        <td className="num">{orcamento ?? <span className="vazio">—</span>}</td>
                        <td className="num">{dinheiro(c.gasto)}</td>
                        <td className="num">{dinheiro(c.receita)}</td>
                        <td className={`num ${c.lucro < 0 ? "negativo" : ""}`}>{dinheiro(c.lucro)}</td>
                        <td className={`num ${stopLoss ? "negativo" : ""}`}>
                          {c.roas === null ? <span className="vazio">—</span> : c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "x"}
                        </td>
                        <td className="num">{c.initiateCheckout}</td>
                        <td className="num">{c.custoPorCheckout === null ? <span className="vazio">—</span> : dinheiro(c.custoPorCheckout)}</td>
                        <td className="num">{c.vendas}</td>
                        <td className="num">{c.taxaConversao === null ? <span className="vazio">—</span> : porcento(c.taxaConversao)}</td>
                      </tr>
                    );
                  })}
                  {!campanhas.length && (
                    <tr><td className="sem-dado" colSpan={11}>Nenhuma campanha sincronizada ainda — a Meta ainda não retornou nenhuma campanha pra essa conta.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </Anima>
    </>
  );
}
