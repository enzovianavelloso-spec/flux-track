import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// next/font baixa e auto-hospeda no build: zero requisição a servidor externo em runtime,
// zero salto de layout na troca da fonte de fallback pela real.
const inter = Inter({
  subsets: ["latin"],
  variable: "--fonte-ui",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--fonte-mono",
  display: "swap",
});

// Fonte de destaque: título e valores de métrica. Geométrica o bastante pra combinar com
// a vibe fintech sem virar peso visual extra — usada só em h1 e no cartão-hero.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--fonte-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Flux Track",
  description: "Rastreamento de anúncios: do clique à venda confirmada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <body>
        {/* Fundo ambiente: 3 blobs em transform puro, atrás de todo o conteúdo (z-index -1,
            ver .ambiente em globals.css). Fica no layout raiz pra não recriar entre navegações
            client-side e evitar o blob "piscar" de posição a cada troca de página. */}
        <div className="ambiente" aria-hidden="true">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        {children}
      </body>
    </html>
  );
}
