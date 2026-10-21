import { describe, expect, it } from "vitest";
import { interpretarLinha, interpretarTexto, unidadesNoTitulo, termoDeBusca } from "@/lib/normalizar";

describe("interpretarLinha", () => {
  it.each([
    ["2 cadernos brochura 96 folhas", "cadernos brochura 96 folhas", 2],
    ["lápis preto - 4", "lápis preto", 4],
    ["3x cola branca", "cola branca", 3],
    ["cola branca 90g (2)", "cola branca 90g", 2],
    ["Tesoura sem ponta: 1", "Tesoura sem ponta", 1],
    ["duas borrachas", "borrachas", 2],
    ["- Caderno 10 matérias", "Caderno 10 matérias", 1],
    ["1) Régua 30 cm", "Régua 30 cm", 1],
  ])("%s", (linha, nome, qtd) => {
    const i = interpretarLinha(linha)!;
    expect(i.nome).toBe(nome);
    expect(i.quantidade).toBe(qtd);
  });

  it("não confunde especificação com quantidade", () => {
    expect(interpretarLinha("Caderno 10 matérias")!.quantidade).toBe(1);
    expect(interpretarLinha("Régua 30 cm")!.quantidade).toBe(1);
  });

  it("ignora linhas vazias", () => {
    expect(interpretarTexto("\n\n lápis \n\n; borracha")).toHaveLength(2);
  });
});

describe("unidadesNoTitulo", () => {
  it.each([
    ["Kit 04 Cadernos Preto 10 Matérias CD Zip 160 Folhas", "caderno", 4],
    ["Caderno Universitário Capa Dura, 10 x 160 Folhas", "caderno", 1],
    ["Lápis Preto Nº2 Caixa com 12 unidades", "lápis preto", 12],
    ["Lápis de Cor 24 Cores Faber-Castell", "lápis de cor", 1],
    ["Kit 2 Lápis de Cor 12 cores", "lápis de cor", 2],
    ["Borracha Branca Mercur c/ 20 un", "borracha", 20],
    ["Cola Branca 90g", "cola branca", 1],
  ])("%s", (titulo, item, esperado) => {
    expect(unidadesNoTitulo(titulo, item)).toBe(esperado);
  });
});

describe("termoDeBusca", () => {
  it("remove observações", () => {
    expect(termoDeBusca("Caderno 10 matérias (capa dura) marca Tilibra")).toBe("Caderno 10 matérias");
  });
});

describe("termoDeBusca com hífen", () => {
  it("mantém marca-texto", () => {
    expect(termoDeBusca("Marca-texto amarelo")).toBe("Marca-texto amarelo");
    expect(termoDeBusca("Cola branca marca: Tenaz")).toBe("Cola branca");
  });
});
