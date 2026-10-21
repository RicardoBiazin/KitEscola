import pLimit from "p-limit";
import type { EventoBusca, Frete, ItemLista, Oferta, StatusLoja } from "./tipos";
import type { LojaAdapter } from "./lojas/tipos";
import { paraOfertas } from "./lojas/tipos";
import { BloqueioError } from "./http";
import { termoDeBusca } from "./normalizar";
import { RELEVANCIA_MINIMA } from "./relevancia";

const OFERTAS_POR_ITEM_LOJA = 4;

function mensagemErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 160);
}

/** Melhores ofertas relevantes, da mais barata para a mais cara. */
export function filtrarOfertas(ofertas: Oferta[]): Oferta[] {
  return ofertas
    .filter((o) => o.relevancia >= RELEVANCIA_MINIMA)
    .sort((a, b) => a.custoItem - b.custoItem || b.relevancia - a.relevancia)
    .slice(0, OFERTAS_POR_ITEM_LOJA);
}

/** Menor oferta com entrega de cada item nesta loja (o "carrinho" usado para simular frete). */
export function carrinhoDaLoja(ofertasDaLoja: Map<string, Oferta[]>): Oferta[] {
  return [...ofertasDaLoja.values()].map((l) => l.find((o) => !o.soRetirada) ?? l[0]).filter(Boolean);
}

async function buscarNaLoja(
  loja: LojaAdapter,
  itens: ItemLista[],
  cep: string,
  emitir: (e: EventoBusca) => void,
): Promise<void> {
  const porItem = new Map<string, Oferta[]>();
  let falhas = 0;
  let bloqueio: string | null = null;
  let ultimoErro = "";

  // Poucas buscas por vez em cada loja: se ela bloquear, as seguintes nem saem.
  const limite = pLimit(loja.via === "navegador" ? 3 : 4);
  await Promise.all(
    itens.map((item) => limite(async () => {
      if (bloqueio) return;
      try {
        const termo = termoDeBusca(item.nome);
        const anuncios = await loja.buscar(termo);
        // Mais de uma unidade: procura também kits/pacotes, que costumam sair mais baratos por unidade.
        if (item.quantidade > 1 && !/^kit\b/i.test(termo)) {
          const kits = await loja.buscar(`kit ${termo}`).catch(() => []);
          const vistos = new Set(anuncios.map((a) => a.url));
          anuncios.push(...kits.filter((a) => !vistos.has(a.url)));
        }
        const ofertas = filtrarOfertas(paraOfertas(loja, item, anuncios));
        if (ofertas.length) porItem.set(item.id, ofertas);
      } catch (e) {
        falhas++;
        ultimoErro = mensagemErro(e);
        if (e instanceof BloqueioError) bloqueio = ultimoErro;
      }
    })),
  );

  // Lojas que sabem conferir a entrega por item (VTEX): tira o que não chega no CEP.
  if (loja.verificarEntrega && porItem.size > 0) {
    try {
      const verificadas = await loja.verificarEntrega([...porItem.values()].flat(), cep);
      porItem.clear();
      for (const o of verificadas) porItem.set(o.itemId, [...(porItem.get(o.itemId) ?? []), o]);
      for (const [id, l] of porItem) porItem.set(id, filtrarOfertas(l));
    } catch (e) {
      ultimoErro = `entrega não verificada: ${mensagemErro(e)}`;
    }
  }
  for (const [itemId, ofertas] of porItem) emitir({ tipo: "ofertas", lojaId: loja.id, itemId, ofertas });

  const total = [...porItem.values()].reduce((s, l) => s + l.length, 0);
  let status: StatusLoja;
  if (bloqueio && total === 0) {
    status = { lojaId: loja.id, lojaNome: loja.nome, estado: "bloqueada", mensagem: bloqueio, ofertas: 0 };
  } else if (falhas === itens.length) {
    status = { lojaId: loja.id, lojaNome: loja.nome, estado: "erro", mensagem: ultimoErro, ofertas: 0 };
  } else {
    status = {
      lojaId: loja.id,
      lojaNome: loja.nome,
      estado: "ok",
      ofertas: total,
      mensagem: falhas ? `${falhas} busca(s) falharam: ${ultimoErro}` : undefined,
    };
  }

  if (total > 0) {
    const quantidades = new Map(itens.map((i) => [i.id, i]));
    const carrinho = carrinhoDaLoja(porItem).filter((o) => quantidades.has(o.itemId));
    let frete: Frete;
    try {
      frete = await loja.frete(carrinho.map((oferta) => ({ oferta, quantidade: oferta.anunciosNecessarios })), cep);
    } catch (e) {
      // O detalhe técnico vai só para o log do servidor (o navegador recebe texto genérico).
      console.warn(`frete não calculado (${loja.id}): ${mensagemErro(e)}`);
      frete = { valor: 0, tipo: "estimado", entrega: true, obs: "Frete não calculado nesta loja." };
    }
    emitir({ tipo: "frete", lojaId: loja.id, frete });
  }
  emitir({ tipo: "loja", status });
}

/** Busca todos os itens em todas as lojas em paralelo, emitindo eventos conforme chegam. */
export async function buscarTudo(
  lojas: LojaAdapter[],
  itens: ItemLista[],
  cep: string,
  emitir: (e: EventoBusca) => void,
): Promise<void> {
  emitir({ tipo: "inicio", lojas: lojas.map((l) => ({ id: l.id, nome: l.nome })), itens: itens.length });
  await Promise.all(lojas.map((l) => buscarNaLoja(l, itens, cep, emitir)));
  emitir({ tipo: "fim" });
}
