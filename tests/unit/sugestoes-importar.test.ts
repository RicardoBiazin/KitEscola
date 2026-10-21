import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sugerir } from "@/lib/sugestoes/sugerir";
import { importarPlanilha } from "@/lib/importar";
import { criarItem } from "@/lib/normalizar";

describe("sugerir", () => {
  it("aponta o que falta do kit da série", () => {
    const itens = [criarItem("Lápis de cor 24 cores"), criarItem("Caderno brochura", 4), criarItem("Cola branca")];
    const nomes = sugerir(itens, "fundamental1").map((s) => s.nome);
    expect(nomes).toContain("Lápis preto"); // lápis de cor não conta como lápis preto
    expect(nomes).toContain("Borracha");
    expect(nomes).not.toContain("Lápis de cor 24 cores");
    expect(nomes).not.toContain("Cola branca");
    expect(nomes).toContain("Cola bastão"); // cola branca não cobre cola bastão
  });

  it("sugere complementares conforme a lista", () => {
    const nomes = sugerir([criarItem("lapiseira 0,7"), criarItem("caderno 10 matérias")]).map((x) => x.nome);
    expect(nomes).toContain("Grafite 0,7 mm");
    expect(nomes).toContain("Plástico para encapar");
    expect(nomes).toContain("Etiquetas com nome");
  });

  it("não sugere o que já está na lista", () => {
    const nomes = sugerir([criarItem("Etiquetas escolares"), criarItem("Mochila")]).map((s) => s.nome);
    expect(nomes).not.toContain("Etiquetas com nome");
    expect(nomes).not.toContain("Mochila escolar");
  });
});

function planilha(linhas: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Lista");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("importarPlanilha", () => {
  it("lê colunas com cabeçalho", () => {
    const itens = importarPlanilha(
      planilha([["Lista 5º ano"], ["Quantidade", "Material"], [2, "Caderno 10 matérias"], ["4", "Lápis preto"]]),
      "l.xlsx",
    );
    expect(itens.map((i) => [i.nome, i.quantidade])).toEqual([["Caderno 10 matérias", 2], ["Lápis preto", 4]]);
  });

  it("sem cabeçalho, usa texto e número", () => {
    const itens = importarPlanilha(planilha([["Borracha", 2], ["Tesoura sem ponta", 1]]), "l.xlsx");
    expect(itens.map((i) => [i.nome, i.quantidade])).toEqual([["Borracha", 2], ["Tesoura sem ponta", 1]]);
  });

  it("CSV de uma coluna com quantidade no texto", () => {
    const csv = new TextEncoder().encode("item\n2 cadernos brochura\nlápis de cor 24 cores - 1\n");
    const itens = importarPlanilha(csv, "lista.csv");
    expect(itens.map((i) => [i.nome, i.quantidade])).toEqual([["cadernos brochura", 2], ["lápis de cor 24 cores", 1]]);
  });
});
