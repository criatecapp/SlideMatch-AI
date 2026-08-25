import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O projeto guarda .env/.env.local na raiz do repo (mesmo arquivo que o
  // backend lê) — sem isso o Vite procura só em frontend/ e nunca acha
  // VITE_FIREBASE_*, quebrando o Firebase Auth em produção com
  // "auth/invalid-api-key" sem nenhum aviso de build.
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
