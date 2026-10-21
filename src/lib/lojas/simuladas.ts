// Lojas falsas e determinísticas, usadas no teste de ponta a ponta (KITESCOLA_MOCK=1).
import { freteEstimado, type LojaAdapter } from "./tipos";
import { simplificar } from "../normalizar";

function precoFixo(termo: string, fator: number): number {
  const base = [...simplificar(termo)].reduce((s, c) => s + c.charCodeAt(0), 0) % 40;
  return Math.round((5 + base) * fator * 100) / 100;
}

export function criarLojasSimuladas(): LojaAdapter[] {
  const loja = (id: string, nome: string, fator: number, base: number, gratisAcima?: number): LojaAdapter => ({
    id,
    nome,
    via: "http",
    async buscar(termo) {
      return [
        { titulo: termo, preco: precoFixo(termo, fator), url: `https://exemplo.invalid/${id}/${encodeURIComponent(termo)}`, ref: { sku: "1" } },
        { titulo: `Kit 3 ${termo}`, preco: precoFixo(termo, fator * 2.4), url: `https://exemplo.invalid/${id}/kit`, ref: { sku: "2" } },
      ];
    },
    async frete(carrinho) {
      return { ...freteEstimado(carrinho, { base, gratisAcima }), tipo: "real" };
    },
  });
  return [
    loja("loja-a", "Loja A", 1, 15, 150),
    loja("loja-b", "Loja B", 0.9, 25),
    loja("loja-c", "Loja C", 1.1, 0),
  ];
}
