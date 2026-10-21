// Adaptadores com a rede simulada (fetch falso): retentativa, alternativa de busca e Shopee.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { criarVtex } from "@/lib/lojas/vtex";
import { anunciosShopee, autorizacaoShopee, consultaShopee, criarShopee, freteShopee } from "@/lib/lojas/shopee";
import type { Oferta } from "@/lib/tipos";

const produtoVtex = (nome: string) => ({
  productName: nome,
  link: "/p",
  items: [{ itemId: "1", sellers: [{ sellerId: "1", commertialOffer: { Price: 5, AvailableQuantity: 3 } }] }],
});

afterEach(() => vi.restoreAllMocks());

describe("VTEX com a loja instável", () => {
  it("403 passageiro: tenta de novo e segue", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n++;
      return n === 1 ? new Response("bloqueado", { status: 403 }) : new Response(JSON.stringify({ products: [produtoVtex("Cola Bastão A")] }));
    });
    const loja = criarVtex({ id: "t1", nome: "T1", host: "t1.invalid", busca: "intelligent" });
    const a = await loja.buscar("cola bastão a");
    expect(a.map((x) => x.titulo)).toEqual(["Cola Bastão A"]);
    expect(n).toBe(2);
  });

  it("busca inteligente bloqueada de vez: usa o catálogo", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      urls.push(String(u));
      if (String(u).includes("intelligent-search")) return new Response("bloqueado", { status: 403 });
      return new Response(JSON.stringify([produtoVtex("Cola Bastão B")]));
    });
    const loja = criarVtex({ id: "t2", nome: "T2", host: "t2.invalid", busca: "intelligent" });
    expect((await loja.buscar("cola bastão b")).map((x) => x.titulo)).toEqual(["Cola Bastão B"]);
    expect(urls.filter((u) => u.includes("intelligent-search"))).toHaveLength(2); // original + retentativa
    expect(urls.some((u) => u.includes("catalog_system"))).toBe(true);
  });

  it("busca inteligente só com redirecionamento (sem produtos): usa o catálogo", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) =>
      String(u).includes("intelligent-search")
        ? new Response(JSON.stringify({ products: [], redirect: "https://loja/promo" }))
        : new Response(JSON.stringify([produtoVtex("Caderno C")])),
    );
    const loja = criarVtex({ id: "t3", nome: "T3", host: "t3.invalid", busca: "intelligent" });
    expect((await loja.buscar("caderno c")).map((x) => x.titulo)).toEqual(["Caderno C"]);
  });

  it("sem resultados de verdade (sem redirecionamento): não insiste", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ products: [] })));
    const loja = criarVtex({ id: "t4", nome: "T4", host: "t4.invalid", busca: "intelligent" });
    expect(await loja.buscar("nada")).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("Shopee (API de afiliados)", () => {
  it("assina com SHA256(AppId + Timestamp + corpo + Secret)", () => {
    const esperada = createHash("sha256").update("123" + "1700000000" + "{}" + "segredo").digest("hex");
    expect(autorizacaoShopee("123", "segredo", "{}", 1700000000)).toBe(
      `SHA256 Credential=123, Timestamp=1700000000, Signature=${esperada}`,
    );
  });

  it("consulta escapa o termo (sem injeção no GraphQL)", () => {
    const q = JSON.parse(consultaShopee('cola "bastão" } { x')).query as string;
    expect(q).toContain('keyword: "cola \\"bastão\\" } { x"');
    expect(q).toContain("productOfferV2(");
  });

  it("converte os produtos: menor preço da variação e link de afiliado", () => {
    const a = anunciosShopee([
      { itemId: 1, productName: "Cola Bastão 10g Kit 12", priceMin: "18.9", priceMax: "25", imageUrl: "https://img/1", offerLink: "https://s.shopee.com.br/aff1", productLink: "https://shopee.com.br/p1", shopId: 77 },
      { itemId: 2, productName: "Sem preço", offerLink: "https://s.shopee.com.br/aff2" },
    ]);
    expect(a).toEqual([
      { titulo: "Cola Bastão 10g Kit 12", preco: 18.9, url: "https://s.shopee.com.br/aff1", imagem: "https://img/1", ref: { item: "1", seller: "77", loja: "" } },
    ]);
  });

  it("frete estimado: um por vendedor, grátis acima do mínimo por vendedor", () => {
    const of = (seller: string, custo: number) => ({ oferta: { custoItem: custo, url: seller, ref: { seller } } as unknown as Oferta, quantidade: 1 });
    const regra = { base: 14.9, gratisAcima: 79 };
    expect(freteShopee([of("a", 10), of("a", 20)], regra).valor).toBe(14.9);
    expect(freteShopee([of("a", 10), of("b", 20)], regra).valor).toBe(29.8);
    expect(freteShopee([of("a", 80), of("b", 20)], regra).valor).toBe(14.9);
  });

  it("busca: manda a assinatura e trata erro de autenticação", async () => {
    process.env.SHOPEE_APP_ID = "app";
    process.env.SHOPEE_SECRET = "sec";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { productOfferV2: { nodes: [{ itemId: 9, productName: "Tesoura Escolar", priceMin: "7.5", offerLink: "https://s/aff" }] } } })),
    );
    const loja = criarShopee({ base: 14.9 });
    expect((await loja.buscar("tesoura")).map((x) => [x.titulo, x.preco])).toEqual([["Tesoura Escolar", 7.5]]);
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^SHA256 Credential=app, Timestamp=\d+, Signature=[0-9a-f]{64}$/);

    f.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "Invalid Authorization Header", extensions: { code: 10020 } }] })));
    await expect(loja.buscar("tesoura 2")).rejects.toThrow("Shopee: Invalid Authorization Header");
    delete process.env.SHOPEE_APP_ID;
    delete process.env.SHOPEE_SECRET;
  });
});
