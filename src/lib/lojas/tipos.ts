import type { Frete, ItemLista, Oferta } from "../tipos";
export type { Oferta };
import { unidadesNoTitulo } from "../normalizar";
import { relevancia } from "../relevancia";

/** Anúncio cru, como o adapter extraiu da loja. */
export interface Anuncio {
  titulo: string;
  preco: number;
  url: string;
  imagem?: string;
  freteGratis?: boolean;
  ref?: Record<string, string>;
}

export interface ItemCarrinho {
  oferta: Oferta;
  quantidade: number;
}

export interface LojaAdapter {
  id: string;
  nome: string;
  /** "http" = requisição direta; "navegador" = precisa do Edge/Chrome (Playwright). */
  via: "http" | "navegador";
  buscar(termo: string): Promise<Anuncio[]>;
  /** Frete do carrinho inteiro desta loja para o CEP. */
  frete(carrinho: ItemCarrinho[], cep: string): Promise<Frete>;
  /**
   * Opcional: confere, para o CEP, quais ofertas a loja entrega, com preço regional e
   * frete por item. Ofertas que não entregam (nem retirada) são removidas.
   */
  verificarEntrega?(ofertas: Oferta[], cep: string): Promise<Oferta[]>;
}

/** Regra de frete estimado para lojas que não expõem cálculo sem login. */
export interface RegraFrete {
  base: number;
  gratisAcima?: number;
  prazo?: string;
}

export function freteEstimado(carrinho: ItemCarrinho[], regra: RegraFrete, obs?: string): Frete {
  const subtotal = carrinho.reduce((s, c) => s + c.oferta.custoItem, 0);
  const todosGratis = carrinho.length > 0 && carrinho.every((c) => c.oferta.freteGratis);
  const gratis = todosGratis || (regra.gratisAcima !== undefined && subtotal >= regra.gratisAcima);
  return {
    valor: gratis ? 0 : regra.base,
    tipo: "estimado",
    prazo: regra.prazo,
    entrega: true,
    obs: obs ?? (regra.gratisAcima ? `Grátis acima de R$ ${regra.gratisAcima.toFixed(2).replace(".", ",")} (regra estimada)` : undefined),
  };
}

/** Converte anúncios em ofertas para o item: relevância, unidades e custo total. */
export function paraOfertas(loja: LojaAdapter, item: ItemLista, anuncios: Anuncio[]): Oferta[] {
  return anuncios.map((a) => {
    const unidades = unidadesNoTitulo(a.titulo, item.nome);
    const anunciosNecessarios = Math.max(1, Math.ceil(item.quantidade / unidades));
    return {
      lojaId: loja.id,
      lojaNome: loja.nome,
      itemId: item.id,
      titulo: a.titulo,
      preco: a.preco,
      unidadesPorAnuncio: unidades,
      anunciosNecessarios,
      custoItem: Math.round(a.preco * anunciosNecessarios * 100) / 100,
      url: a.url,
      imagem: a.imagem,
      relevancia: relevancia(item.nome, a.titulo),
      freteGratis: a.freteGratis,
      ref: a.ref,
    };
  });
}
