// Limites de uso: por IP (por hora, em cada rota) e por passe (no máximo LIMITE_POR_PASSE chamadas
// de /api/otimizar e /api/importar dentro dos 10 min de validade). Sem isso, um único desafio do
// Turnstile daria chamadas ilimitadas, e cada /api/otimizar faz várias chamadas às lojas.
//
// Os contadores ficam no Netlify Blobs: a função roda em várias instâncias, então a conta precisa ser
// compartilhada (memória de uma instância não serve). Leitura e escrita não são atômicas; um estouro
// de poucas chamadas numa corrida é aceito. Local (KITESCOLA_LOCAL=1) não conta nada.
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { modoLocal, partesDoPasse } from "./protecao";

export interface Registro {
  n: number;
  fim: number;
}

export interface Armazem {
  ler(chave: string): Promise<Registro | null>;
  gravar(chave: string, valor: Registro): Promise<void>;
}

export type Rota = "buscar" | "passe" | "importar" | "otimizar";
export type Veredito = "ok" | "excedido" | "indisponivel";

const HORA_MS = 60 * 60 * 1000;
export const LIMITE_POR_IP_HORA: Record<Rota, number> = { buscar: 60, passe: 60, importar: 30, otimizar: 60 };
export const LIMITE_POR_PASSE = 10;

const OPCOES_STORE = { name: "kitescola-limites", consistency: "strong" } as const;

/** Netlify Blobs. Fora da Netlify (sem contexto configurado) a leitura lança erro e a rota recusa. */
export const armazemNetlify: Armazem = {
  async ler(chave) {
    const v = (await getStore(OPCOES_STORE).get(chave, { type: "json" })) as Partial<Registro> | null;
    return v && typeof v.n === "number" && typeof v.fim === "number" ? { n: v.n, fim: v.fim } : null;
  },
  async gravar(chave, valor) {
    await getStore(OPCOES_STORE).setJSON(chave, valor);
  },
};

/** Conta uma utilização da chave na janela. Devolve false (sem gravar) quando o limite já foi atingido. */
export async function contar(armazem: Armazem, chave: string, limite: number, janelaMs: number, agora = Date.now()): Promise<boolean> {
  const atual = await armazem.ler(chave);
  const vigente = atual !== null && atual.fim > agora;
  const n = vigente && atual ? atual.n + 1 : 1;
  if (n > limite) return false;
  await armazem.gravar(chave, { n, fim: vigente && atual ? atual.fim : agora + janelaMs });
  return true;
}

function chaveIp(ip: string, rota: Rota): string {
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}:${rota}`;
}

/**
 * Confere os limites de uma requisição. `passe` só é informado nas rotas que consomem passe.
 * "indisponivel" quando o armazenamento falha: a rota recusa (fecha), em vez de deixar passar sem conta.
 */
export async function verificarLimites(
  rota: Rota,
  ip: string,
  passe: string | null,
  agora = Date.now(),
  armazem: Armazem = armazemNetlify,
): Promise<Veredito> {
  if (modoLocal()) return "ok";
  try {
    if (!(await contar(armazem, chaveIp(ip, rota), LIMITE_POR_IP_HORA[rota], HORA_MS, agora))) return "excedido";
    const partes = passe === null ? null : partesDoPasse(passe);
    if (passe !== null) {
      if (!partes) return "excedido";
      const restante = Math.max(1, partes.expira - agora);
      if (!(await contar(armazem, `passe:${partes.nonce}`, LIMITE_POR_PASSE, restante, agora))) return "excedido";
    }
    return "ok";
  } catch (e) {
    console.error("limites: armazenamento indisponível:", e instanceof Error ? e.message : String(e));
    return "indisponivel";
  }
}
