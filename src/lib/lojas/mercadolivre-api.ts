// Mercado Livre pela API oficial, com token de aplicativo (client_credentials).
// Liberado para app: /products/search (catálogo) e /products/{id}/items (preço por vendedor).
// Bloqueado para app (403): /sites/MLB/search, /items/{id} e /items/{id}/shipping_options,
// por isso o frete é estimado, usando o "frete grátis" que a API informa por anúncio.
import pLimit from "p-limit";
import { baixarJson } from "../http";
import type { Anuncio } from "./tipos";

const API = "https://api.mercadolibre.com";
const PRODUTOS_POR_BUSCA = 20;

export function credenciaisMl(): { id: string; segredo: string } | null {
  const id = process.env.ML_CLIENT_ID?.trim();
  const segredo = process.env.ML_CLIENT_SECRET?.trim();
  return id && segredo ? { id, segredo } : null;
}

let token: { valor: string; expira: number } | null = null;
let pedindo: Promise<string> | null = null;

async function obterToken(): Promise<string> {
  if (token && Date.now() < token.expira) return token.valor;
  if (pedindo) return pedindo;
  const cred = credenciaisMl();
  if (!cred) throw new Error("ML_CLIENT_ID/ML_CLIENT_SECRET não configurados");
  pedindo = (async () => {
    const r = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: cred.id, client_secret: cred.segredo }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string };
    if (!r.ok || !j.access_token) throw new Error(`token do Mercado Livre recusado: ${j.message ?? r.status}`);
    // Renova 10 minutos antes de expirar (o token vale 6 h).
    token = { valor: j.access_token, expira: Date.now() + ((j.expires_in ?? 21600) - 600) * 1000 };
    return token.valor;
  })().finally(() => {
    pedindo = null;
  });
  return pedindo;
}

export interface ProdutoCatalogo {
  id: string;
  name: string;
  pictures?: { url: string }[];
}

export interface ItemCatalogo {
  item_id: string;
  price: number;
  condition?: string;
  seller_id?: number;
  shipping?: { free_shipping?: boolean };
}

/** Anúncio do produto de catálogo: o vendedor novo mais barato (frete grátis desempata). */
export function anuncioDoProduto(produto: ProdutoCatalogo, itens: ItemCatalogo[]): Anuncio | null {
  const novos = itens.filter((i) => i.price > 0 && (i.condition ?? "new") === "new");
  if (novos.length === 0) return null;
  const melhor = novos.reduce((a, b) =>
    b.price < a.price || (b.price === a.price && b.shipping?.free_shipping && !a.shipping?.free_shipping) ? b : a,
  );
  return {
    titulo: produto.name,
    preco: melhor.price,
    url: `https://www.mercadolivre.com.br/p/${produto.id}`,
    imagem: produto.pictures?.[0]?.url,
    freteGratis: melhor.shipping?.free_shipping ? true : undefined,
    ref: { produto: produto.id, item: melhor.item_id, seller: String(melhor.seller_id ?? "") },
  };
}

const limite = pLimit(6);

/** Categoria provável do termo ("tesoura sem ponta" -> MLB-SCISSORS). Público, sem token. */
async function dominio(termo: string): Promise<string | null> {
  try {
    const d = await baixarJson<{ domain_id: string }[]>(
      `${API}/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(termo)}`,
    );
    return d[0]?.domain_id ?? null;
  } catch {
    return null;
  }
}

export async function buscarPelaApi(termo: string): Promise<Anuncio[]> {
  const [tk, dom] = await Promise.all([obterToken(), dominio(termo)]);
  const cab = { Authorization: `Bearer ${tk}` };
  // Com a categoria, o catálogo deixa de trazer "tesoura de aparar pelos" para "tesoura sem ponta".
  const filtro = dom ? `&domain_id=${encodeURIComponent(dom)}` : "";
  const busca = await baixarJson<{ results: ProdutoCatalogo[] }>(
    `${API}/products/search?site_id=MLB&status=active&limit=${PRODUTOS_POR_BUSCA}${filtro}&q=${encodeURIComponent(termo)}`,
    { cabecalhos: cab },
  );
  const anuncios = await Promise.all(
    (busca.results ?? []).map((p) =>
      limite(async () => {
        try {
          const j = await baixarJson<{ results: ItemCatalogo[] }>(`${API}/products/${p.id}/items?limit=10`, { cabecalhos: cab });
          return anuncioDoProduto(p, j.results ?? []);
        } catch {
          return null; // 404 "No winners found" = produto sem vendedor ativo
        }
      }),
    ),
  );
  return anuncios.filter((a): a is Anuncio => a !== null);
}
