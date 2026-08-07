import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Flux Track",
  description: "Rastreamento de anúncios: do clique à venda confirmada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
