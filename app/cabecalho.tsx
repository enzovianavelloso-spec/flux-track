import Link from "next/link";

// Marca: seta navy — SVG inline em vez de arquivo/ícone externo, não vale uma requisição.
function Marca() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0B1220" />
      <path d="M9 20 L16 11 L23 20 H17.5 V25 H14.5 V20 Z" fill="#ffffff" />
    </svg>
  );
}

/** Barra fixa do topo. `atual` marca a página em que o usuário está. */
export function Cabecalho({ atual }: { atual: "painel" | "anuncios" | "diagnostico" }) {
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
          <Link href="/anuncios" aria-current={atual === "anuncios" ? "page" : undefined}>
            Anúncios
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
