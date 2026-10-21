// Lojas ativas. Para incluir uma loja VTEX basta acrescentar uma linha em LOJAS_VTEX;
// para outra plataforma, criar um adapter que implemente LojaAdapter e registrar aqui.
import type { LojaAdapter, RegraFrete } from "./tipos";
import { criarVtex, type ConfigVtex } from "./vtex";
import { criarKalunga } from "./kalunga";
import { criarEfacil } from "./efacil";
import { criarAmazon } from "./amazon";
import { criarMercadoLivre } from "./mercadolivre";
import { criarLojasSimuladas } from "./simuladas";
import { credenciaisShopee, criarShopee } from "./shopee";

export const LOJAS_VTEX: ConfigVtex[] = [
  { id: "carrefour", nome: "Carrefour", host: "www.carrefour.com.br", busca: "intelligent", sc: "1" },
  { id: "americanas", nome: "Americanas", host: "www.americanas.com.br", busca: "catalogo" },
  { id: "atacadao", nome: "Atacadão", host: "www.atacadao.com.br", busca: "intelligent" },
  // Le Biscuit saiu em 26/09/2026: o Cloudflare Bot Management da loja barra requisições de
  // servidor (desafio "Just a moment..."). Não contornamos proteção anti-robô de propósito.
  { id: "rihappy", nome: "Ri Happy", host: "www.rihappy.com.br", busca: "intelligent" },
  { id: "pbkids", nome: "PB Kids", host: "www.pbkids.com.br", busca: "intelligent" },
  { id: "savegnago", nome: "Savegnago", host: "www.savegnago.com.br", busca: "intelligent" },
  { id: "bistek", nome: "Bistek", host: "www.bistek.com.br", busca: "intelligent" },
  { id: "giassi", nome: "Giassi", host: "www.giassi.com.br", busca: "intelligent" },
];

/**
 * Regras de frete ESTIMADO para lojas cujo cálculo real exige login ou não é acessível.
 * Valores aproximados — a interface sempre marca esses fretes como "estimado".
 */
export const REGRAS_FRETE: Record<string, RegraFrete> = {
  kalunga: { base: 19.9, gratisAcima: 199, prazo: "3 a 7 dias úteis" },
  amazon: { base: 14.9, gratisAcima: 99, prazo: "2 a 7 dias úteis" },
  mercadolivre: { base: 19.9, gratisAcima: 79, prazo: "2 a 8 dias úteis" },
  efacil: { base: 19.9, gratisAcima: 199, prazo: "3 a 10 dias úteis" },
  // Por vendedor: cada loja da Shopee envia separado.
  shopee: { base: 14.9, gratisAcima: 79, prazo: "3 a 10 dias úteis" },
};

let lojas: LojaAdapter[] | null = null;

export function lojasAtivas(): LojaAdapter[] {
  if (lojas) return lojas;
  if (process.env.KITESCOLA_MOCK === "1") return (lojas = criarLojasSimuladas());
  const desligadas = new Set((process.env.KITESCOLA_LOJAS_OFF ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  lojas = [
    criarKalunga(REGRAS_FRETE.kalunga),
    criarEfacil(REGRAS_FRETE.efacil),
    ...LOJAS_VTEX.map(criarVtex),
    criarAmazon(REGRAS_FRETE.amazon),
    criarMercadoLivre(REGRAS_FRETE.mercadolivre),
    // Só aparece quando há credenciais da API de afiliados.
    ...(credenciaisShopee() ? [criarShopee(REGRAS_FRETE.shopee)] : []),
  ].filter((l) => !desligadas.has(l.id));
  return lojas;
}
