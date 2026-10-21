// Teste real contra as lojas: busca um termo em cada uma e simula o frete.
// Uso: npm run sonda -- "caderno 10 matérias" 88010000
import { lojasAtivas } from "@/lib/lojas/registro";
import { paraOfertas } from "@/lib/lojas/tipos";
import { filtrarOfertas } from "@/lib/buscar";
import { criarItem } from "@/lib/normalizar";
import { fecharNavegador } from "@/lib/navegador";

const termo = process.argv[2] ?? "caderno 10 matérias";
const cep = process.argv[3] ?? "88010000";
const item = criarItem(termo, 1);

async function main() {
  console.log(`Termo: "${termo}"  CEP: ${cep}\n`);
  const linhas = await Promise.all(
    lojasAtivas().map(async (loja) => {
      const t0 = Date.now();
      try {
        const anuncios = await loja.buscar(termo);
        const ofertas = filtrarOfertas(paraOfertas(loja, item, anuncios));
        let frete = "-";
        if (ofertas[0]) {
          const f = await loja.frete([{ oferta: ofertas[0], quantidade: 1 }], cep);
          frete = f.entrega ? `R$ ${f.valor.toFixed(2)} (${f.tipo}${f.prazo ? ", " + f.prazo : ""})` : f.retirada ? "só retirada (grátis)" : "não entrega";
        }
        const melhor = ofertas[0] ? `R$ ${ofertas[0].custoItem.toFixed(2)} ${ofertas[0].titulo.slice(0, 50)}` : "-";
        return [loja.nome, "ok", `${anuncios.length}/${ofertas.length}`, melhor, frete, `${Date.now() - t0}ms`];
      } catch (e) {
        return [loja.nome, "FALHOU", "", (e instanceof Error ? e.message : String(e)).slice(0, 60), "", `${Date.now() - t0}ms`];
      }
    }),
  );
  console.table(linhas.map(([loja, estado, anuncios, melhor, frete, tempo]) => ({ loja, estado, "anúncios/relevantes": anuncios, melhor, frete, tempo })));
  await fecharNavegador();
}

main();
