import { describe, expect, it } from "vitest";
import { buscarTudo } from "@/lib/buscar";
import type { ItemCarrinho, LojaAdapter } from "@/lib/lojas/tipos";
import type { EventoBusca, Oferta } from "@/lib/tipos";

function lojaFalsa(buscas: string[], fretes: ItemCarrinho[][]): LojaAdapter {
  return {
    id: "f",
    nome: "Falsa",
    via: "http",
    async buscar(termo) {
      buscas.push(termo);
      if (termo.startsWith("kit ")) {
        return [{ titulo: "Cola Bastão 10g Kit com 12 unidades", preco: 18, url: "https://x/kit12", ref: { sku: "k" } }];
      }
      return [{ titulo: "Cola Bastão 10g", preco: 2.5, url: "https://x/un", ref: { sku: "u" } }];
    },
    async frete(carrinho) {
      fretes.push(carrinho);
      return { valor: 10, tipo: "real", entrega: true };
    },
  };
}

async function rodar(quantidade: number) {
  const buscas: string[] = [];
  const fretes: ItemCarrinho[][] = [];
  const eventos: EventoBusca[] = [];
  await buscarTudo([lojaFalsa(buscas, fretes)], [{ id: "i", nome: "cola bastão", quantidade }], "88010000", (e) => eventos.push(e));
  const ofertas = eventos.flatMap((e) => (e.tipo === "ofertas" ? e.ofertas : [])) as Oferta[];
  return { buscas, fretes, ofertas };
}

describe("buscarTudo", () => {
  it("com quantidade > 1 procura também o kit e prefere o mais barato no total", async () => {
    const { buscas, ofertas, fretes } = await rodar(10);
    expect(buscas.sort()).toEqual(["cola bastão", "kit cola bastão"]);
    // 10 avulsas = 25,00; 1 kit de 12 = 18,00
    expect(ofertas[0]).toMatchObject({ url: "https://x/kit12", unidadesPorAnuncio: 12, anunciosNecessarios: 1, custoItem: 18 });
    expect(ofertas[1]).toMatchObject({ url: "https://x/un", anunciosNecessarios: 10, custoItem: 25 });
    // O frete é calculado com o que será comprado de fato
    expect(fretes[0].map((c) => [c.oferta.url, c.quantidade])).toEqual([["https://x/kit12", 1]]);
  });

  it("quantidade 1 não faz a busca extra", async () => {
    const { buscas, fretes } = await rodar(1);
    expect(buscas).toEqual(["cola bastão"]);
    expect(fretes[0][0].quantidade).toBe(1);
  });
});
