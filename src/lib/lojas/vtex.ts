// Adapter genérico para lojas na plataforma VTEX (Carrefour, Americanas, Atacadão...).
// Busca: API "intelligent-search" ou catálogo legado. Frete: simulação de checkout por CEP (frete real).
import type { Frete, Oferta } from "../tipos";
import { baixarJson, BloqueioError } from "../http";
import type { Anuncio, ItemCarrinho, LojaAdapter } from "./tipos";

export interface ConfigVtex {
  id: string;
  nome: string;
  host: string;
  busca: "intelligent" | "catalogo";
  /** Canal de vendas (sales channel), quando a loja exige. */
  sc?: string;
}

interface OfertaComercial {
  Price: number;
  AvailableQuantity: number;
}
interface ProdutoVtex {
  productName: string;
  link: string;
  linkText?: string;
  items: {
    itemId: string;
    images?: { imageUrl: string }[];
    sellers: { sellerId: string; commertialOffer: OfertaComercial }[];
  }[];
}

export function anunciosVtex(base: string, produtos: ProdutoVtex[]): Anuncio[] {
  const lista: Anuncio[] = [];
  for (const p of produtos) {
    // Primeiro SKU com algum vendedor em estoque; entre vendedores, o mais barato.
    for (const sku of p.items ?? []) {
      const vendedores = (sku.sellers ?? []).filter(
        (s) => s.commertialOffer?.AvailableQuantity > 0 && s.commertialOffer.Price > 0,
      );
      if (vendedores.length === 0) continue;
      const v = vendedores.reduce((a, b) => (b.commertialOffer.Price < a.commertialOffer.Price ? b : a));
      const url = p.link?.startsWith("http") ? p.link : `${base}${p.link ?? `/${p.linkText}/p`}`;
      lista.push({
        titulo: p.productName,
        preco: v.commertialOffer.Price,
        url,
        imagem: sku.images?.[0]?.imageUrl,
        ref: { sku: sku.itemId, seller: v.sellerId },
      });
      break;
    }
  }
  return lista;
}

interface Simulacao {
  items: { id: string; availability: string; requestIndex: number; sellingPrice?: number; price?: number }[];
  logisticsInfo: {
    itemIndex: number;
    slas: { id: string; name: string; price: number; shippingEstimate: string; deliveryChannel?: string }[];
  }[];
}

/** Frete total = soma, por item, da opção de entrega mais barata. */
export function freteDaSimulacao(sim: Simulacao): Frete {
  const logistica = sim.logisticsInfo ?? [];
  if (logistica.length === 0) return { valor: 0, tipo: "real", entrega: false, obs: "Não entrega neste CEP" };
  let total = 0;
  let prazoMax = 0;
  let semEntrega = 0;
  let comRetirada = 0;
  for (const l of logistica) {
    const entregas = l.slas.filter((s) => (s.deliveryChannel ?? "delivery") === "delivery");
    if (l.slas.some((s) => s.deliveryChannel === "pickup-in-point")) comRetirada++;
    if (entregas.length === 0) {
      semEntrega++;
      continue;
    }
    const melhor = entregas.reduce((a, b) => (b.price < a.price ? b : a));
    total += melhor.price;
    prazoMax = Math.max(prazoMax, parseInt(melhor.shippingEstimate, 10) || 0);
  }
  if (semEntrega > 0 && comRetirada === logistica.length) {
    return { valor: 0, tipo: "real", entrega: false, retirada: true, obs: "Não entrega neste CEP; retirada grátis em loja da região" };
  }
  if (semEntrega === logistica.length) return { valor: 0, tipo: "real", entrega: false, obs: "Não entrega neste CEP" };
  return {
    valor: Math.round(total) / 100,
    tipo: "real",
    entrega: true,
    prazo: prazoMax ? `${prazoMax} dias úteis` : undefined,
    obs: semEntrega ? `${semEntrega} item(ns) sem entrega neste CEP` : undefined,
  };
}

/**
 * Aplica o resultado de uma simulação com todas as ofertas: remove o que não é entregue
 * (mantém como "só retirada" quando há retirada), usa o preço regional e o frete por item.
 */
