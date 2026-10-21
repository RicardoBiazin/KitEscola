import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { anunciosKalunga } from "@/lib/lojas/kalunga";
import { anunciosAmazon } from "@/lib/lojas/amazon";
import { anunciosMercadoLivre } from "@/lib/lojas/mercadolivre";
import { anuncioDoProduto } from "@/lib/lojas/mercadolivre-api";
import { anunciosVtex, aplicarSimulacao, freteDaSimulacao } from "@/lib/lojas/vtex";
import type { Oferta } from "@/lib/tipos";

const fixture = (nome: string) => readFileSync(path.join(__dirname, "..", "fixtures", nome), "utf8");

describe("Kalunga", () => {
  it("extrai anúncios da página de busca", () => {
    const a = anunciosKalunga(fixture("kalunga-busca.html"));
    expect(a.length).toBeGreaterThan(30);
    expect(a[0]).toMatchObject({ preco: 27.9 });
    expect(a[0].titulo).toMatch(/Caderno/);
    expect(a[0].url).toMatch(/^https:\/\/www\.kalunga\.com\.br\/prod\//);
    expect(a[0].imagem).toMatch(/^https:\/\/img\.kalunga/);
  });
});

describe("Amazon", () => {
  it("extrai anúncios da página renderizada", () => {
    const a = anunciosAmazon(fixture("amazon-busca.html"));
    expect(a.length).toBeGreaterThan(20);
    for (const x of a) {
      expect(x.preco).toBeGreaterThan(0);
      expect(x.url).toMatch(/^https:\/\/www\.amazon\.com\.br\/dp\/\w+$/);
    }
    // "Entrega GRÁTIS no seu primeiro pedido" não conta como frete grátis
    expect(a[0].freteGratis).toBeUndefined();
  });
});

describe("Mercado Livre", () => {
  it("extrai poly-card", () => {
    const html = `<ol><li><div class="poly-card"><img src="https://img/x.jpg"><h3><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-1#pos">Caderno 10 Matérias Tilibra</a></h3>
      <div class="poly-price__current"><span class="andes-money-amount__fraction">1.234</span><span class="andes-money-amount__cents">5</span></div>
      <div class="poly-component__shipping">Frete grátis</div></div></li></ol>`;
    const [a] = anunciosMercadoLivre(html);
    expect(a).toMatchObject({
      titulo: "Caderno 10 Matérias Tilibra",
      preco: 1234.5,
      freteGratis: true,
      url: "https://produto.mercadolivre.com.br/MLB-1",
    });
  });
});

describe("Mercado Livre (API de catálogo)", () => {
  const produto = { id: "MLB26906816", name: "Cola Bastão Kaz", pictures: [{ url: "https://http2.mlstatic.com/x.jpg" }] };

  it("escolhe o vendedor novo mais barato e monta o link do produto", () => {
    const a = anuncioDoProduto(produto, [
      { item_id: "MLB1", price: 5.5, condition: "new", seller_id: 1 },
      { item_id: "MLB2", price: 3.2, condition: "used", seller_id: 2 },
      { item_id: "MLB3", price: 4.1, condition: "new", seller_id: 3, shipping: { free_shipping: true } },
    ]);
    expect(a).toMatchObject({
      titulo: "Cola Bastão Kaz",
      preco: 4.1,
      freteGratis: true,
      url: "https://www.mercadolivre.com.br/p/MLB26906816",
      imagem: "https://http2.mlstatic.com/x.jpg",
      ref: { item: "MLB3", seller: "3" },
    });
  });

  it("empate de preço: prefere frete grátis; sem vendedor novo = sem anúncio", () => {
    const a = anuncioDoProduto(produto, [
      { item_id: "A", price: 4, seller_id: 1 },
      { item_id: "B", price: 4, seller_id: 2, shipping: { free_shipping: true } },
    ]);
    expect(a?.ref?.item).toBe("B");
    expect(anuncioDoProduto(produto, [{ item_id: "U", price: 2, condition: "used" }])).toBeNull();
  });
});

describe("VTEX", () => {
  it("intelligent-search: ignora vendedor sem estoque", () => {
    const j = JSON.parse(fixture("vtex-intelligent-search.json"));
    const a = anunciosVtex("https://www.carrefour.com.br", j.products);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]).toMatchObject({ preco: 31.9, ref: { seller: "2074" } });
    expect(a[0].url).toMatch(/^https:\/\/www\.carrefour\.com\.br\/.+\/p$/);
  });

  it("catálogo legado", () => {
    const a = anunciosVtex("https://www.americanas.com.br", JSON.parse(fixture("vtex-catalog.json")));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.preco > 0 && x.ref?.sku)).toBe(true);
  });

  it("frete da simulação", () => {
    const f = freteDaSimulacao(JSON.parse(fixture("vtex-simulation.json")));
    expect(f).toMatchObject({ valor: 18.92, tipo: "real", entrega: true, prazo: "10 dias úteis" });
  });

  it("sem logística = não entrega", () => {
    expect(freteDaSimulacao({ items: [], logisticsInfo: [] }).entrega).toBe(false);
    const soRetirada = {
      items: [],
      logisticsInfo: [{ itemIndex: 0, slas: [{ id: "r", name: "r", price: 0, shippingEstimate: "1bd", deliveryChannel: "pickup-in-point" }] }],
    };
    expect(freteDaSimulacao(soRetirada)).toMatchObject({ entrega: false, retirada: true, valor: 0 });
  });

  it("aplica a simulação: preço regional, frete por item e descarta o que não entrega", () => {
    const base: Oferta = {
      lojaId: "carrefour", lojaNome: "Carrefour", itemId: "i", titulo: "t", preco: 30, unidadesPorAnuncio: 1,
      anunciosNecessarios: 1, custoItem: 30, url: "#", relevancia: 1, ref: { sku: "340502069", seller: "2074" },
    };
    const [o] = aplicarSimulacao([base], JSON.parse(fixture("vtex-simulation.json")));
    expect(o).toMatchObject({ preco: 31.9, custoItem: 31.9, freteItem: 18.92, fretePacote: 18.92 });

    const semEntrega = {
      items: [{ id: "1", requestIndex: 0, availability: "cannotBeDelivered" }],
      logisticsInfo: [{ itemIndex: 0, slas: [] }],
    };
    expect(aplicarSimulacao([base], semEntrega)).toEqual([]);

    const soRetirada = {
      items: [{ id: "1", requestIndex: 0, availability: "available", price: 1000 }],
      logisticsInfo: [{ itemIndex: 0, slas: [{ id: "r", name: "r", price: 0, shippingEstimate: "1bd", deliveryChannel: "pickup-in-point" }] }],
    };
    expect(aplicarSimulacao([base], soRetirada)[0]).toMatchObject({ preco: 10, soRetirada: true, freteItem: 0 });
  });
});

describe("eFácil", () => {
  it("extrai os produtos do __NEXT_DATA__ da busca", async () => {
    const { anunciosEfacil } = await import("@/lib/lojas/efacil");
    const a = anunciosEfacil(fixture("efacil-busca.html"));
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]).toMatchObject({ titulo: "Cola Bastão Mercur Berco 10g - Embalagem com 10 Unidades", preco: 25 });
    expect(a[0].url).toMatch(/^https:\/\/www\.efacil\.com\.br\/loja\/produto\//);
    expect(a.every((x) => x.preco > 0)).toBe(true);
  });

  it("página sem dados não quebra", async () => {
    const { anunciosEfacil } = await import("@/lib/lojas/efacil");
    expect(anunciosEfacil("<html></html>")).toEqual([]);
  });
});
