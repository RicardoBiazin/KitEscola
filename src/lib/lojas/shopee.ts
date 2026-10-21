// Shopee pela API oficial de afiliados (GraphQL, productOfferV2).
// A busca interna do site exige assinatura anti-robô do navegador (403), por isso a API de
// afiliados é o caminho: devolve preço, foto, loja e link de afiliado. Não calcula frete por
// CEP, então o frete é estimado — um por vendedor (cada loja da Shopee envia separado).
// Só liga com SHOPEE_APP_ID e SHOPEE_SECRET configurados.
import { createHash } from "node:crypto";
import type { Frete } from "../tipos";
import { BloqueioError } from "../http";
import type { Anuncio, ItemCarrinho, LojaAdapter, RegraFrete } from "./tipos";

const API = "https://open-api.affiliate.shopee.com.br/graphql";
const POR_BUSCA = 20;

export function credenciaisShopee(): { appId: string; segredo: string } | null {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const segredo = process.env.SHOPEE_SECRET?.trim();
  return appId && segredo ? { appId, segredo } : null;
}

/** Cabeçalho de autenticação: SHA256(AppId + Timestamp + corpo + Secret), em hexadecimal. */
export function autorizacaoShopee(appId: string, segredo: string, corpo: string, timestamp: number): string {
  const assinatura = createHash("sha256").update(`${appId}${timestamp}${corpo}${segredo}`).digest("hex");
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`;
}

/** Consulta GraphQL; o termo entra como literal JSON (mesmo escape de string do GraphQL). */
export function consultaShopee(termo: string): string {
  return JSON.stringify({
    query: `{ productOfferV2(keyword: ${JSON.stringify(termo)}, sortType: 1, page: 1, limit: ${POR_BUSCA}) { nodes { itemId productName priceMin priceMax imageUrl offerLink productLink shopId shopName sales ratingStar } } }`,
  });
}

export interface NoShopee {
  itemId: number | string;
  productName: string;
  priceMin?: string | number;
  priceMax?: string | number;
  imageUrl?: string;
  offerLink?: string;
  productLink?: string;
  shopId?: number | string;
  shopName?: string;
}

export function anunciosShopee(nos: NoShopee[]): Anuncio[] {
  const lista: Anuncio[] = [];
  for (const n of nos) {
    // priceMin = variação mais barata do anúncio (o comprador escolhe a variação).
    const preco = Number(n.priceMin ?? n.priceMax);
    const url = n.offerLink || n.productLink;
    if (!n.productName || !url || !Number.isFinite(preco) || preco <= 0) continue;
    lista.push({
      titulo: n.productName,
      preco: Math.round(preco * 100) / 100,
      url,
      imagem: n.imageUrl,
      ref: { item: String(n.itemId), seller: String(n.shopId ?? ""), loja: n.shopName ?? "" },
    });
  }
  return lista;
}

/** Frete estimado: um por vendedor do carrinho (grátis acima do mínimo, por vendedor). */
export function freteShopee(carrinho: ItemCarrinho[], regra: RegraFrete): Frete {
  const porVendedor = new Map<string, number>();
  for (const c of carrinho) {
    const v = c.oferta.ref?.seller || c.oferta.url;
    porVendedor.set(v, (porVendedor.get(v) ?? 0) + c.oferta.custoItem);
  }
  let valor = 0;
  for (const subtotal of porVendedor.values()) {
    if (regra.gratisAcima === undefined || subtotal < regra.gratisAcima) valor += regra.base;
  }
  return {
    valor: Math.round(valor * 100) / 100,
    tipo: "estimado",
    entrega: true,
    prazo: regra.prazo,
    obs: porVendedor.size > 1 ? `${porVendedor.size} vendedores: um frete estimado por vendedor` : "Frete estimado (depende do vendedor e de cupons)",
  };
}

export function criarShopee(regra: RegraFrete): LojaAdapter {
  return {
    id: "shopee",
    nome: "Shopee",
    via: "http",
    async buscar(termo) {
      const cred = credenciaisShopee();
      if (!cred) throw new Error("SHOPEE_APP_ID/SHOPEE_SECRET não configurados");
      const corpo = consultaShopee(termo);
      const r = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: autorizacaoShopee(cred.appId, cred.segredo, corpo, Math.floor(Date.now() / 1000)),
        },
        body: corpo,
        signal: AbortSignal.timeout(15000),
      });
      const j = (await r.json().catch(() => ({}))) as {
        data?: { productOfferV2?: { nodes?: NoShopee[] } };
        errors?: { message: string; extensions?: { code?: number } }[];
      };
      if (j.errors?.length) {
        const e = j.errors[0];
        const msg = `Shopee: ${e.message}`;
        // 10020 = autenticação; 10030 = limite de requisições
        if (e.extensions?.code === 10030 || r.status === 429) throw new BloqueioError(msg);
        throw new Error(msg);
      }
      if (!r.ok) throw new Error(`Shopee: HTTP ${r.status}`);
      return anunciosShopee(j.data?.productOfferV2?.nodes ?? []);
    },
    async frete(carrinho) {
      return freteShopee(carrinho, regra);
    },
  };
}
