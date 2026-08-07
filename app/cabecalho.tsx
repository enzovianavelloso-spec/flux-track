import Link from "next/link";

// Marca: três barras subindo (clique → venda → lucro) dentro de um contorno arredondado.
// SVG inline em vez de arquivo/ícone externo — são 6 formas, não vale uma requisição.
function Marca() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" stroke="var(--borda-forte)" strokeWidth="1.5" />
      <rect x="6" y="13" width="3" height="5" rx="1.5" fill="var(--texto-suave)" />
      <rect x="10.5" y="9.5" width="3" height="8.5" rx="1.5" fill="var(--marca)" />
      <rect x="15" y="6" width="3" height="12" rx="1.5" fill="var(--positivo)" />
    </svg>
  );
}

/** Barra fixa do topo. `atual` marca a página em que o usuário está. */
export function Cabecalho({ atual }: { atual: "painel" | "diagnostico" }) {
  // Horário real, não decoração: esta página só chega até aqui depois de consultar o
  // banco com sucesso (getDashboard/getAdminDiagnostics rodam antes do JSX), então "agora"
  // É o horário do dado — ao contrário do selo fixo "Banco conectado" que veio antes disso
  // e nunca refletia estado nenhum.
  const agora = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="topo">
      <div className="topo-interno">
        <Link href="/" className="marca">
          <Marca />
          Flux Track
        </Link>

        <nav className="nav" aria-label="Navegação principal">
          <Link href="/" aria-current={atual === "painel" ? "page" : undefined}>
            Painel
          </Link>
          <Link href="/admin" aria-current={atual === "diagnostico" ? "page" : undefined}>
            Diagnóstico
          </Link>
        </nav>

        <div className="status-conexao">
          <span className="ponto" aria-hidden="true" />
          Atualizado às {agora}
        </div>
      </div>
    </header>
  );
}
