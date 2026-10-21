import dados from "./kits-por-serie.json";
import type { ItemLista } from "../tipos";
import { simplificar } from "../normalizar";

export type Serie = keyof typeof dados.series;

export const SERIES: { id: Serie; nome: string }[] = (Object.keys(dados.series) as Serie[]).map((id) => ({
  id,
  nome: dados.series[id].nome,
}));

export interface Sugestao {
  nome: string;
  quantidade: number;
  motivo: string;
  tipo: "esquecido" | "util";
}

/** Termo "lapis!de cor" = "lápis" que não seja seguido de "de cor". */
function contemTermo(textos: string[], termos: string[]): boolean {
  return termos.some((t) => {
    const [positivo, negativo] = t.split("!");
    const termo = simplificar(positivo);
    const exclusao = negativo ? `(?!\\s+${simplificar(negativo).replace(/\s+/g, "\\s+")})` : "";
    const re = new RegExp(`\\b${termo.replace(/\s+/g, "s?\\s+")}s?\\b${exclusao}`);
    return textos.some((x) => re.test(x));
  });
}

/**
 * Compara a lista com o kit típico da série ("Você pode ter esquecido") e com regras de
 * itens complementares ("Itens úteis"). Não sugere o que já está na lista.
 */
export function sugerir(itens: ItemLista[], serie?: Serie | ""): Sugestao[] {
  const textos = itens.map((i) => simplificar(i.nome));
  const sugestoes: Sugestao[] = [];
  const jaSugerido = new Set<string>();

  if (serie && dados.series[serie]) {
    for (const k of dados.series[serie].itens) {
      if (!contemTermo(textos, k.termos)) {
        sugestoes.push({
          nome: k.nome,
          quantidade: k.quantidade,
          motivo: `Comum em listas de ${dados.series[serie].nome}`,
          tipo: "esquecido",
        });
        jaSugerido.add(simplificar(k.nome));
      }
    }
  }

  for (const c of dados.complementares) {
    if (jaSugerido.has(simplificar(c.nome))) continue;
    if (contemTermo(textos, c.termos)) continue;
    const quando = (c as { quando?: string[] }).quando;
    if (quando && !contemTermo(textos, quando)) continue;
    sugestoes.push({ nome: c.nome, quantidade: c.quantidade, motivo: c.motivo, tipo: quando ? "esquecido" : "util" });
    jaSugerido.add(simplificar(c.nome));
  }
  return sugestoes;
}
