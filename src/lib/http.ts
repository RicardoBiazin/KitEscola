import { LRUCache } from "lru-cache";
import pLimit from "p-limit";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** Erro que indica bloqueio anti-robô (403, captcha): a loja fica marcada "bloqueada". */
export class BloqueioError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BloqueioError";
  }
}

const cache = new LRUCache<string, { status: number; corpo: string }>({
  max: 2000,
  ttl: 60 * 60 * 1000,
});

// Poucas requisições simultâneas por loja, para não sobrecarregar ninguém.
const limites = new Map<string, ReturnType<typeof pLimit>>();
function limitePara(host: string) {
  let l = limites.get(host);
  if (!l) {
    l = pLimit(3);
    limites.set(host, l);
  }
  return l;
}

export const ESPERA_ANTES_DE_REPETIR_MS = process.env.VITEST ? 10 : 1500;

export interface OpcoesHttp {
  metodo?: "GET" | "POST";
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
  timeoutMs?: number;
  semCache?: boolean;
}

export async function baixar(url: string, op: OpcoesHttp = {}): Promise<{ status: number; corpo: string }> {
  const metodo = op.metodo ?? "GET";
  const corpoTexto = op.corpo === undefined ? undefined : JSON.stringify(op.corpo);
  const chave = `${metodo} ${url} ${corpoTexto ?? ""}`;
  if (!op.semCache) {
    const c = cache.get(chave);
    if (c) return c;
  }
  const host = new URL(url).host;
  const requisitar = () =>
    limitePara(host)(async () => {
      const resp = await fetch(url, {
        method: metodo,
        body: corpoTexto,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "pt-BR,pt;q=0.9",
          Accept: corpoTexto ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.8",
          ...(corpoTexto ? { "Content-Type": "application/json" } : {}),
          ...op.cabecalhos,
        },
        signal: AbortSignal.timeout(op.timeoutMs ?? 20000),
        redirect: "follow",
      });
      return { status: resp.status, corpo: await resp.text() };
    });
  let r = await requisitar();
  // Firewalls de loja costumam barrar rajadas (403/429 passageiro): espera e tenta mais uma vez.
  if (r.status === 403 || r.status === 429) {
    await new Promise((ok) => setTimeout(ok, ESPERA_ANTES_DE_REPETIR_MS));
    r = await requisitar();
  }
  if (r.status === 403 || r.status === 429) throw new BloqueioError(`HTTP ${r.status}`);
  if (r.status >= 200 && r.status < 300) cache.set(chave, r);
  return r;
}

export async function baixarJson<T>(url: string, op: OpcoesHttp = {}): Promise<T> {
  const r = await baixar(url, op);
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  try {
    return JSON.parse(r.corpo) as T;
  } catch {
    throw new BloqueioError("resposta não é JSON (provável página anti-robô)");
  }
}

/** "R$ 1.234,56" -> 1234.56 */
export function precoBR(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const m = texto.replace(/\s/g, "").match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const v = Number(m[1].replace(/\./g, "") + "." + (m[2] ?? "0"));
  return Number.isFinite(v) && v > 0 ? v : null;
}
