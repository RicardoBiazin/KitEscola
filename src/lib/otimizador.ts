// Escolhe em quais lojas comprar cada item minimizando produtos + frete.
// O frete é cobrado uma vez por loja usada, então às vezes vale pagar um item um pouco
// mais caro para não abrir mais uma compra. Busca exaustiva sobre subconjuntos de lojas.
import type { Frete, ItemLista, Oferta, Plano } from "./tipos";

/** Como o frete de uma loja varia com o subtotal: valor fixo, grátis acima de X. */
export interface ModeloFrete {
  lojaNome: string;
  frete: Frete;
  gratisAcima?: number;
}

const MAX_LOJAS = 14;

function freteDoModelo(m: ModeloFrete, subtotal: number, ofertas: Oferta[]): number {
  // Loja conferiu a entrega por oferta: um frete de pacote por vendedor usado.
  if (ofertas.length > 0 && ofertas.every((o) => o.freteItem !== undefined)) {
    const porVendedor = new Map<string, number>();
    for (const o of ofertas) {
      if (o.soRetirada) continue;
      const v = o.ref?.seller ?? "1";
      porVendedor.set(v, Math.max(porVendedor.get(v) ?? 0, o.fretePacote ?? o.freteItem!));
    }
    return Math.round([...porVendedor.values()].reduce((s, x) => s + x, 0) * 100) / 100;
  }
  if (m.gratisAcima !== undefined && subtotal >= m.gratisAcima) return 0;
  if (ofertas.length > 0 && ofertas.every((o) => o.freteGratis)) return 0;
  return m.frete.valor;
}

interface Avaliacao {
  cobertos: number;
  total: number;
  lojasUsadas: number;
  atribuicao: Map<string, Oferta>; // itemId -> oferta
}

function avaliar(itens: ItemLista[], melhores: Map<string, Map<string, Oferta>>, conjunto: string[], modelos: Map<string, ModeloFrete>): Avaliacao {
  const atribuicao = new Map<string, Oferta>();
  const subtotais = new Map<string, Oferta[]>();
  for (const item of itens) {
    const porLoja = melhores.get(item.id);
    if (!porLoja) continue;
    let melhor: Oferta | undefined;
    for (const lojaId of conjunto) {
      const o = porLoja.get(lojaId);
      if (o && (!melhor || o.custoItem < melhor.custoItem)) melhor = o;
    }
    if (melhor) {
      atribuicao.set(item.id, melhor);
      const l = subtotais.get(melhor.lojaId) ?? [];
      l.push(melhor);
      subtotais.set(melhor.lojaId, l);
    }
  }
  let total = 0;
  for (const [lojaId, ofertas] of subtotais) {
    const sub = ofertas.reduce((s, o) => s + o.custoItem, 0);
    total += sub + freteDoModelo(modelos.get(lojaId)!, sub, ofertas);
  }
  return { cobertos: atribuicao.size, total, lojasUsadas: subtotais.size, atribuicao };
}

