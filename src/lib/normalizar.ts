import type { ItemLista } from "./tipos";

/** minúsculas, sem acento, só letras/números/espaço. */
export function simplificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\s*x\s*(\d)/g, "$1x$2")
    .replace(/[^a-z0-9x]+/g, " ")
    .trim();
}

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "com", "para", "p", "c", "e", "ou", "em", "a", "o", "as", "os",
  "tipo", "cor", "cores", "unidade", "unidades", "un", "und", "unid", "pct", "pacote", "cx", "caixa",
  "kit", "sugestao", "sugerida", "qualquer", "ref", "nº", "n", "no",
  // Quase nenhum título diz "escolar"; não pode ser palavra obrigatória.
  "escolar", "escolares",
]);

/** Reduz plural simples para casar "lapis/lapis", "cadernos/caderno", "canetas/caneta". */
export function radical(palavra: string): string {
  if (/^\d+$/.test(palavra)) return palavra;
  if (palavra.length > 4 && palavra.endsWith("oes")) return palavra.slice(0, -3) + "ao";
  if (palavra.length > 4 && palavra.endsWith("res")) return palavra.slice(0, -2);
  if (palavra.length > 3 && palavra.endsWith("s") && palavra !== "lapis") return palavra.slice(0, -1);
  return palavra;
}

export function tokens(texto: string): string[] {
  return simplificar(texto)
    .split(" ")
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .map(radical);
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, doze: 12, vinte: 20, cem: 100,
};

/**
 * Quantas unidades vêm no anúncio, pelo título.
 * "Caixa com 12 lápis", "Kit 4 cadernos", "c/ 24 cores" (lápis de cor conta como 1 caixa),
 * "Pacote 100 folhas" (folhas não são unidades do item pedido quando o item é folha avulsa).
 */
export function unidadesNoTitulo(titulo: string, itemNome = ""): number {
  const t = simplificar(titulo);
  const item = simplificar(itemNome);
  // Itens que naturalmente vêm em caixa com N cores/folhas: a caixa é a unidade.
  if (/\b(lapis de cor|giz de cera|canetinha|hidrocor|massinha|tinta guache|cola colorida|papel)\b/.test(item)) {
    const kit = t.match(/\b(?:kit|combo|leve)\s*(\d{1,2})\b/);
    return kit ? Number(kit[1]) : 1;
  }
  const padroes = [
    /\b(?:kit|combo|leve|pack|pacote|pct|caixa|cx|blister|cartela|conjunto)\s*(?:com|c)?\s*(\d{1,3})\b(?!\s*(?:materia|folha|fls|cores|cor|ml|g|gr|kg|cm|mm|m|l)\b)/,
    /\b(?:com|c)\s*(\d{1,3})\s*(?:un|und|unid|unidade|unidades|pecas|pcs)\b/,
    /\b(\d{1,3})\s*(?:un|und|unid|unidades|pecas|pcs)\b/,
    /\b(\d{1,3})\s*x\s*(?=\D)(?!\d)/,
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 500) return n;
    }
  }
  return 1;
}

function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Converte uma linha livre em item: "2 cadernos 10 matérias", "lápis preto - 3", "3x cola",
 * "borracha (2)", "Tesoura sem ponta: 1 unidade".
 */
export function interpretarLinha(linha: string): ItemLista | null {
  let texto = linha.replace(/^[\s\-•*·–—]+|^\d+[.)]\s+/g, "").trim();
  if (!texto || texto.length < 2) return null;
  let quantidade = 1;
  const inicio = texto.match(/^(\d{1,3})\s*(?:x|un\.?|und\.?|unid\.?|unidades?|pcs?)?\s+(.+)$/i);
  const fim = texto.match(/^(.+?)\s*(?:[-–:=]|\(|\bqtd\.?|\bquantidade)\s*(\d{1,3})\s*(?:un\.?|und\.?|unidades?|pcs?|\))?\s*$/i);
  const extenso = texto.match(/^(um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|doze)\s+(.+)$/i);
  if (inicio) {
    quantidade = Number(inicio[1]);
    texto = inicio[2];
  } else if (fim) {
    quantidade = Number(fim[2]);
    texto = fim[1];
  } else if (extenso) {
    quantidade = NUMEROS_POR_EXTENSO[simplificar(extenso[1])] ?? 1;
    texto = extenso[2];
  }
  texto = texto.replace(/[\s.;,]+$/, "").trim();
  if (!texto) return null;
  return { id: novoId(), nome: texto, quantidade: Math.max(1, Math.min(quantidade, 999)) };
}

export function interpretarTexto(texto: string): ItemLista[] {
  return texto
    .split(/\r?\n|;/)
    .map(interpretarLinha)
    .filter((i): i is ItemLista => i !== null);
}

/** Cria um item com id (usado ao importar planilha e ao adicionar sugestão). */
export function criarItem(nome: string, quantidade = 1): ItemLista {
  return { id: novoId(), nome: nome.trim(), quantidade: Math.max(1, Math.round(quantidade) || 1) };
}

/** Termo de busca enviado às lojas: tira quantidade e ruído, mantém o essencial. */
export function termoDeBusca(nome: string): string {
  return nome
    .replace(/\(.*?\)/g, " ")
    // "marca Tilibra", "obs: ..." — mas não "marca-texto"
    .replace(/(^|\s)(sugest[aã]o|marca|ref\.?|obs\.?)(\s|:).*$/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
