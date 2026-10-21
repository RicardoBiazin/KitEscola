// Tipos compartilhados entre servidor e interface.

export interface ItemLista {
  id: string;
  nome: string;
  quantidade: number;
}

/** Tipo de frete: "real" veio da própria loja para o CEP; "estimado" é regra/tabela. */
export type TipoFrete = "real" | "estimado";

export interface Oferta {
  lojaId: string;
  lojaNome: string;
  itemId: string;
  titulo: string;
  /** Preço do anúncio (um pacote/unidade como vendido). */
  preco: number;
  /** Unidades contidas no anúncio (ex.: caixa com 12 lápis = 12). */
  unidadesPorAnuncio: number;
  /** Anúncios necessários para cobrir a quantidade pedida. */
  anunciosNecessarios: number;
  /** preco * anunciosNecessarios. */
  custoItem: number;
  url: string;
  imagem?: string;
  /** 0..1, quão bem o título corresponde ao item pedido. */
  relevancia: number;
  /** A loja informou frete grátis para este anúncio. */
  freteGratis?: boolean;
  /** Parte do frete real que cabe a este anúncio (lojas com frete por item, ex.: marketplaces VTEX). */
  freteItem?: number;
  /**
   * Frete do pacote do vendedor deste anúncio (cobrado uma vez por vendedor, com 1 ou
   * vários itens). É o que o otimizador usa; freteItem é só o rateio.
   */
  fretePacote?: number;
  /** Não entrega no CEP; só retirada em loja. */
  soRetirada?: boolean;
  /** Dados que o adapter precisa para simular frete (sku, seller...). */
  ref?: Record<string, string>;
}

export interface Frete {
  valor: number;
  tipo: TipoFrete;
  prazo?: string;
  /** false quando a loja não entrega no CEP. */
  entrega: boolean;
  /** Sem entrega, mas dá para retirar grátis numa loja física da região. */
  retirada?: boolean;
  obs?: string;
}

export interface StatusLoja {
  lojaId: string;
  lojaNome: string;
  estado: "ok" | "bloqueada" | "erro" | "desativada";
  mensagem?: string;
  ofertas: number;
}

/** Evento enviado pelo /api/buscar (NDJSON). */
export type EventoBusca =
  | { tipo: "inicio"; lojas: { id: string; nome: string }[]; itens: number }
  | { tipo: "ofertas"; lojaId: string; itemId: string; ofertas: Oferta[] }
  | { tipo: "loja"; status: StatusLoja }
  | { tipo: "frete"; lojaId: string; frete: Frete }
  | { tipo: "fim" }
  /** Libera o /api/otimizar para esta busca (online, com Turnstile). */
  | { tipo: "passe"; passe: string };

export interface Plano {
  /** "mais-barato" para a primeira opção; "opcao-2", "opcao-3" para as demais. */
  id: string;
  titulo: string;
  lojas: {
    lojaId: string;
    lojaNome: string;
    itens: Oferta[];
    subtotal: number;
    frete: Frete;
  }[];
  itensSemOferta: string[];
  totalProdutos: number;
  totalFrete: number;
  total: number;
}
