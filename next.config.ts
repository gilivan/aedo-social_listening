import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (WASM) e pdfkit (font AFM + dati) leggono file dal filesystem:
  // il bundling li romperebbe, restano esterni. L'SDK MCP porta con sé server
  // HTTP interi (express, hono): esterno anche lui, non va impacchettato.
  // playwright-core (lector de reseñas de Google Maps) controla un Chrome real: no se empaqueta.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit", "@modelcontextprotocol/sdk", "playwright-core"],
};

export default nextConfig;
