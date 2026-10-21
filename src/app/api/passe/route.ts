import { ERRO_PUBLICO } from "@/lib/entrada";
import { verificarLimites } from "@/lib/limites";
import { emitirPasse, ipDe, protecaoFaltando, verificarTurnstile } from "@/lib/protecao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Passe para o /api/importar (a planilha é enviada antes da busca). Mesmo Turnstile da busca:
 * um desafio resolvido por passe, conferido no servidor.
 */
export async function POST(req: Request) {
  if (protecaoFaltando()) {
    return Response.json({ erro: "Serviço temporariamente indisponível (proteção anti-robô em configuração)." }, { status: 503 });
  }
  const corpo = (await req.json().catch(() => null)) as { turnstile?: unknown } | null;
  const ip = ipDe(req);
  const limite = await verificarLimites("passe", ip, null);
  if (limite === "indisponivel") return Response.json({ erro: "Serviço temporariamente indisponível. Tente de novo." }, { status: 503 });
  if (limite === "excedido") return Response.json({ erro: "Muitas tentativas em pouco tempo. Aguarde um pouco." }, { status: 429 });
  const desafio = await verificarTurnstile(corpo?.turnstile, ip);
  if (!desafio.ok) {
    return Response.json({ erro: "Não foi possível confirmar que você não é um robô. Refaça a verificação e tente de novo." }, { status: 403 });
  }
  try {
    return Response.json({ passe: emitirPasse(ip) });
  } catch (e) {
    console.error("passe: falha ao emitir:", e instanceof Error ? e.message : String(e));
    return Response.json({ erro: ERRO_PUBLICO }, { status: 500 });
  }
}
