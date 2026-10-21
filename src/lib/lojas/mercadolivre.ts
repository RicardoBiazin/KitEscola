// Mercado Livre: a API pública de busca passou a exigir autorização e a página de busca pede
// verificação a requisições automatizadas. Tentamos pelo navegador; se cair na verificação,
// a loja aparece como "bloqueada".
import * as cheerio from "cheerio";
import { BloqueioError, precoBR } from "../http";
import { htmlPeloNavegador } from "../navegador";
import { simplificar } from "../normalizar";
import { freteEstimado, type Anuncio, type LojaAdapter, type RegraFrete } from "./tipos";
import { buscarPelaApi, credenciaisMl } from "./mercadolivre-api";

const BLOQUEIO = /suspicious-traffic|account-verification|captcha/i;

export function anunciosMercadoLivre(html: string): Anuncio[] {
  const $ = cheerio.load(html);
  const lista: Anuncio[] = [];
  $(".poly-card, li.ui-search-layout__item").each((_, el) => {
    const card = $(el);
    const link = card.find("a.poly-component__title, h3 a, a.ui-search-link").first();
    const titulo = (link.text() || card.find("h2, h3").first().text()).replace(/\s+/g, " ").trim();
    const url = link.attr("href");
    const atual = card.find(".poly-price__current, .ui-search-price__second-line").first();
    const inteiro = atual.find(".andes-money-amount__fraction").first().text();
    const centavos = atual.find(".andes-money-amount__cents").first().text();
    const preco = precoBR(inteiro ? `${inteiro},${centavos || "00"}` : null);
    if (!titulo || !url || !preco) return;
    const envio = simplificar(card.find(".poly-component__shipping, .ui-search-item__shipping").text());
    lista.push({
      titulo,
      preco,
      url: url.split("#")[0],
      imagem: card.find("img").first().attr("data-src") ?? card.find("img").first().attr("src"),
      freteGratis: envio.includes("gratis") ? true : undefined,
    });
  });
  return lista;
}

export function criarMercadoLivre(regra: RegraFrete): LojaAdapter {
  // Com ML_CLIENT_ID/ML_CLIENT_SECRET usa a API oficial; o navegador fica de reserva.
  const comApi = credenciaisMl() !== null;
  return {
    id: "mercadolivre",
    nome: "Mercado Livre",
    via: comApi ? "http" : "navegador",
    async buscar(termo) {
      if (comApi) {
        try {
          return await buscarPelaApi(termo);
        } catch (e) {
          console.warn(`[mercadolivre] API falhou, tentando pelo navegador: ${e instanceof Error ? e.message : e}`);
        }
      }
      const slug = simplificar(termo).replace(/\s+/g, "-");
      const html = await htmlPeloNavegador(`https://lista.mercadolivre.com.br/${slug}`, ".poly-card", BLOQUEIO);
      const anuncios = anunciosMercadoLivre(html);
      if (anuncios.length === 0 && BLOQUEIO.test(html)) {
        throw new BloqueioError("verificação anti-robô do Mercado Livre");
      }
      return anuncios;
    },
    async frete(carrinho) {
      return freteEstimado(carrinho, regra);
    },
  };
}
