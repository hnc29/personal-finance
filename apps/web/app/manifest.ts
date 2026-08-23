import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Finance",
    short_name: "Finance",
    description: "Local-first personal finance ledger",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ed",
    theme_color: "#22614a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
