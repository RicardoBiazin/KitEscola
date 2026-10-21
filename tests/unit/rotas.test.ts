import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { emitirPasse } from "@/lib/protecao";

const mocks = vi.hoisted(() => ({
  buscarTudo: vi.fn(),
  limite: { valor: "ok" as "ok" | "excedido" | "indisponivel" },
}));

vi.mock("@/lib/buscar", () => ({ buscarTudo: mocks.buscarTudo }));
vi.mock("@/lib/lojas/registro", () => ({ lojasAtivas: () => [], REGRAS_FRETE: {} }));
vi.mock("@/lib/limites", () => ({
  verificarLimites: async () => mocks.limite.valor,
  LIMITE_POR_IP_HORA: { buscar: 60, passe: 60, importar: 30, otimizar: 60 },
}));

import { POST as buscar } from "@/app/api/buscar/route";
import { POST as importar } from "@/app/api/importar/route";
import { POST as otimizar } from "@/app/api/otimizar/route";
import { POST as passe } from "@/app/api/passe/route";

const VARS = ["TURNSTILE_SECRET_KEY", "KITESCOLA_SEGREDO", "KITESCOLA_LOCAL", "NETLIFY"];
const URL_BASE = "https://kitescola.test";

function planilhaBytes(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Material", "Quantidade"], ["Lápis preto", 3]]), "Lista");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

function formularioComArquivo(bytes: Uint8Array, nome = "lista.xlsx", passeHeader?: string): Request {
  const fd = new FormData();
  fd.append("arquivo", new File([bytes as BlobPart], nome));
  const headers: Record<string, string> = {};
  if (passeHeader !== undefined) headers["x-kitescola-passe"] = passeHeader;
  return new Request(`${URL_BASE}/api/importar`, { method: "POST", body: fd, headers });
}

describe("rotas da API (proteção ligada)", () => {
  beforeEach(() => {
    for (const v of VARS) delete process.env[v];
    process.env.TURNSTILE_SECRET_KEY = "segredo-turnstile";
    process.env.KITESCOLA_SEGREDO = "segredo-hmac-de-teste";
    mocks.limite.valor = "ok";
    mocks.buscarTudo.mockReset();
  });
  afterEach(() => {
    for (const v of VARS) delete process.env[v];
    vi.restoreAllMocks();
  });

  describe("/api/importar", () => {
    it("sem passe, recusa antes de ler a planilha", async () => {
      const r = await importar(formularioComArquivo(planilhaBytes()));
      expect(r.status).toBe(403);
    });

    it("passe inválido também é recusado", async () => {
      const r = await importar(formularioComArquivo(planilhaBytes(), "lista.xlsx", "lixo"));
      expect(r.status).toBe(403);
    });

    it("corpo declarado maior que 5 MB é recusado com 413 sem ser lido", async () => {
      const req = new Request(`${URL_BASE}/api/importar`, {
        method: "POST",
        headers: { "x-kitescola-passe": emitirPasse("local"), "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) },
        body: "x",
      });
      const r = await importar(req);
      expect(r.status).toBe(413);
    });

    it("planilha válida com passe é lida e devolve os itens", async () => {
      const r = await importar(formularioComArquivo(planilhaBytes(), "lista.xlsx", emitirPasse("local")));
      expect(r.status).toBe(200);
      const j = (await r.json()) as { itens: { nome: string; quantidade: number }[] };
      expect(j.itens).toEqual([expect.objectContaining({ nome: "Lápis preto", quantidade: 3 })]);
    });

    it("arquivo que não é planilha recebe mensagem genérica, sem o texto do leitor", async () => {
      // Cabeçalho de zip (XLSX é zip) seguido de lixo: o leitor falha com mensagem técnica.
      const corrompido = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0x00, 0x13, 0x37, 0x42]);
      const r = await importar(formularioComArquivo(corrompido, "x.xlsx", emitirPasse("local")));
      expect(r.status).toBe(422);
      const texto = await r.text();
      expect(texto).toBe(JSON.stringify({ erro: "Não consegui ler a planilha. Use XLSX, XLS, ODS ou CSV." }));
    });

    it("limite por IP ou por passe estourado responde 429", async () => {
      mocks.limite.valor = "excedido";
      const r = await importar(formularioComArquivo(planilhaBytes(), "lista.xlsx", emitirPasse("local")));
      expect(r.status).toBe(429);
    });
  });

  describe("/api/otimizar", () => {
    it("sem passe, recusa", async () => {
      const r = await otimizar(new Request(`${URL_BASE}/api/otimizar`, { method: "POST", body: "{}" }));
      expect(r.status).toBe(403);
    });

    it("um elemento null em ofertas vira 400 (antes era 500)", async () => {
      const corpo = {
        itens: [{ id: "a", nome: "Caderno", quantidade: 1 }],
        ofertas: [null],
        fretes: {},
        cep: "88010000",
      };
      const r = await otimizar(
        new Request(`${URL_BASE}/api/otimizar`, {
          method: "POST",
          headers: { "x-kitescola-passe": emitirPasse("local") },
          body: JSON.stringify(corpo),
        }),
      );
      expect(r.status).toBe(400);
      expect(((await r.json()) as { erro: string }).erro).toBe("Pedido inválido.");
    });

    it("sku com caractere fora do padrão vira 400", async () => {
      const oferta = {
        lojaId: "vtex-x", lojaNome: "X", itemId: "a", titulo: "Caderno", preco: 1, unidadesPorAnuncio: 1,
        anunciosNecessarios: 1, custoItem: 1, url: "https://x.example", relevancia: 1, ref: { sku: "1/../../admin", seller: "1" },
      };
      const r = await otimizar(
        new Request(`${URL_BASE}/api/otimizar`, {
          method: "POST",
          headers: { "x-kitescola-passe": emitirPasse("local") },
          body: JSON.stringify({ itens: [{ id: "a", nome: "Caderno", quantidade: 1 }], ofertas: [oferta], fretes: {}, cep: "88010000" }),
        }),
      );
      expect(r.status).toBe(400);
    });

    it("limite estourado responde 429", async () => {
      mocks.limite.valor = "excedido";
      const r = await otimizar(new Request(`${URL_BASE}/api/otimizar`, { method: "POST", headers: { "x-kitescola-passe": emitirPasse("local") }, body: "{}" }));
      expect(r.status).toBe(429);
    });
  });

  describe("/api/passe", () => {
    it("sem o desafio do Turnstile, não emite passe", async () => {
      const fetchFalso = vi.spyOn(globalThis, "fetch");
      const r = await passe(new Request(`${URL_BASE}/api/passe`, { method: "POST", body: "{}" }));
      expect(r.status).toBe(403);
      expect(fetchFalso).not.toHaveBeenCalled();
    });

    it("com o desafio aprovado pela Cloudflare, emite passe", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
      const r = await passe(new Request(`${URL_BASE}/api/passe`, { method: "POST", body: JSON.stringify({ turnstile: "x".repeat(40) }) }));
      expect(r.status).toBe(200);
      expect(((await r.json()) as { passe: string }).passe.split(".")).toHaveLength(3);
    });

    it("sem a chave do Turnstile configurada responde 503", async () => {
      delete process.env.TURNSTILE_SECRET_KEY;
      const r = await passe(new Request(`${URL_BASE}/api/passe`, { method: "POST", body: JSON.stringify({ turnstile: "x".repeat(40) }) }));
      expect(r.status).toBe(503);
    });
  });

  describe("/api/buscar", () => {
    const corpo = JSON.stringify({ itens: [{ id: "1", nome: "Caderno", quantidade: 1 }], cep: "88010000", turnstile: "x".repeat(40) });

    it("não vaza detalhe técnico de loja nem de erro para o navegador", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
      mocks.buscarTudo.mockImplementation(async (_lojas, _itens, _cep, emitir) => {
        emitir({ tipo: "loja", status: { lojaId: "vtex-x", lojaNome: "X", estado: "erro", mensagem: "HTTP 403 em https://interno.example/token=segredo", ofertas: 0 } });
        emitir({ tipo: "fim" });
      });
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await buscar(new Request(`${URL_BASE}/api/buscar`, { method: "POST", body: corpo }));
      const texto = await r.text();
      expect(texto).not.toMatch(/interno\.example|token=|HTTP 403|\/var\/x/);
      expect(texto).toContain("Não foi possível consultar esta loja agora.");
    });

    it("erro inesperado da busca vira texto genérico", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
      mocks.buscarTudo.mockRejectedValue(new Error("falha em /opt/app/segredo.ts linha 42"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "info").mockImplementation(() => {});
      const r = await buscar(new Request(`${URL_BASE}/api/buscar`, { method: "POST", body: corpo }));
      const texto = await r.text();
      expect(texto).not.toMatch(/segredo\.ts|linha 42/);
      expect(texto).toContain("Algo deu errado do nosso lado");
    });

    it("limite estourado responde 429 antes de chamar a Cloudflare", async () => {
      mocks.limite.valor = "excedido";
      const fetchFalso = vi.spyOn(globalThis, "fetch");
      const r = await buscar(new Request(`${URL_BASE}/api/buscar`, { method: "POST", body: corpo }));
      expect(r.status).toBe(429);
      expect(fetchFalso).not.toHaveBeenCalled();
    });

    it("armazenamento de limites indisponível responde 503", async () => {
      mocks.limite.valor = "indisponivel";
      const r = await buscar(new Request(`${URL_BASE}/api/buscar`, { method: "POST", body: corpo }));
      expect(r.status).toBe(503);
    });
  });
});
