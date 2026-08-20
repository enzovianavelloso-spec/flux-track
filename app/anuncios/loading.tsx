import { Cabecalho } from "../cabecalho";

export default function Carregando() {
  return (
    <>
      <Cabecalho atual="anuncios" />
      <main className="pagina">
        <div className="cabecalho">
          <h1 className="titulo">Anúncios</h1>
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
