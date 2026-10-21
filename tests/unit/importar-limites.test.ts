import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { importarPlanilha, LIMITE_ABAS, LIMITE_LINHAS_ABA } from "@/lib/importar";

function planilha(abas: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

const cabecalho = ["Material", "Quantidade"];
const linhas = (n: number) => Array.from({ length: n }, (_, i) => [`Caderno ${i + 1}`, 1]);

describe("limites da importação", () => {
  it("planilha com muitas linhas é lida só até o limite de linhas", () => {
    const itens = importarPlanilha(planilha({ Lista: [cabecalho, ...linhas(2000)] }), "lista.xlsx", { linhas: 30, abas: LIMITE_ABAS });
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.length).toBeLessThanOrEqual(30);
  });

  it("limite padrão de linhas por aba é respeitado", () => {
    const itens = importarPlanilha(planilha({ Lista: [cabecalho, ...linhas(LIMITE_LINHAS_ABA * 2)] }), "lista.xlsx");
    expect(itens.length).toBeLessThanOrEqual(LIMITE_LINHAS_ABA);
    expect(itens.length).toBeGreaterThan(100);
  });

  it("lê no máximo o número de abas permitido", () => {
    const abas: Record<string, unknown[][]> = {};
    for (let i = 1; i <= LIMITE_ABAS + 3; i++) abas[`Aba${i}`] = [cabecalho, [`Item da aba ${i}`, 1]];
    const itens = importarPlanilha(planilha(abas), "lista.xlsx");
    expect(itens).toHaveLength(LIMITE_ABAS);
    expect(itens.map((i) => i.nome)).not.toContain(`Item da aba ${LIMITE_ABAS + 1}`);
  });

  it("dentro do limite, a leitura continua igual", () => {
    const itens = importarPlanilha(planilha({ Lista: [cabecalho, ["Lápis preto", 3], ["Borracha", 2]] }), "lista.xlsx");
    expect(itens.map((i) => [i.nome, i.quantidade])).toEqual([
      ["Lápis preto", 3],
      ["Borracha", 2],
    ]);
  });
});
