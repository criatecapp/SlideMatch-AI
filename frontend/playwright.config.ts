import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Fluxo real: signup + template + projeto + apresentação + geração real
  // (OpenAI) + edição + reabertura + export real (Storage) — cada etapa é
  // uma chamada de rede de verdade, soma bastante. A geração agora também
  // roda o Render QA (P1#2) — satori/resvg de verdade por seção — então o
  // timeout tem folga extra além do que a chamada de IA sozinha levaria.
  timeout: 210_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // O servidor (vercel dev) já sobe separado — section 32 pede o fluxo
  // real completo (login → gerar → editar → exportar), incluindo as
  // rotas /api reais, que só existem sob vercel dev, não sob `vite dev`.
  webServer: {
    command: "true",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 5_000,
  },
});
