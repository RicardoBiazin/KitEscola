import { lerCorpoLimitado } from "@/lib/entrada";
import { importarPlanilha } from "@/lib/importar";
import { verificarLimites } from "@/lib/limites";
import { conferirPasse, ipDe, protecaoFaltando } from "@/lib/protecao";

export const runtime = "nodejs";

const LIMITE_BYTES = 5 * 1024 * 1024;
// Folga para os cabeçalhos e a borda do formulário multipart.
const FOLGA_FORMULARIO = 64 * 1024;

export async function POST(req: Request) {
  const passe = req.headers.get("x-kitescola-passe");
  const ip = ipDe(req);
  if (protecaoFaltando() || !conferirPasse(passe, ip)) {
    return Response.json({ erro: "Sessão expirada. Recarregue a página e envie a planilha de novo." }, { status: 403 });
  }
  const limite = await verificarLimites("importar", ip, passe);
  if (limite === "indisponivel") return Response.json({ erro: "Serviço temporariamente indisponível. Tente de novo." }, { status: 503 });
  if (limite === "excedido") return Response.json({ erro: "Muitas importações em pouco tempo. Aguarde um pouco." }, { status: 429 });

  // Confere o tamanho antes de montar o formulário: o corpo além do limite nem é guardado.
  const corpo = await lerCorpoLimitado(req, LIMITE_BYTES + FOLGA_FORMULARIO);
  if (!corpo) return Response.json({ erro: "Arquivo maior que 5 MB." }, { status: 413 });
  const form = await new Response(new Blob([corpo]), { headers: { "content-type": req.headers.get("content-type") ?? "" } })
    .formData()
    .catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return Response.json({ erro: "Envie o arquivo no campo 'arquivo'." }, { status: 400 });
  if (arquivo.size > LIMITE_BYTES) return Response.json({ erro: "Arquivo maior que 5 MB." }, { status: 413 });
  try {
    const itens = importarPlanilha(await arquivo.arrayBuffer(), arquivo.name);
    if (itens.length === 0) return Response.json({ erro: "Nenhum item encontrado na planilha." }, { status: 422 });
    return Response.json({ itens: itens.slice(0, 200) });
  } catch (e) {
    console.warn("importar: planilha não lida:", e instanceof Error ? e.message : String(e));
    return Response.json({ erro: "Não consegui ler a planilha. Use XLSX, XLS, ODS ou CSV." }, { status: 422 });
  }
}
