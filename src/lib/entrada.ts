// Validação do que chega do navegador (dado não confiável) e saneamento do que sai para ele.
// Este arquivo não importa nada de Node: o componente Resultados usa urlSegura no navegador.
import type { Frete, ItemLista, Oferta, StatusLoja } from "./tipos";

export const LIMITES = {
  itens: 60,
  ofertas: 4000,
  nomeItem: 120,
};

/** sku e seller vão para o corpo da simulação da VTEX: só caracteres seguros. */
export const REF_SEGURA = /^[\w-]{1,40}$/;

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** ref de uma oferta: textos curtos; sku e seller (quando preenchidos) só com REF_SEGURA. */
export function refValida(ref: unknown): ref is Record<string, string> {
  if (!objeto(ref)) return false;
  for (const [chave, valor] of Object.entries(ref)) {
    if (!texto(valor, 200)) return false;
    if ((chave === "sku" || chave === "seller") && valor !== "" && !REF_SEGURA.test(valor)) return false;
  }
  return true;
}

/** Itens da lista: id, nome e quantidade. Devolve null se algo estiver fora do formato. */
export function validarItens(v: unknown): ItemLista[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > LIMITES.itens) return null;
  const saida: ItemLista[] = [];
  for (const i of v) {
    if (!objeto(i) || !texto(i.id, 64) || !texto(i.nome, LIMITES.nomeItem) || !i.nome.trim() || !numero(i.quantidade)) return null;
    saida.push({ id: i.id, nome: i.nome.trim(), quantidade: Math.max(1, Math.min(999, Math.floor(i.quantidade))) });
  }
  return saida;
}

function oferta(o: unknown): o is Oferta {
  return (
    objeto(o) &&
    texto(o.lojaId, 40) &&
    texto(o.lojaNome, 80) &&
    texto(o.itemId, 64) &&
    texto(o.titulo, 300) &&
    texto(o.url, 2000) &&
    numero(o.preco) &&
    numero(o.unidadesPorAnuncio) &&
    numero(o.anunciosNecessarios) &&
    numero(o.custoItem) &&
    numero(o.relevancia) &&
    (o.imagem === undefined || texto(o.imagem, 2000)) &&
    (o.freteItem === undefined || numero(o.freteItem)) &&
    (o.fretePacote === undefined || numero(o.fretePacote)) &&
    (o.ref === undefined || refValida(o.ref))
  );
}

/** Ofertas da busca: cada elemento é conferido (um null antes dava erro 500 sem tratamento). */
export function validarOfertas(v: unknown): Oferta[] | null {
  if (!Array.isArray(v) || v.length > LIMITES.ofertas) return null;
  return v.every(oferta) ? v : null;
}

/** Fretes por loja (valor, tipo e entrega). Ausente vale como vazio. */
export function validarFretes(v: unknown): Record<string, Frete> | null {
  if (v === undefined) return {};
  if (!objeto(v)) return null;
  for (const f of Object.values(v)) {
    if (!objeto(f) || !numero(f.valor) || (f.tipo !== "real" && f.tipo !== "estimado") || typeof f.entrega !== "boolean") return null;
  }
  return v as unknown as Record<string, Frete>;
}

/** Só http(s) vira link. javascript:, data: e lixo viram null (o texto aparece sem link). */
export function urlSegura(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const { protocol } = new URL(u);
    return protocol === "https:" || protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const MENSAGEM_PUBLICA: Record<StatusLoja["estado"], string> = {
  ok: "Algumas buscas nesta loja falharam.",
  bloqueada: "A loja bloqueou a consulta automática. Tente mais tarde.",
  erro: "Não foi possível consultar esta loja agora.",
  desativada: "Loja desativada.",
};

/** Texto que vai para o navegador. O detalhe técnico fica só no log do servidor. */
export function mensagemPublicaDaLoja(estado: StatusLoja["estado"]): string {
  return MENSAGEM_PUBLICA[estado];
}

export const ERRO_PUBLICO = "Algo deu errado do nosso lado. Tente de novo.";

/**
 * Lê o corpo até `limite` bytes. Devolve null se passar do limite, sem armazenar o resto.
 * Sem Content-Length (corpo em partes) também vale: a conta é feita enquanto chega.
 */
export async function lerCorpoLimitado(req: Request, limite: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > limite) return null;
  const leitor = req.body?.getReader();
  if (!leitor) return new Uint8Array(new ArrayBuffer(0));
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const corpo = new Uint8Array(new ArrayBuffer(total));
  let pos = 0;
  for (const p of partes) {
    corpo.set(p, pos);
    pos += p.byteLength;
  }
  return corpo;
}
