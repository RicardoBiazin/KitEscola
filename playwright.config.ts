import { defineConfig } from "@playwright/test";

// E2E com lojas simuladas (KITESCOLA_MOCK=1) e o Edge instalado — não baixa navegador.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3200", channel: "msedge", headless: true, locale: "pt-BR" },
  webServer: {
    command: "npx next start -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    env: { KITESCOLA_MOCK: "1", KITESCOLA_LOCAL: "1" },
    timeout: 120_000,
  },
});
