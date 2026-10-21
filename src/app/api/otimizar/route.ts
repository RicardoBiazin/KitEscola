import { ERRO_PUBLICO, validarFretes, validarItens, validarOfertas } from "@/lib/entrada";
import { verificarLimites } from "@/lib/limites";
import { lojasAtivas, REGRAS_FRETE } from "@/lib/lojas/registro";
import { ordenarPorLoja, otimizar, planosPorLoja, rotularPlanos, type ModeloFrete } from "@/lib/otimizador";
import { conferirPasse, ipDe, protecaoFaltando } from "@/lib/protecao";
import type { Frete, ItemLista, Oferta, Plano } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Pedido {
  itens: ItemLista[];
  ofertas: Oferta[];
  fretes: Record<string, Frete>;
  cep: string;
  aceitarRetirada: boolean;
}

/**
 * Monta os planos e, para cada loja de cada plano, recalcula o frete com a loja
 * usando só os itens escolhidos ali (o frete da busca foi do carrinho inteiro da loja).
 */
export async function POST(req: Request) {
  const passe = req.headers.get("x-kitescola-passe");
  const ip = ipDe(req);
  if (protecaoFaltando() || !conferirPasse(passe, ip)) {
    return Response.json({ erro: "Sessão de busca expirada. Faça a busca de novo." }, { status: 403 });
  }
  const limite = await verificarLimites("otimizar", ip, passe);
  if (limite === "indisponivel") return Response.json({ erro: "Serviço temporariamente indisponível. Tente de novo." }, { status: 503 });
  if (limite === "excedido") return Response.json({ erro: "Muitos pedidos em pouco tempo. Aguarde um pouco." }, { status: 429 });

  const p = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  const itens = validarItens(p.itens);
  const ofertas = validarOfertas(p.ofertas);
  const fretes = validarFretes(p.fretes);
  const cep = typeof p.cep === "string" ? p.cep.replace(/\D/g, "") : "";
  if (!itens || !ofertas || !fretes || cep.length !== 8) return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  if (p.aceitarRetirada !== undefined && typeof p.aceitarRetirada !== "boolean") {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const pedido: Pedido = { itens, ofertas, fretes, cep, aceitarRetirada: p.aceitarRetirada === true };
  try {
    return await montarPlanos(pedido);
  } catch (e) {
    console.error("otimizar: falha inesperada:", e instanceof Error ? e.message : String(e));
    return Response.json({ erro: ERRO_PUBLICO }, { status: 500 });
  }
}

async function montarPlanos(p: Pedido): Promise<Response> {
  const { cep, aceitarRetirada } = p;
  const adapters = new Map(lojasAtivas().map((l) => [l.id, l]));

  const modelos = new Map<string, ModeloFrete>();
  for (const [lojaId, frete] of Object.entries(p.fretes)) {
    const a = adapters.get(lojaId);
    if (!a) continue;
    modelos.set(lojaId, { lojaNome: a.nome, frete, gratisAcima: frete.tipo === "estimado" ? REGRAS_FRETE[lojaId]?.gratisAcima : undefined });
  }
  const planos = otimizar(p.itens, p.ofertas, modelos, { aceitarRetirada });
  const porLoja = planosPorLoja(p.itens, p.ofertas, modelos, { aceitarRetirada });

  // Confirma o frete real das lojas escolhidas (em paralelo, com cache por carrinho).
  const confirmados = new Map<string, Promise<Frete | null>>();
  const confirmar = (lojaId: string, itens: Oferta[]) => {
    const chave = lojaId + ":" + itens.map((o) => `${o.ref?.sku}x${o.anunciosNecessarios}`).sort().join(",");
    if (!confirmados.has(chave)) {
      const a = adapters.get(lojaId);
      confirmados.set(
        chave,
        a ? a.frete(itens.map((oferta) => ({ oferta, quantidade: oferta.anunciosNecessarios })), cep).catch(() => null) : Promise.resolve(null),
      );
    }
    return confirmados.get(chave)!;
  };
  const confirmarPlano = async (plano: Plano): Promise<Plano> => {
    const lojas = await Promise.all(
      plano.lojas.map(async (l) => {
        const f = await confirmar(l.lojaId, l.itens);
        return f && (f.entrega || (aceitarRetirada && f.retirada)) ? { ...l, frete: f } : l;
      }),
    );
    const totalFrete = Math.round(lojas.reduce((s, l) => s + l.frete.valor, 0) * 100) / 100;
    return { ...plano, lojas, totalFrete, total: Math.round((plano.totalProdutos + totalFrete) * 100) / 100 };
  };
  const [finais, finaisPorLoja] = await Promise.all([
    Promise.all(planos.map(confirmarPlano)),
    Promise.all(porLoja.map(confirmarPlano)),
  ]);
  // Depois de confirmar o frete a ordem pode mudar: reordena (e renomeia os melhores carrinhos).
  return Response.json({ planos: rotularPlanos(finais), porLoja: ordenarPorLoja(finaisPorLoja) });
}
