import { simplificar, tokens } from "./normalizar";

// Palavras que indicam outro produto quando não estão no item pedido
// (ex.: busca "caderno" não deve aceitar "capa para caderno").
const DESVIOS = [
  "capa para", "refil", "suporte para", "adesivo para", "organizador", "miniatura", "chaveiro",
  "usado", "seminovo", "capinha", "estampa para", "molde",
  // "cola bastão" escolar não é bastão de cola quente para pistola (grupo: se o item
  // pede qualquer uma destas palavras, as outras também valem)
  ["quente", "pistola", "silicone"],
  // tesoura, lápis, pincel etc. de outros usos
  ["unha", "cuticula", "manicure", "cabelo", "barba", "nariz", "sobrancelha", "pelos", "costura", "cozinha", "poda", "jardinagem", "maquiagem", "labial"],
];

// Como cada unidade aparece nos títulos. "10x1" e "10 x 160" são cadernos de 10 matérias.
const SINONIMOS_UNIDADE: Record<string, string> = {
  materia: "materias?\\b|x\\s*\\d|x\\b",
  cor: "cores?\\b",
  core: "cores?\\b",
  folha: "folhas?\\b|fls?\\b|f\\b",
  fl: "folhas?\\b|fls?\\b|f\\b",
  g: "g\\b|gr\\b|gramas\\b",
  gr: "g\\b|gr\\b|gramas\\b",
  grama: "g\\b|gr\\b|gramas\\b",
  ml: "ml\\b",
  cm: "cm\\b",
  mm: "mm\\b",
  peca: "pecas?\\b|pcs?\\b",
};

/**
 * Pontua de 0 a 1 se o título do anúncio corresponde ao item da lista.
 * - a primeira palavra do item (o "substantivo": caderno, lápis, cola...) é obrigatória;
 * - números do item (10 matérias, 24 cores, 90g) precisam aparecer;
 * - o resto das palavras soma pela fração encontrada.
 */
export function relevancia(itemNome: string, titulo: string): number {
  const item = tokens(itemNome);
  if (item.length === 0) return 0;
  const tituloTokens = new Set(tokens(titulo));
  const tituloSimples = simplificar(titulo);
  const itemSimples = simplificar(itemNome);

  const principal = item[0];
  if (!tituloTokens.has(principal)) return 0;

  for (const d of DESVIOS) {
    const grupo = typeof d === "string" ? [d] : d;
    if (grupo.some((p) => tituloSimples.includes(p)) && !grupo.some((p) => itemSimples.includes(p))) return 0.1;
  }

  // Só números com unidade são especificação obrigatória ("lápis nº 2" aceita "lápis HB"),
  // e no título o número tem de vir com a mesma unidade ("Camisa 10" não é "10 matérias").
  const specs = [...itemSimples.matchAll(/\b(\d+)\s*(materias?|cores?|folhas?|fls|g|gr|gramas|ml|cm|mm|pecas?)\b/g)];
  const numeros = specs.map((m) => m[1]);
  for (const [, n, unidade] of specs) {
    if (!new RegExp(`\\b${n}\\s*(?:${SINONIMOS_UNIDADE[unidade.replace(/s$/, "")] ?? unidade})`).test(tituloSimples)) return 0.2;
  }

  // Números soltos (nº 2) não entram na conta: pesam só as palavras.
  const palavras = item.filter((t) => !/^\d+$/.test(t) || numeros.includes(t));
  const encontrados = palavras.filter((t) => tituloTokens.has(t) || (/^\d+$/.test(t) && numeros.includes(t))).length;
  return Math.round((encontrados / palavras.length) * 100) / 100;
}

export const RELEVANCIA_MINIMA = 0.6;
