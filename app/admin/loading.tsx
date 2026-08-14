import { Cabecalho } from "../cabecalho";

export default function Carregando() {
  return (
    <>
      <Cabecalho atual="diagnostico" />
      <main className="pagina">
        <div className="cabecalho">
          <h1 className="titulo">Diagnóstico</h1>
        </div>
        <div className="grade grade-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cartao cartao-metrica esqueleto" />
          ))}
        </div>
      </main>
    </>
  );
}