function montarPlano(id: Plano["id"], titulo: string, itens: ItemLista[], av: Avaliacao, modelos: Map<string, ModeloFrete>): Plano {
  const porLoja = new Map<string, Oferta[]>();
  for (const o of av.atribuicao.values()) {
    const l = porLoja.get(o.lojaId) ?? [];
    l.push(o);
    porLoja.set(o.lojaId, l);
  }
  const lojas = [...porLoja].map(([lojaId, ofertas]) => {
    const m = modelos.get(lojaId)!;
    const subtotal = Math.round(ofertas.reduce((s, o) => s + o.custoItem, 0) * 100) / 100;
    const valor = freteDoModelo(m, subtotal, ofertas);
    const soRetirada = ofertas.every((o) => o.soRetirada);
    const frete = soRetirada
      ? { ...m.frete, valor: 0, entrega: false, retirada: true, obs: "Retirada grátis em loja da região" }
      : { ...m.frete, valor, entrega: true };
    return { lojaId, lojaNome: m.lojaNome, itens: ofertas, subtotal, frete };
  });
  lojas.sort((a, b) => b.subtotal - a.subtotal);
  const totalProdutos = Math.round(lojas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  const totalFrete = Math.round(lojas.reduce((s, l) => s + l.frete.valor, 0) * 100) / 100;
  return {
    id,
    titulo,
    lojas,
    itensSemOferta: itens.filter((i) => !av.atribuicao.has(i.id)).map((i) => i.id),
    totalProdutos,
    totalFrete,
    total: Math.round((totalProdutos + totalFrete) * 100) / 100,
  };
}

/** Melhor = mais itens cobertos; empate = menor total; depois menos lojas. */
function melhorQue(a: Avaliacao, b: Avaliacao | null): boolean {
  if (!b) return true;
  if (a.cobertos !== b.cobertos) return a.cobertos > b.cobertos;
  if (Math.abs(a.total - b.total) > 0.005) return a.total < b.total;
  return a.lojasUsadas < b.lojasUsadas;
}

export function otimizar(
  itens: ItemLista[],
  ofertas: Oferta[],
  modelos: Map<string, ModeloFrete>,
  opcoes: { aceitarRetirada?: boolean } = {},
): Plano[] {
  // Só lojas que entregam no CEP (ou permitem retirada, se o usuário aceitar).
  const atende = (f: Frete) => f.entrega || (opcoes.aceitarRetirada === true && f.retirada === true);
  const validas = ofertas.filter((o) => {
    const m = modelos.get(o.lojaId);
    if (!m) return false;
    // Oferta já conferida pela loja: vale o que ela disse sobre esta oferta.
    if (o.freteItem !== undefined) return !o.soRetirada || opcoes.aceitarRetirada === true;
    return atende(m.frete);
  });
  const melhores = new Map<string, Map<string, Oferta>>();
  for (const o of validas) {
    const porLoja = melhores.get(o.itemId) ?? new Map<string, Oferta>();
    const atual = porLoja.get(o.lojaId);
    if (!atual || o.custoItem < atual.custoItem) porLoja.set(o.lojaId, o);
    melhores.set(o.itemId, porLoja);
  }

  // Limita a quantidade de lojas (2^n): mantém as que cobrem mais itens.
  const cobertura = new Map<string, number>();
  for (const porLoja of melhores.values()) for (const l of porLoja.keys()) cobertura.set(l, (cobertura.get(l) ?? 0) + 1);
  const lojas = [...cobertura.keys()].sort((a, b) => cobertura.get(b)! - cobertura.get(a)!).slice(0, MAX_LOJAS);
  if (lojas.length === 0) return [];

  // Todas as combinações distintas (a mesma escolha de ofertas pode sair de vários conjuntos).
  const candidatas = new Map<string, Avaliacao>();
  for (let mask = 1; mask < 1 << lojas.length; mask++) {
    const conjunto = lojas.filter((_, i) => mask & (1 << i));
    const av = avaliar(itens, melhores, conjunto, modelos);
    const assinatura = [...av.atribuicao.values()].map((o) => `${o.itemId}:${o.lojaId}:${o.url}`).sort().join("|");
    if (!candidatas.has(assinatura)) candidatas.set(assinatura, av);
  }
  const ordenadas = [...candidatas.values()].sort((a, b) => (melhorQue(a, b) ? -1 : melhorQue(b, a) ? 1 : 0));
  const maisBarato = ordenadas[0];

  // Até 3 opções: a mais barata; a com menos lojas; tudo em uma loja; e, se faltar,
  // as próximas mais baratas. Todas cobrindo o máximo de itens possível, quando houver.
  const escolhidas: Avaliacao[] = [maisBarato];
  const adicionar = (av: Avaliacao | undefined) => {
    if (av && escolhidas.length < QTD_PLANOS && !escolhidas.includes(av)) escolhidas.push(av);
  };
  const completas = ordenadas.filter((av) => av.cobertos === maisBarato.cobertos);
  const menosLojas = Math.min(...completas.map((av) => av.lojasUsadas));
  if (menosLojas < maisBarato.lojasUsadas) adicionar(completas.find((av) => av.lojasUsadas === menosLojas));
  adicionar(ordenadas.find((av) => av.lojasUsadas === 1 && av.cobertos === Math.max(...ordenadas.filter((x) => x.lojasUsadas === 1).map((x) => x.cobertos))));
  for (const av of completas) adicionar(av);
  for (const av of ordenadas) adicionar(av);

  return rotularPlanos(escolhidas.map((av, i) => montarPlano(`opcao-${i + 1}`, "", itens, av, modelos)));
}

const QTD_PLANOS = 3;

/**
 * "Comprar tudo junto": um carrinho por loja com todos os itens que ela tem, frete de um
 * pedido só. Ordenado por mais itens cobertos e, depois, menor total.
 */
export function planosPorLoja(
  itens: ItemLista[],
  ofertas: Oferta[],
  modelos: Map<string, ModeloFrete>,
  opcoes: { aceitarRetirada?: boolean } = {},
): Plano[] {
  const lojas = [...new Set(ofertas.map((o) => o.lojaId))];
  const planos: Plano[] = [];
  for (const lojaId of lojas) {
    const m = modelos.get(lojaId);
    if (!m) continue;
    const daLoja = ofertas.filter((o) => {
      if (o.lojaId !== lojaId) return false;
      if (o.freteItem !== undefined) return !o.soRetirada || opcoes.aceitarRetirada === true;
      return m.frete.entrega || (opcoes.aceitarRetirada === true && m.frete.retirada === true);
    });
    if (daLoja.length === 0) continue;
    const melhores = new Map<string, Map<string, Oferta>>();
    for (const o of daLoja) {
      const atual = melhores.get(o.itemId)?.get(lojaId);
      if (!atual || o.custoItem < atual.custoItem) melhores.set(o.itemId, new Map([[lojaId, o]]));
    }
    const av = avaliar(itens, melhores, [lojaId], modelos);
    planos.push({ ...montarPlano(`loja-${lojaId}`, `Tudo na ${m.lojaNome}`, itens, av, modelos), id: `loja-${lojaId}` });
  }
  return ordenarPorLoja(planos);
}

export function ordenarPorLoja(planos: Plano[]): Plano[] {
  return [...planos].sort((a, b) => a.itensSemOferta.length - b.itensSemOferta.length || a.total - b.total);
}

/**
 * Ordena (mais itens cobertos, depois menor total) e dá nome a cada opção.
 * Usado de novo depois que o frete é reconfirmado, porque a ordem pode mudar.
 */
export function rotularPlanos(planos: Plano[]): Plano[] {
  const ordenados = [...planos].sort((a, b) => a.itensSemOferta.length - b.itensSemOferta.length || a.total - b.total);
  const lojasDoMelhor = ordenados[0]?.lojas.length ?? 0;
  return ordenados.map((p, i) => {
    let titulo: string;
    if (i === 0) titulo = "Mais barato no total";
    else if (p.lojas.length === 1) titulo = `Tudo na ${p.lojas[0].lojaNome}`;
    else if (p.lojas.length < lojasDoMelhor) titulo = `Só ${p.lojas.length} lojas`;
    else titulo = `${i + 1}ª opção`;
    return { ...p, id: i === 0 ? "mais-barato" : `opcao-${i + 1}`, titulo };
  });
}
