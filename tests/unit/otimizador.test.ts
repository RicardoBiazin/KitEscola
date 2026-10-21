import { describe, expect, it } from "vitest";
import { otimizar, planosPorLoja, rotularPlanos, type ModeloFrete } from "@/lib/otimizador";
import type { ItemLista, Oferta } from "@/lib/tipos";

const itens: ItemLista[] = [
  { id: "a", nome: "caderno", quantidade: 1 },
  { id: "b", nome: "lápis", quantidade: 1 },
  { id: "c", nome: "cola", quantidade: 1 },
];

function oferta(lojaId: string, itemId: string, custo: number, extra: Partial<Oferta> = {}): Oferta {
  return {
    lojaId,
    lojaNome: lojaId.toUpperCase(),
    itemId,
    titulo: itemId,
    preco: custo,
    unidadesPorAnuncio: 1,
    anunciosNecessarios: 1,
    custoItem: custo,
    url: "#",
    relevancia: 1,
    ...extra,
  };
}

const modelo = (lojaNome: string, valor: number, gratisAcima?: number, entrega = true): ModeloFrete => ({
  lojaNome,
  gratisAcima,
  frete: { valor, tipo: "real", entrega },
});

describe("otimizar", () => {
  it("prefere uma loja quando o frete extra não compensa", () => {
    const ofertas = [oferta("x", "a", 20), oferta("x", "b", 3), oferta("x", "c", 5), oferta("y", "a", 18)];
    const modelos = new Map([["x", modelo("X", 10)], ["y", modelo("Y", 15)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    expect(melhor.lojas.map((l) => l.lojaId)).toEqual(["x"]);
    expect(melhor.total).toBe(38);
  });

  it("divide entre lojas quando compensa", () => {
    const ofertas = [oferta("x", "a", 50), oferta("x", "b", 3), oferta("x", "c", 5), oferta("y", "a", 20)];
    const modelos = new Map([["x", modelo("X", 10)], ["y", modelo("Y", 5)]]);
    const planos = otimizar(itens, ofertas, modelos);
    expect(planos[0].id).toBe("mais-barato");
    expect(planos[0].total).toBe(20 + 5 + 3 + 5 + 10);
    expect(planos.find((p) => p.titulo === "Tudo na X")?.total).toBe(68);
  });

  it("considera frete grátis acima do valor mínimo", () => {
    const ofertas = [oferta("x", "a", 80), oferta("x", "b", 15), oferta("x", "c", 10), oferta("y", "c", 8)];
    const modelos = new Map([["x", modelo("X", 20, 100)], ["y", modelo("Y", 0)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    // Tudo na X = 105 com frete grátis; mover a cola para Y deixa X abaixo de 100 e paga frete.
    expect(melhor.total).toBe(105);
    expect(melhor.totalFrete).toBe(0);
  });

  it("ignora loja que não entrega e aponta itens sem oferta", () => {
    const ofertas = [oferta("x", "a", 10), oferta("z", "b", 1)];
    const modelos = new Map([["x", modelo("X", 5)], ["z", modelo("Z", 0, undefined, false)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    expect(melhor.lojas.map((l) => l.lojaId)).toEqual(["x"]);
    expect(melhor.itensSemOferta.sort()).toEqual(["b", "c"]);
  });

  it("maximiza cobertura antes de preço", () => {
    const ofertas = [oferta("x", "a", 10), oferta("y", "a", 5), oferta("y", "b", 5), oferta("x", "c", 1)];
    const modelos = new Map([["x", modelo("X", 30)], ["y", modelo("Y", 0)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    expect(melhor.itensSemOferta).toEqual([]);
  });

  it("retirada na loja só entra se o usuário aceitar", () => {
    const ofertas = [oferta("x", "a", 30), oferta("r", "a", 10)];
    const modelos = new Map([
      ["x", modelo("X", 10)],
      ["r", { lojaNome: "R", frete: { valor: 0, tipo: "real" as const, entrega: false, retirada: true } }],
    ]);
    expect(otimizar(itens, ofertas, modelos)[0].lojas[0].lojaId).toBe("x");
    expect(otimizar(itens, ofertas, modelos, { aceitarRetirada: true })[0].lojas[0].lojaId).toBe("r");
  });

  it("usa o frete por item quando a loja informa (marketplace)", () => {
    // Frete do carrinho inteiro da Y seria 40, mas só o item "a" custa 2 de frete lá.
    const ofertas = [
      oferta("x", "a", 20), oferta("x", "b", 3), oferta("x", "c", 5),
      oferta("y", "a", 10, { freteItem: 2 }), oferta("y", "b", 30, { freteItem: 38 }),
    ];
    const modelos = new Map([["x", modelo("X", 10)], ["y", modelo("Y", 40)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    expect(melhor.total).toBe(10 + 2 + 3 + 5 + 10);
    expect(melhor.lojas.find((l) => l.lojaId === "y")?.frete.valor).toBe(2);
  });

  it("frete de pacote: um por vendedor, não a soma dos rateios", () => {
    // Na simulação completa o frete de 14,90 da loja G foi rateado entre 2 itens (7,45 cada).
    // Comprando só um item lá, o frete continua 14,90.
    const pac = { freteItem: 7.45, fretePacote: 14.9, ref: { seller: "1" } };
    const ofertas = [oferta("g", "a", 6.68, pac), oferta("g", "b", 3, pac), oferta("m", "b", 1), oferta("m", "c", 1)];
    const modelos = new Map([["g", modelo("G", 14.9)], ["m", modelo("M", 0)]]);
    const [melhor] = otimizar(itens, ofertas, modelos);
    const g = melhor.lojas.find((l) => l.lojaId === "g")!;
    expect(g.itens.map((o) => o.itemId)).toEqual(["a"]);
    expect(g.frete.valor).toBe(14.9);
    expect(melhor.total).toBe(6.68 + 14.9 + 1 + 1);
  });

  it("marketplace: vendedores diferentes pagam frete separado", () => {
    const ofertas = [
      oferta("c", "a", 10, { freteItem: 5, fretePacote: 5, ref: { seller: "s1" } }),
      oferta("c", "b", 10, { freteItem: 8, fretePacote: 8, ref: { seller: "s2" } }),
    ];
    const [melhor] = otimizar(itens.slice(0, 2), ofertas, new Map([["c", modelo("C", 13)]]));
    expect(melhor.totalFrete).toBe(13);
  });

  it("sempre oferece até 3 opções distintas, mesmo com um item só", () => {
    const um = [itens[0]];
    const ofertas = [oferta("x", "a", 5), oferta("y", "a", 4), oferta("z", "a", 7), oferta("w", "a", 9)];
    const modelos = new Map([["x", modelo("X", 10)], ["y", modelo("Y", 15)], ["z", modelo("Z", 0)], ["w", modelo("W", 0)]]);
    const planos = otimizar(um, ofertas, modelos);
    expect(planos.map((p) => p.total)).toEqual([7, 9, 15]);
    expect(planos.map((p) => p.titulo)).toEqual(["Mais barato no total", "Tudo na W", "Tudo na X"]);
    expect(new Set(planos.map((p) => p.id)).size).toBe(3);
  });

  it("rotula de novo quando o frete confirmado muda a ordem", () => {
    const ofertas = [oferta("x", "a", 5), oferta("y", "a", 6)];
    const modelos = new Map([["x", modelo("X", 1)], ["y", modelo("Y", 1)]]);
    const planos = otimizar([itens[0]], ofertas, modelos);
    const confirmados = planos.map((p) => (p.lojas[0].lojaId === "x" ? { ...p, total: 50 } : p));
    const [primeiro] = rotularPlanos(confirmados);
    expect(primeiro).toMatchObject({ id: "mais-barato", titulo: "Mais barato no total" });
    expect(primeiro.lojas[0].lojaId).toBe("y");
  });

  it("tudo em uma loja: um carrinho por loja, com um frete só, do mais completo ao mais caro", () => {
    const ofertas = [
      oferta("x", "a", 20), oferta("x", "b", 3), oferta("x", "c", 5),
      oferta("y", "a", 10), oferta("y", "b", 2),
      oferta("z", "a", 9), oferta("z", "b", 4), oferta("z", "c", 6),
    ];
    const modelos = new Map([["x", modelo("X", 10)], ["y", modelo("Y", 0)], ["z", modelo("Z", 20, 15)]]);
    const planos = planosPorLoja(itens, ofertas, modelos);
    // Z: 19 com frete grátis (acima de 15); X: 28 + 10; Y não tem a cola
    expect(planos.map((p) => [p.lojas[0].lojaId, p.total, p.itensSemOferta.length])).toEqual([
      ["z", 19, 0],
      ["x", 38, 0],
      ["y", 12, 1],
    ]);
    expect(planos[0].titulo).toBe("Tudo na Z");
    expect(planos.every((p) => p.lojas.length === 1)).toBe(true);
  });
});
