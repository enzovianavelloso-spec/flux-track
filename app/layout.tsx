import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font baixa e auto-hospeda no build: zero requisição a servidor externo em runtime,
// zero salto de layout na troca da fonte de fallback pela real. Uma fonte só — flat design
// não precisa de fonte de destaque separada nem de monoespaçada pros números.
const inter = Inter({
  subsets: ["latin"],
  variable: "--fonte-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flux Track",
  description: "Rastreamento de anúncios: do clique à venda confirmada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
