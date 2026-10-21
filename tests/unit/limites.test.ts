import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contar, LIMITE_POR_IP_HORA, LIMITE_POR_PASSE, verificarLimites, type Armazem, type Registro } from "@/lib/limites";
import { emitirPasse } from "@/lib/protecao";

/** Armazém em memória só para o teste (a produção usa o Netlify Blobs). */
function armazemFalso(): Armazem & { dados: Map<string, Registro> } {
  const dados = new Map<string, Registro>();
  return {
    dados,
    async ler(chave) {
      return dados.get(chave) ?? null;
    },
    async gravar(chave, valor) {
      dados.set(chave, valor);
    },
  };
}

const VARS = ["TURNSTILE_SECRET_KEY", "KITESCOLA_SEGREDO", "KITESCOLA_LOCAL", "NETLIFY"];

describe("contar", () => {
  it("deixa passar até o limite e depois recusa dentro da janela", async () => {
    const a = armazemFalso();
    const agora = 1_000;
    expect(await contar(a, "k", 3, 60_000, agora)).toBe(true);
    expect(await contar(a, "k", 3, 60_000, agora + 1)).toBe(true);
    expect(await contar(a, "k", 3, 60_000, agora + 2)).toBe(true);
    expect(await contar(a, "k", 3, 60_000, agora + 3)).toBe(false);
    expect(a.dados.get("k")?.n).toBe(3); // a recusa não grava nova contagem
  });

  it("reinicia quando a janela termina", async () => {
    const a = armazemFalso();
    await contar(a, "k", 1, 1_000, 0);
    expect(await contar(a, "k", 1, 1_000, 500)).toBe(false);
    expect(await contar(a, "k", 1, 1_000, 1_000)).toBe(true);
  });

  it("chaves diferentes não se misturam", async () => {
    const a = armazemFalso();
    expect(await contar(a, "ip:a:otimizar", 1, 60_000, 0)).toBe(true);
    expect(await contar(a, "ip:b:otimizar", 1, 60_000, 0)).toBe(true);
    expect(await contar(a, "ip:a:otimizar", 1, 60_000, 0)).toBe(false);
  });
});

describe("verificarLimites", () => {
  beforeEach(() => {
    for (const v of VARS) delete process.env[v];
    process.env.TURNSTILE_SECRET_KEY = "segredo-turnstile";
    process.env.KITESCOLA_SEGREDO = "segredo-hmac-de-teste";
  });
  afterEach(() => {
    for (const v of VARS) delete process.env[v];
    vi.restoreAllMocks();
  });

  it("limite por IP por hora: a rota recusa depois do teto", async () => {
    const a = armazemFalso();
    const teto = LIMITE_POR_IP_HORA.importar;
    for (let i = 0; i < teto; i++) expect(await verificarLimites("importar", "1.1.1.1", null, 0, a)).toBe("ok");
    expect(await verificarLimites("importar", "1.1.1.1", null, 0, a)).toBe("excedido");
    // outro IP não é afetado
    expect(await verificarLimites("importar", "2.2.2.2", null, 0, a)).toBe("ok");
  });

  it("limite por passe: um passe não rende mais de LIMITE_POR_PASSE chamadas", async () => {
    const a = armazemFalso();
    const agora = 1_000_000;
    const passe = emitirPasse("3.3.3.3", agora);
    for (let i = 0; i < LIMITE_POR_PASSE; i++) {
      expect(await verificarLimites("otimizar", `ip-${i}`, passe, agora, a)).toBe("ok");
    }
    expect(await verificarLimites("otimizar", "ip-novo", passe, agora, a)).toBe("excedido");
  });

  it("passe com formato inválido é recusado pelo limite", async () => {
    expect(await verificarLimites("otimizar", "1.1.1.1", "lixo", 0, armazemFalso())).toBe("excedido");
  });

  it("falha do armazenamento fecha a rota (indisponivel), não deixa passar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quebrado: Armazem = {
      ler: async () => {
        throw new Error("Blobs não configurado");
      },
      gravar: async () => {},
    };
    expect(await verificarLimites("buscar", "1.1.1.1", null, 0, quebrado)).toBe("indisponivel");
  });

  it("local (KITESCOLA_LOCAL=1) não conta nada", async () => {
    process.env.KITESCOLA_LOCAL = "1";
    const a = armazemFalso();
    for (let i = 0; i < LIMITE_POR_IP_HORA.otimizar + 5; i++) {
      expect(await verificarLimites("otimizar", "local", null, 0, a)).toBe("ok");
    }
    expect(a.dados.size).toBe(0);
  });
});
