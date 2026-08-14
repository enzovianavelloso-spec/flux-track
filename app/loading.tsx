import { Cabecalho } from "./cabecalho";

// App Router mostra isto assim que o clique acontece, antes da página nova (com suas
// queries no Postgres) terminar de carregar — sem isto, um clique em pill/nav ficava sem
// feedback nenhum até a resposta completa chegar, e parecia "travado" (Neon pode ter
// cold-start de alguns segundos). Cabecalho é barato (sem query própria) e continua
// visível, só o conteúdo troca por um esqueleto.
export default function Carregando() {
  return (
    <>
      <Cabecalho atual="painel" />
      <main className="pagina">
        <div className="cabecalho">
          <h1 className="titulo">Painel</h1>
        </div>
        <div className="grade grade-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cartao cartao-metrica esqueleto" />
          ))}
        </div>
      </main>
    </>
  );
}
