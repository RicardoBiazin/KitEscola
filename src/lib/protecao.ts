// Proteção contra uso automatizado. É EXIGIDA por padrão: se faltar configuração, a rota recusa.
// - Cada busca e cada emissão de passe exigem um token do Cloudflare Turnstile (uso único, conferido no servidor).
// - A busca devolve um "passe" assinado (HMAC, 10 min, com nonce, preso ao IP) que libera o
//   /api/otimizar e o /api/importar. O contador de uso por passe e por IP fica em limites.ts.
// - Só desliga com KITESCOLA_LOCAL=1 (uso no próprio computador). Na Netlify (NETLIFY definido)
//   essa variável é ignorada, para uma cópia esquecida no painel não abrir o site.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VALIDADE_PASSE_MS = 10 * 60 * 1000;

/** Verdadeiro só no computador do desenvolvedor (KITESCOLA_LOCAL=1 fora da Netlify). */
export function modoLocal(): boolean {
  return process.env.KITESCOLA_LOCAL === "1" && !process.env.NETLIFY;
}

export function turnstileConfigurado(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

/** Fora do modo local, a proteção precisa do Turnstile e do segredo do passe. Faltando, as rotas recusam. */
export function protecaoFaltando(): boolean {
  return !modoLocal() && (!turnstileConfigurado() || !process.env.KITESCOLA_SEGREDO?.trim());
}

/**
 * IP do visitante. Na Netlify vem de x-nf-client-connection-ip, que o cliente não consegue forjar.
 * Os demais cabeçalhos só valem fora da Netlify (rodando em outro lugar).
 */
export function ipDe(req: Request): string {
  const h = req.headers;
  const netlify = h.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  if (process.env.NETLIFY) return "desconhecido";
  return (
    h.get("cf-connecting-ip")?.trim() ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export async function verificarTurnstile(token: unknown, ip: string): Promise<{ ok: boolean; motivo?: string }> {
  if (modoLocal()) return { ok: true };
  if (!turnstileConfigurado()) return { ok: false, motivo: "proteção não configurada" };
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return { ok: false, motivo: "sem desafio" };
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!.trim(), response: token, ...(ip !== "local" ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    return j.success ? { ok: true } : { ok: false, motivo: (j["error-codes"] ?? []).join(",") || "recusado" };
  } catch {
    return { ok: false, motivo: "Turnstile indisponível" };
  }
}

// Segredo do HMAC. Online precisa ser fixo (várias instâncias da função); localmente um aleatório basta.
let segredoLocal: Buffer | null = null;
function segredo(): Buffer | null {
  const s = process.env.KITESCOLA_SEGREDO?.trim();
  if (s) return Buffer.from(s);
  if (modoLocal()) return (segredoLocal ??= randomBytes(32));
  return null;
}

/** Passe assinado: "<expira>.<nonce>.<assinatura de expira.nonce|ip>". */
export function emitirPasse(ip: string, agora = Date.now()): string {
  const chave = segredo();
  if (!chave) throw new Error("KITESCOLA_SEGREDO não configurado");
  const expira = String(agora + VALIDADE_PASSE_MS);
  const nonce = randomBytes(16).toString("base64url");
  const sig = createHmac("sha256", chave).update(`${expira}.${nonce}|${ip}`).digest("base64url");
  return `${expira}.${nonce}.${sig}`;
}

/** Partes do passe (expira, nonce) se o formato estiver certo; a assinatura ainda precisa ser conferida. */
export function partesDoPasse(passe: unknown): { expira: number; nonce: string } | null {
  if (typeof passe !== "string") return null;
  const [expira, nonce, sig, extra] = passe.split(".");
  if (!expira || !nonce || !sig || extra !== undefined) return null;
  if (!/^\d+$/.test(expira) || !/^[A-Za-z0-9_-]{16,32}$/.test(nonce)) return null;
  return { expira: Number(expira), nonce };
}

export function conferirPasse(passe: unknown, ip: string, agora = Date.now()): boolean {
  if (modoLocal()) return true;
  const partes = partesDoPasse(passe);
  if (!partes || partes.expira < agora) return false;
  const chave = segredo();
  if (!chave || typeof passe !== "string") return false;
  const sig = passe.split(".")[2];
  const esperado = Buffer.from(createHmac("sha256", chave).update(`${partes.expira}.${partes.nonce}|${ip}`).digest("base64url"));
  const recebido = Buffer.from(sig);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
