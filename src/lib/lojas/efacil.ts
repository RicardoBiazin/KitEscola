// eFácil: a página de busca (Next.js) traz os produtos no __NEXT_DATA__ (nome, preço,
// disponibilidade, foto). O cálculo de frete por CEP exige sessão na plataforma da loja
// (IBM WebSphere Commerce), então o frete é estimado por regra.
import { baixar, BloqueioError } from "../http";
import { freteEstimado, type Anuncio, type LojaAdapter, type RegraFrete } from "./tipos";

const BASE = "https://www.efacil.com.br";

interface ProdutoEfacil {
  nome: string;
  sku?: string;
  disponivel?: boolean;
  thumbnail?: string;
  url?: string;
  preco?: { precoPor?: number | string };
}

export function anunciosEfacil(html: string): Anuncio[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let produtos: ProdutoEfacil[] = [];
  try {
    produtos = JSON.parse(m[1])?.props?.pageProps?.searchData?.produtos ?? [];
  } catch {
    return [];
  }
  const lista: Anuncio[] = [];
  for (const p of produtos) {
    const preco = Number(p.preco?.precoPor);
    if (!p.nome || !p.url || p.disponivel === false || !Number.isFinite(preco) || preco <= 0) continue;
    const url = p.url.startsWith("//") ? `https:${p.url}` : p.url.startsWith("/") ? BASE + p.url : p.url;
    lista.push({ titulo: p.nome, preco, url, imagem: p.thumbnail || undefined, ref: { sku: p.sku ?? "" } });
  }
  return lista;
}

export function criarEfacil(regra: RegraFrete): LojaAdapter {
  return {
    id: "efacil",
    nome: "eFácil",
    via: "http",
    async buscar(termo) {
      const r = await baixar(`${BASE}/loja/busca/?searchTerm=${encodeURIComponent(termo).replace(/%20/g, "+")}`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      if (!r.corpo.includes("__NEXT_DATA__")) throw new BloqueioError("página sem dados de busca (possível bloqueio)");
      return anunciosEfacil(r.corpo);
    },
    async frete(carrinho) {
      return freteEstimado(carrinho, regra);
    },
  };
}
