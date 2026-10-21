// Amazon BR: a busca só responde a navegador real (desafio anti-robô em requisição direta).
import * as cheerio from "cheerio";
import { BloqueioError, precoBR } from "../http";
import { htmlPeloNavegador } from "../navegador";
import { freteEstimado, type Anuncio, type LojaAdapter, type RegraFrete } from "./tipos";

const BASE = "https://www.amazon.com.br";

export function anunciosAmazon(html: string): Anuncio[] {
  const $ = cheerio.load(html);
  const lista: Anuncio[] = [];
  $("div[data-component-type=s-search-result]").each((_, el) => {
    const card = $(el);
    const asin = card.attr("data-asin");
    const titulo = card.find("h2").text().replace(/\s+/g, " ").trim();
    const preco = precoBR(card.find(".a-price:not(.a-text-price) .a-offscreen").first().text());
    if (!asin || !titulo || !preco) return;
    const entrega = card.find("[data-cy=delivery-recipe]").text().replace(/\s+/g, " ");
    lista.push({
      titulo,
      preco,
      url: `${BASE}/dp/${asin}`,
      imagem: card.find("img.s-image").attr("src"),
      // "Entrega GRÁTIS ... no seu primeiro pedido" não vale para todo mundo.
      freteGratis: /gr[áa]tis/i.test(entrega) && !/primeiro pedido/i.test(entrega) ? true : undefined,
      ref: { asin },
    });
  });
  return lista;
}

export function criarAmazon(regra: RegraFrete): LojaAdapter {
  return {
    id: "amazon",
    nome: "Amazon",
    via: "navegador",
    async buscar(termo) {
      const html = await htmlPeloNavegador(
        `${BASE}/s?k=${encodeURIComponent(termo)}`,
        "div[data-component-type=s-search-result]",
        /validateCaptcha|captcha-container/i,
      );
      const anuncios = anunciosAmazon(html);
      if (anuncios.length === 0 && /captcha|bm-verify|triggerInterstitialChallenge/i.test(html)) {
        throw new BloqueioError("desafio anti-robô");
      }
      return anuncios;
    },
    async frete(carrinho) {
      return freteEstimado(carrinho, regra);
    },
  };
}
