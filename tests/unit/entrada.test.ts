import { describe, expect, it } from "vitest";
import {
  ERRO_PUBLICO,
  lerCorpoLimitado,
  mensagemPublicaDaLoja,
  refValida,
  urlSegura,
  validarFretes,
  validarItens,
  validarOfertas,
} from "@/lib/entrada";
import type { Oferta } from "@/lib/tipos";

function oferta(extra: Record<string, unknown> = {}): Oferta {
  return {
    lojaId: "vtex-x",
    lojaNome: "Loja X",
    itemId: "item-1",
    titulo: "Caderno 10 matérias",
    preco: 12.5,
    unidadesPorAnuncio: 1,
    anunciosNecessarios: 2,
    custoItem: 25,
    url: "https://loja.example/caderno",
    relevancia: 0.9,
    ref: { sku: "123", seller: "1" },
    ...extra,
  } as Oferta;
}

describe("validarOfertas", () => {
  it("aceita ofertas no formato da busca", () => {
    expect(validarOfertas([oferta(), oferta({ ref: undefined, freteItem: 3 })])).toHaveLength(2);
  });

  it("recusa um elemento null (antes dava erro 500 sem tratamento)", () => {
    expect(validarOfertas([oferta(), null])).toBeNull();
    expect(validarOfertas([42])).toBeNull();
  });

  it("recusa campos numéricos ou textuais com tipo errado", () => {
    expect(validarOfertas([oferta({ preco: "12,50" })])).toBeNull();
    expect(validarOfertas([oferta({ url: 123 })])).toBeNull();
    expect(validarOfertas([oferta({ relevancia: Number.NaN })])).toBeNull();
  });

  it("recusa lista grande demais e não-lista", () => {
    expect(validarOfertas("nada")).toBeNull();
    expect(validarOfertas(new Array(4001).fill(oferta()))).toBeNull();
  });
});

describe("sku e seller (corpo da simulação VTEX)", () => {
  it("aceita só letras, números, _ e - com até 40 caracteres", () => {
    expect(refValida({ sku: "123456", seller: "1" })).toBe(true);
    expect(refValida({ sku: "abc_DEF-9", seller: "1_1" })).toBe(true);
    expect(refValida({ sku: "a".repeat(40) })).toBe(true);
    expect(refValida({ sku: "" })).toBe(true); // vazio é tratado pela loja como "sem sku"
  });

  it("recusa caracteres fora do padrão e tamanho acima de 40", () => {
    expect(refValida({ sku: "1/../../x" })).toBe(false);
    expect(refValida({ sku: "1,2" })).toBe(false);
    expect(refValida({ sku: "a".repeat(41) })).toBe(false);
    expect(refValida({ seller: '"}' })).toBe(false);
    expect(validarOfertas([oferta({ ref: { sku: "x y" } })])).toBeNull();
  });

  it("outras chaves de ref aceitam texto curto sem o padrão de sku", () => {
    expect(refValida({ item: "MLB1234567890", loja: "Nome da loja" })).toBe(true);
    expect(refValida({ item: "x".repeat(201) })).toBe(false);
  });
});

describe("validarItens e validarFretes", () => {
  it("itens: id, nome e quantidade; quantidade limitada entre 1 e 999", () => {
    expect(validarItens([{ id: "a", nome: "  Lápis ", quantidade: 5000 }])).toEqual([{ id: "a", nome: "Lápis", quantidade: 999 }]);
    expect(validarItens([{ id: "a", nome: "Lápis", quantidade: 0 }])?.[0].quantidade).toBe(1);
  });

  it("itens: recusa lista vazia, id ausente, nome vazio e mais de 60 itens", () => {
    expect(validarItens([])).toBeNull();
    expect(validarItens([{ nome: "x", quantidade: 1 }])).toBeNull();
    expect(validarItens([{ id: "a", nome: "   ", quantidade: 1 }])).toBeNull();
    expect(validarItens(new Array(61).fill({ id: "a", nome: "x", quantidade: 1 }))).toBeNull();
  });

  it("fretes: valor, tipo e entrega obrigatórios; ausente vale vazio", () => {
    expect(validarFretes(undefined)).toEqual({});
    expect(validarFretes({ "vtex-x": { valor: 10, tipo: "real", entrega: true } })).not.toBeNull();
    expect(validarFretes({ "vtex-x": { valor: "10", tipo: "real", entrega: true } })).toBeNull();
    expect(validarFretes({ "vtex-x": { valor: 10, tipo: "outro", entrega: true } })).toBeNull();
    expect(validarFretes({ "vtex-x": null })).toBeNull();
  });
});

describe("urlSegura (href dos resultados)", () => {
  it("só http e https viram link", () => {
    expect(urlSegura("https://loja.example/p")).toBe("https://loja.example/p");
    expect(urlSegura("http://loja.example/p")).toBe("http://loja.example/p");
  });

  it("javascript:, data: e texto inválido não viram link", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("JavaScript:alert(1)")).toBeNull();
    expect(urlSegura("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(urlSegura("//sem-protocolo.example")).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });
});

describe("mensagens para o navegador", () => {
  it("texto genérico por estado, sem detalhe técnico", () => {
    expect(mensagemPublicaDaLoja("erro")).not.toMatch(/HTTP|403|stack|https?:/i);
    expect(mensagemPublicaDaLoja("bloqueada")).not.toMatch(/HTTP|403|429/);
    expect(ERRO_PUBLICO).not.toMatch(/Error|stack|at /);
  });
});

describe("lerCorpoLimitado", () => {
  it("devolve o corpo quando cabe", async () => {
    const req = new Request("https://x", { method: "POST", body: new Uint8Array([1, 2, 3]) });
    expect(Array.from((await lerCorpoLimitado(req, 10)) ?? [])).toEqual([1, 2, 3]);
  });

  it("recusa, sem guardar, um corpo maior que o limite", async () => {
    const req = new Request("https://x", { method: "POST", body: new Uint8Array(1000) });
    expect(await lerCorpoLimitado(req, 100)).toBeNull();
  });

  it("recusa pelo Content-Length declarado antes de ler", async () => {
    const req = new Request("https://x", { method: "POST", headers: { "content-length": "999999" }, body: "pequeno" });
    expect(await lerCorpoLimitado(req, 100)).toBeNull();
  });

  it("sem Content-Length (corpo em partes), conta enquanto chega e corta no limite", async () => {
    let enviados = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (enviados++ >= 5) controller.close();
        else controller.enqueue(new Uint8Array(40));
      },
    });
    const req = new Request("https://x", { method: "POST", body: corpo, duplex: "half" } as RequestInit);
    expect(await lerCorpoLimitado(req, 100)).toBeNull(); // 5 x 40 bytes > 100
  });
});
