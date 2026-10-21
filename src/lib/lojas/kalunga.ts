// Kalunga: busca por HTML. O cálculo de frete do site exige login, então o frete é estimado por regra.
import * as cheerio from "cheerio";
import { baixar, BloqueioError, precoBR } from "../http";
import { freteEstimado, type Anuncio, type LojaAdapter, type RegraFrete } from "./tipos";

const BASE = "https://www.kalunga.com.br";

export function anunciosKalunga(html: string): Anuncio[] {
  const $ = cheerio.load(html);
  const lista: Anuncio[] = [];
  $(".blocoproduto").each((_, el) => {
    const card = $(el);
    const titulo = card.find(".blocoproduto__title").text().trim();
    const href = card.find("a.blocoproduto__link").attr("href");
    const preco = precoBR(card.find(".blocoproduto__price").first().text());
    if (!titulo || !href || !preco) return;
    const imagem = card.find("source").attr("data-srcset") ?? card.find("img").attr("data-src");
    lista.push({
      titulo,
      preco,
      url: href.startsWith("http") ? href : BASE + href,
      imagem,
      freteGratis: card.find("[class*=fretegratis]").length > 0 || undefined,
    });
  });
  return lista;
}

export function criarKalunga(regra: RegraFrete): LojaAdapter {
  return {
    id: "kalunga",
    nome: "Kalunga",
    via: "http",
    async buscar(termo) {
      const r = await baixar(`${BASE}/busca/${encodeURIComponent(termo)}`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const anuncios = anunciosKalunga(r.corpo);
      if (anuncios.length === 0 && !r.corpo.includes("blocoproduto") && r.corpo.length < 20000) {
        throw new BloqueioError("página sem resultados (possível bloqueio)");
      }
      return anuncios;
    },
    async frete(carrinho) {
      return freteEstimado(carrinho, regra);
    },
  };
}