export function aplicarSimulacao(ofertas: Oferta[], sim: Simulacao): Oferta[] {
  const saida: Oferta[] = [];
  // Frete do pacote de cada vendedor = soma das partes rateadas entre os itens dele.
  const pacote = new Map<string, number>();
  ofertas.forEach((o, indice) => {
    const pos = sim.items?.findIndex((i) => i.requestIndex === indice) ?? -1;
    const l = sim.logisticsInfo?.find((x) => x.itemIndex === pos);
    const entregas = (l?.slas ?? []).filter((s) => (s.deliveryChannel ?? "delivery") === "delivery");
    if (pos < 0 || entregas.length === 0) return;
    const vendedor = o.ref?.seller ?? "1";
    pacote.set(vendedor, (pacote.get(vendedor) ?? 0) + Math.min(...entregas.map((s) => s.price)) / 100);
  });
  ofertas.forEach((o, indice) => {
    const item = sim.items?.find((i) => i.requestIndex === indice);
    const logistica = sim.logisticsInfo?.find((l) => l.itemIndex === (item ? sim.items.indexOf(item) : -1));
    if (!item || !logistica || item.availability !== "available") return;
    const entregas = logistica.slas.filter((s) => (s.deliveryChannel ?? "delivery") === "delivery");
    const retirada = logistica.slas.some((s) => s.deliveryChannel === "pickup-in-point");
    if (entregas.length === 0 && !retirada) return;
    // Preço unitário para o CEP (pode diferir do da busca em lojas com preço regional).
    const precoRegional = (item.sellingPrice ?? item.price ?? 0) / 100;
    const preco = precoRegional > 0 ? Math.round(precoRegional * 100) / 100 : o.preco;
    const freteItem = entregas.length ? Math.min(...entregas.map((s) => s.price)) / 100 : 0;
    saida.push({
      ...o,
      preco,
      custoItem: Math.round(preco * o.anunciosNecessarios * 100) / 100,
      freteItem,
      fretePacote: entregas.length ? Math.round((pacote.get(o.ref?.seller ?? "1") ?? freteItem) * 100) / 100 : undefined,
      soRetirada: entregas.length === 0 ? true : undefined,
    });
  });
  return saida;
}

export function criarVtex(cfg: ConfigVtex): LojaAdapter {
  const base = `https://${cfg.host}`;
  return {
    id: cfg.id,
    nome: cfg.nome,
    via: "http",
    async buscar(termo) {
      const q = encodeURIComponent(termo);
      const catalogo = async () =>
        anunciosVtex(base, await baixarJson<ProdutoVtex[]>(`${base}/api/catalog_system/pub/products/search?ft=${q}&_from=0&_to=23`));
      if (cfg.busca === "catalogo") return catalogo();
      // Busca inteligente; se a loja bloquear (403) ou devolver só um redirecionamento
      // (ex.: "caderno" -> página de promoção, sem produtos), tenta o catálogo, que é outra rota.
      try {
        const j = await baixarJson<{ products: ProdutoVtex[]; redirect?: string }>(
          `${base}/api/io/_v/api/intelligent-search/product_search?query=${q}&count=24&locale=pt-BR&hideUnavailableItems=true`,
        );
        const anuncios = anunciosVtex(base, j.products ?? []);
        if (anuncios.length > 0 || !j.redirect) return anuncios;
      } catch (e) {
        if (!(e instanceof BloqueioError)) throw e;
      }
      return catalogo();
    },
    async verificarEntrega(ofertas, cep) {
      const comSku = ofertas.filter((o) => o.ref?.sku);
      if (comSku.length === 0) return ofertas;
      const sc = cfg.sc ? `?sc=${cfg.sc}` : "";
      const sim = await baixarJson<Simulacao>(`${base}/api/checkout/pub/orderForms/simulation${sc}`, {
        metodo: "POST",
        corpo: {
          items: comSku.map((o) => ({ id: o.ref!.sku, quantity: o.anunciosNecessarios, seller: o.ref!.seller ?? "1" })),
          postalCode: cep.replace(/\D/g, ""),
          country: "BRA",
        },
      });
      return aplicarSimulacao(comSku, sim);
    },
    async frete(carrinho: ItemCarrinho[], cep: string) {
      const items = carrinho
        .filter((c) => c.oferta.ref?.sku)
        .map((c) => ({ id: c.oferta.ref!.sku, quantity: c.oferta.anunciosNecessarios, seller: c.oferta.ref!.seller ?? "1" }));
      if (items.length === 0) return { valor: 0, tipo: "real", entrega: false } as Frete;
      const sc = cfg.sc ? `?sc=${cfg.sc}` : "";
      const sim = await baixarJson<Simulacao>(`${base}/api/checkout/pub/orderForms/simulation${sc}`, {
        metodo: "POST",
        corpo: { items, postalCode: cep.replace(/\D/g, ""), country: "BRA" },
      });
      return freteDaSimulacao(sim);
    },
  };
}
