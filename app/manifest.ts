import type { MetadataRoute } from "next";

// Next.js metadata-route convention: served at /manifest.webmanifest, and the <link
// rel="manifest"> tag is injected automatically — no manual <head> wiring needed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flux Track",
    short_name: "Flux Track",
    description: "Rastreamento de anúncios: do clique à venda confirmada.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#0B1220",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
