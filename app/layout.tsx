import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// UberMove — mesma fonte usada pela Utmify (uso interno/próprio, sem redistribuição).
// Arquivos baixados direto do CDN deles (app.utmify.com.br/fonts/) e auto-hospedados aqui.
const fonteUi = localFont({
  src: [
    { path: "../public/fonts/UberMoveTextLight.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/UberMoveTextRegular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/UberMoveTextMedium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/UberMoveTextBold.otf", weight: "700", style: "normal" },
  ],
  variable: "--fonte-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flux Track",
  description: "Rastreamento de anúncios: do clique à venda confirmada.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Flux Track" },
};

export const viewport: Viewport = {
  themeColor: "#0a0e17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={fonteUi.variable}>
      <body>{children}</body>
    </html>
  );
}
