import { buscarTudo } from "@/lib/buscar";
import { ERRO_PUBLICO, mensagemPublicaDaLoja } from "@/lib/entrada";
import { verificarLimites } from "@/lib/limites";
import { lojasAtivas } from "@/lib/lojas/registro";
import { emitirPasse, ipDe, protecaoFaltando, verificarTurnstile } from "@/lib/protecao";
import type { EventoBusca, ItemLista } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify: respostas em streaming podem durar até 60 s.
export const maxDuration = 60;

const MAX_ITENS = 60;

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { itens?: ItemLista[]; cep?: string; turnstile?: string } | null;
  const cep = String(corpo?.cep ?? "").replace(/\D/g, "");
  const itens = (corpo?.itens ?? [])
    .filter((i) => i && typeof i.nome === "string" && i.nome.trim())
    .slice(0, MAX_ITENS)
    .map((i) => ({ id: String(i.id).slice(0, 64), nome: i.nome.trim().slice(0, 120), quantidade: Math.max(1, Math.min(999, Number(i.quantidade) || 1)) }));
  if (cep.length !== 8) return Response.json({ erro: "CEP inválido." }, { status: 400 });
  if (itens.length === 0) return Response.json({ erro: "A lista está vazia." }, { status: 400 });

  if (protecaoFaltando()) {
    return Response.json({ erro: "Busca temporariamente indisponível (proteção anti-robô em configuração)." }, { status: 503 });
  }
  const ip = ipDe(req);
  const limite = await verificarLimites("buscar", ip, null);
  if (limite === "indisponivel") return Response.json({ erro: "Serviço temporariamente indisponível. Tente de novo." }, { status: 503 });
  if (limite === "excedido") return Response.json({ erro: "Muitas buscas em pouco tempo. Aguarde um pouco." }, { status: 429 });
  const desafio = await verificarTurnstile(corpo?.turnstile, ip);
  if (!desafio.ok) {
    return Response.json({ erro: "Não foi possível confirmar que você não é um robô. Refaça a verificação e tente de novo." }, { status: 403 });
  }
  const passe = emitirPasse(ip);

  const codificador = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Resumo por loja para o log da função (sem IP nem CEP). Aqui fica o detalhe técnico.
      const inicio = Date.now();
      const resumo: { loja: string; estado: string; ofertas: number; ms: number; msg?: string }[] = [];
      const enviar = (e: EventoBusca) => controller.enqueue(codificador.encode(JSON.stringify(e) + "\n"));
      // O navegador recebe só texto genérico; o detalhe das lojas fica no resumo do log.
      const emitir = (e: EventoBusca) => {
        if (e.tipo !== "loja") return enviar(e);
        const s = e.status;
        resumo.push({ loja: s.lojaId, estado: s.estado, ofertas: s.ofertas, ms: Date.now() - inicio, msg: s.mensagem?.slice(0, 80) });
        enviar({ tipo: "loja", status: { ...s, mensagem: s.mensagem ? mensagemPublicaDaLoja(s.estado) : undefined } });
      };
      enviar({ tipo: "passe", passe });
      try {
        await buscarTudo(lojasAtivas(), itens, cep, emitir);
      } catch (e) {
        console.error("busca: falha inesperada:", e instanceof Error ? e.message : String(e));
        enviar({ tipo: "loja", status: { lojaId: "-", lojaNome: "Busca", estado: "erro", mensagem: ERRO_PUBLICO, ofertas: 0 } });
        enviar({ tipo: "fim" });
      }
      console.info(JSON.stringify({ evento: "busca", itens: itens.length, ms: Date.now() - inicio, lojas: resumo }));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
