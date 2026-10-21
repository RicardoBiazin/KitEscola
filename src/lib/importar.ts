import * as XLSX from "xlsx";
import type { ItemLista } from "./tipos";
import { criarItem, interpretarLinha, simplificar } from "./normalizar";

const COL_NOME = /^(item|itens|material|materiais|descricao|produto|nome|lista)/;
const COL_NOME_EXATA = /^(item|itens|material|materiais|descricao|produto|produtos|nome)$/;
const COL_QTD =/^(qtd|qtde|quant|quantidade|qt|unidades?)/;

/** Limites de uma importação: a planilha é lida só até aqui (planilha com milhares de linhas não pesa no servidor). */
export const LIMITE_LINHAS_ABA = 500;
export const LIMITE_ABAS = 5;

/**
 * Lê planilha (XLSX, XLS, ODS ou CSV) e devolve os itens.
 * Procura colunas "item/material/descrição" e "quantidade"; sem cabeçalho, usa a primeira
 * coluna de texto e a primeira numérica. Linhas de uma coluna só passam pelo interpretador
 * de texto livre ("2 cadernos").
 */
export function importarPlanilha(
  dados: ArrayBuffer | Uint8Array,
  nomeArquivo = "",
  limites: { linhas: number; abas: number } = { linhas: LIMITE_LINHAS_ABA, abas: LIMITE_ABAS },
): ItemLista[] {
  const csv = /\.(csv|txt)$/i.test(nomeArquivo);
  const buf = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  // sheetRows: o leitor para depois de N linhas (também limita o que é descomprimido de um XLSX).
  const wb = csv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string", sheetRows: limites.linhas })
    : XLSX.read(buf, { type: "array", sheetRows: limites.linhas });
  const itens: ItemLista[] = [];
  for (const nomeAba of wb.SheetNames.slice(0, limites.abas)) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], { header: 1, blankrows: false, defval: "" }).slice(0, limites.linhas);
    if (linhas.length === 0) continue;

    let colNome = -1;
    let colQtd = -1;
    let inicio = 0;
    // Cabeçalho em uma das 5 primeiras linhas: de preferência a que tem nome E quantidade;
    // só com a coluna de nome, a célula precisa ser exatamente a palavra ("Material", "Item").
    const topo = linhas.slice(0, 5).map((l) => l.map((c) => simplificar(String(c))));
    const comAmbas = topo.findIndex((cab) => cab.some((c) => COL_NOME.test(c)) && cab.some((c) => COL_QTD.test(c)));
    const soNome = topo.findIndex((cab) => cab.some((c) => COL_NOME_EXATA.test(c)));
    const linhaCab = comAmbas >= 0 ? comAmbas : soNome;
    if (linhaCab >= 0) {
      const cab = topo[linhaCab];
      colNome = cab.findIndex((c) => (comAmbas >= 0 ? COL_NOME : COL_NOME_EXATA).test(c));
      colQtd = cab.findIndex((c) => COL_QTD.test(c));
      inicio = linhaCab + 1;
    }
    if (colNome < 0) {
      const amostra = linhas.slice(0, 10);
      const larg = Math.max(...amostra.map((l) => l.length));
      for (let c = 0; c < larg; c++) {
        const valores = amostra.map((l) => l[c]).filter((v) => v !== "" && v !== undefined);
        if (colNome < 0 && valores.some((v) => typeof v === "string" && /[a-z]/i.test(v))) colNome = c;
        else if (colQtd < 0 && valores.length && valores.every((v) => typeof v === "number" || /^\d+$/.test(String(v).trim()))) colQtd = c;
      }
    }
    if (colNome < 0) continue;

    for (const linha of linhas.slice(inicio)) {
      const nome = String(linha[colNome] ?? "").trim();
      if (!nome) continue;
      const q = colQtd >= 0 ? Number(String(linha[colQtd]).replace(",", ".")) : NaN;
      if (Number.isFinite(q) && q > 0) {
        itens.push(criarItem(nome, q));
      } else {
        const item = interpretarLinha(nome);
        if (item) itens.push(item);
      }
    }
  }
  return itens;
}
