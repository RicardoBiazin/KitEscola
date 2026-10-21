"use client";

import { useState } from "react";
import { urlSegura } from "@/lib/entrada";
import type { Frete, ItemLista, Oferta, Plano, StatusLoja } from "@/lib/tipos";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Preço por unidade comprada (um kit com 12 conta 12 unidades). */
const precoUnidade = (o: Oferta) => o.custoItem / (o.anunciosNecessarios * o.unidadesPorAnuncio);

function SeloFrete({ frete }: { frete: Frete }) {
  if (!frete.entrega && frete.retirada)
    return <span className="rounded bg-destaque/15 px-1.5 py-0.5 text-xs text-destaque">retirada na loja</span>;
  if (!frete.entrega) return <span className="rounded bg-erro/15 px-1.5 py-0.5 text-xs text-erro">não entrega</span>;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs ${frete.tipo === "real" ? "bg-ok/15 text-ok" : "bg-alerta/15 text-alerta"}`}
      title={frete.tipo === "real" ? "Frete calculado pela própria loja para o seu CEP" : "Frete estimado: a loja não expõe o cálculo sem login"}
    >
      {frete.tipo === "real" ? "frete real" : "frete estimado"}
    </span>
  );
}

function CartaoPlano({ plano, itens, destaque }: { plano: Plano; itens: ItemLista[]; destaque: boolean }) {
  const nomes = new Map(itens.map((i) => [i.id, i]));
  return (
    <section
      className={`rounded-xl border bg-cartao p-4 ${destaque ? "border-destaque shadow-md" : "border-borda"}`}
      data-testid={`plano-${plano.id}`}
    >
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        {destaque && <span className="rounded bg-destaque px-2 py-0.5 text-xs font-semibold text-destaque-texto">Recomendado</span>}
        <h3 className="text-lg font-semibold">{plano.titulo}</h3>
        <span className="ml-auto text-2xl font-bold" data-testid="total-plano">{brl(plano.total)}</span>
      </header>
      <p className="mb-3 text-sm text-suave">
        Produtos {brl(plano.totalProdutos)} + frete {brl(plano.totalFrete)} · {plano.lojas.length} loja(s)
      </p>
      <div className="space-y-3">
        {plano.lojas.map((l) => (
          <div key={l.lojaId} className="rounded-lg border border-borda">
            <div className="flex flex-wrap items-center gap-2 border-b border-borda px-3 py-2 text-sm">
              <strong>{l.lojaNome}</strong>
              <SeloFrete frete={l.frete} />
              <span className="ml-auto text-suave">
                {brl(l.subtotal)} + {l.frete.retirada && !l.frete.entrega ? "retirada grátis" : `frete ${l.frete.valor === 0 ? "grátis" : brl(l.frete.valor)}`}
                {l.frete.prazo ? ` · ${l.frete.prazo}` : ""}
              </span>
            </div>
            <ul className="divide-y divide-borda">
              {l.itens.map((o) => {
                const item = nomes.get(o.itemId);
                return (
                  <li key={o.itemId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {o.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.imagem} alt="" className="h-10 w-10 shrink-0 rounded object-contain bg-white" loading="lazy" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded bg-borda" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {item && item.quantidade > 1 && <span className="text-suave">{item.quantidade}× </span>}
                        {item?.nome}
                      </p>
                      <a href={urlSegura(o.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-destaque hover:underline" title={o.titulo}>
                        {o.titulo}
                      </a>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{brl(o.custoItem)}</p>
                      <p className="text-xs text-suave">
                        {o.anunciosNecessarios}× {o.unidadesPorAnuncio > 1 ? `kit c/ ${o.unidadesPorAnuncio} de ` : ""}
                        {brl(o.preco)}
                      </p>
                      {(item?.quantidade ?? 1) > 1 && (
                        <p className="text-xs text-suave" data-testid="preco-unidade">
                          {brl(precoUnidade(o))}/un · {o.anunciosNecessarios * o.unidadesPorAnuncio} un.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {l.frete.obs && <p className="border-t border-borda px-3 py-1.5 text-xs text-suave">{l.frete.obs}</p>}
          </div>
        ))}
      </div>
      {plano.itensSemOferta.length > 0 && (
        <p className="mt-3 text-sm text-alerta">
          Sem oferta encontrada: {plano.itensSemOferta.map((id) => nomes.get(id)?.nome).join(", ")}
        </p>
      )}
    </section>
  );
}

/**
 * Frete da coluna. O da busca já é a simulação do carrinho "mais barato de cada item" nesta
 * loja (o mesmo da coluna). A soma do frete por item só é usada se não houver esse valor:
 * ela é um rateio e fica menor que o frete real quando se compra menos itens.
 */
function freteDaColuna(escolhidas: Oferta[], frete: Frete | undefined): Frete | undefined {
  if (frete) return frete;
  if (escolhidas.length > 0 && escolhidas.every((o) => o.freteItem !== undefined)) {
    const soRetirada = escolhidas.every((o) => o.soRetirada);
    const valor = Math.round(escolhidas.reduce((s, o) => s + (o.soRetirada ? 0 : o.freteItem!), 0) * 100) / 100;
    return { valor, tipo: "real", entrega: !soRetirada, retirada: soRetirada || undefined };
  }
  return frete;
}

function TabelaComparativa({
  itens,
  ofertas,
  lojas,
  fretes,
}: {
  itens: ItemLista[];
  ofertas: Oferta[];
  lojas: StatusLoja[];
  fretes: Record<string, Frete>;
}) {
  const colunas = lojas.filter((l) => l.ofertas > 0);
  const melhor = (itemId: string, lojaId: string) =>
    ofertas.filter((o) => o.itemId === itemId && o.lojaId === lojaId).sort((a, b) => a.custoItem - b.custoItem)[0];

  const resumo = colunas.map((l) => {
    const escolhidas = itens.map((i) => melhor(i.id, l.lojaId)).filter((o): o is Oferta => Boolean(o));
    const subtotal = escolhidas.reduce((s, o) => s + o.custoItem, 0);
    const frete = freteDaColuna(escolhidas, fretes[l.lojaId]);
    const atende = frete ? frete.entrega || frete.retirada === true : true;
    const total = Math.round((subtotal + (frete?.valor ?? 0)) * 100) / 100;
    return { lojaId: l.lojaId, itens: escolhidas.length, frete, atende, total };
  });
  const maxItens = Math.max(0, ...resumo.filter((r) => r.atende).map((r) => r.itens));
  const menorTotal = Math.min(...resumo.filter((r) => r.atende && r.itens === maxItens).map((r) => r.total));
  return (
    <div className="overflow-x-auto rounded-xl border border-borda bg-cartao">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-suave">
            <th className="px-3 py-2">Item</th>
            {colunas.map((l) => (
              <th key={l.lojaId} className="px-3 py-2 text-right">{l.lojaNome}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => {
            const precos = colunas.map((l) => melhor(i.id, l.lojaId));
            const menor = Math.min(...precos.filter(Boolean).map((o) => o!.custoItem));
            return (
              <tr key={i.id} className="border-b border-borda last:border-0">
                <td className="px-3 py-2">
                  <span className="text-suave">{i.quantidade}× </span>
                  {i.nome}
                </td>
                {precos.map((o, k) => (
                  <td key={colunas[k].lojaId} className="px-3 py-2 text-right">
                    {o ? (
                      <>
                        <a
                          href={urlSegura(o.url) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={o.titulo}
                          className={`hover:underline ${o.custoItem === menor ? "font-bold text-ok" : ""}`}
                        >
                          {brl(o.custoItem)}
                        </a>
                        {i.quantidade > 1 && (
                          <span className="block text-xs text-suave">
                            {o.unidadesPorAnuncio > 1 ? `kit ${o.unidadesPorAnuncio} · ` : ""}
                            {brl(precoUnidade(o))}/un
                          </span>
                        )}
                        {o.soRetirada && <span className="block text-xs text-suave">só retirada</span>}
                      </>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-borda">
          <tr>
            <td className="px-3 py-2 text-suave">Frete</td>
            {resumo.map((r) => (
              <td key={r.lojaId} className="px-3 py-2 text-right" data-testid={`frete-${r.lojaId}`}>
                {!r.frete ? (
                  <span className="text-suave">—</span>
                ) : !r.frete.entrega && r.frete.retirada ? (
                  <span className="text-destaque">retirada grátis</span>
                ) : !r.frete.entrega ? (
                  <span className="text-erro">não entrega</span>
                ) : (
                  <>
                    <span>{r.frete.valor === 0 ? "grátis" : brl(r.frete.valor)}</span>
                    <span className={`block text-xs ${r.frete.tipo === "real" ? "text-ok" : "text-alerta"}`}>
                      {r.frete.tipo}
                      {r.frete.prazo ? ` · ${r.frete.prazo}` : ""}
                    </span>
                  </>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-t border-borda font-semibold">
            <td className="px-3 py-2">Total na loja</td>
            {resumo.map((r) => (
              <td key={r.lojaId} className="px-3 py-2 text-right" data-testid={`total-${r.lojaId}`}>
                {r.atende ? (
                  <>
                    <span className={r.itens === maxItens && r.total === menorTotal ? "text-ok" : ""}>{brl(r.total)}</span>
                    {r.itens < itens.length && (
                      <span className="block text-xs font-normal text-alerta">
                        {r.itens} de {itens.length} itens
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-suave">—</span>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Ranking "comprar tudo junto": um pedido por loja, com o frete do carrinho inteiro. */
function TudoEmUmaLoja({ porLoja, itens, melhorTotal }: { porLoja: Plano[]; itens: ItemLista[]; melhorTotal?: number }) {
  if (porLoja.length === 0) return <p className="text-suave">Nenhuma loja com ofertas para esta lista.</p>;
  return (
    <div className="space-y-2" data-testid="tudo-em-uma-loja">
      <p className="text-sm text-suave">
        Todos os itens que cada loja tem, num pedido só: um frete por loja, confirmado com o carrinho inteiro.
      </p>
      {porLoja.map((p, i) => {
        const l = p.lojas[0];
        const cobertos = itens.length - p.itensSemOferta.length;
        const diferenca = melhorTotal !== undefined && p.itensSemOferta.length === 0 ? p.total - melhorTotal : undefined;
        return (
          <details key={p.id} className="group rounded-xl border border-borda bg-cartao" data-testid={`loja-unica-${l?.lojaId}`}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="w-5 text-sm text-suave">{i + 1}º</span>
              <strong className="min-w-24">{l?.lojaNome}</strong>
              {l && <SeloFrete frete={l.frete} />}
              <span className={`text-xs ${cobertos < itens.length ? "text-alerta" : "text-suave"}`}>
                {cobertos} de {itens.length} itens
              </span>
              <span className="ml-auto text-right text-sm text-suave">
                {brl(p.totalProdutos)} + frete {p.totalFrete === 0 ? "grátis" : brl(p.totalFrete)}
              </span>
              <span className="w-28 text-right text-lg font-bold">{brl(p.total)}</span>
              {diferenca !== undefined && (
                <span className={`w-full text-right text-xs sm:w-auto ${diferenca <= 0.005 ? "text-ok" : "text-suave"}`}>
                  {diferenca <= 0.005 ? "o mais barato" : `+${brl(diferenca)} que o mais barato`}
                </span>
              )}
            </summary>
            <div className="border-t border-borda p-3">
              <CartaoPlano plano={p} itens={itens} destaque={false} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

interface Props {
  itens: ItemLista[];
  ofertas: Oferta[];
  lojas: StatusLoja[];
  fretes: Record<string, Frete>;
  planos: Plano[] | null;
  porLoja: Plano[] | null;
  otimizando: boolean;
}

const ABAS = [
  { id: "planos", nome: "Melhores carrinhos" },
  { id: "loja", nome: "Tudo em uma loja" },
  { id: "tabela", nome: "Comparar preços" },
] as const;

export default function Resultados({ itens, ofertas, lojas, fretes, planos, porLoja, otimizando }: Props) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("planos");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-borda bg-cartao p-1 text-sm" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`flex-1 rounded-md px-2 py-1.5 ${aba === a.id ? "bg-destaque text-destaque-texto" : "hover:bg-borda"}`}
          >
            {a.nome}
          </button>
        ))}
      </div>
      {aba === "loja" ? (
        otimizando && !porLoja ? (
          <p className="text-suave">Confirmando o frete do carrinho inteiro em cada loja...</p>
        ) : (
          <TudoEmUmaLoja porLoja={porLoja ?? []} itens={itens} melhorTotal={planos?.[0]?.itensSemOferta.length === 0 ? planos[0].total : undefined} />
        )
      ) : aba === "planos" ? (
        otimizando && !planos ? (
          <p className="text-suave">Calculando a melhor combinação e confirmando fretes...</p>
        ) : planos && planos.length > 0 ? (
          <div className="space-y-4">
            {planos.map((p, i) => (
              <CartaoPlano key={p.id} plano={p} itens={itens} destaque={i === 0} />
            ))}
          </div>
        ) : (
          <p className="text-suave">Nenhuma oferta encontrada para esta lista.</p>
        )
      ) : (
        <TabelaComparativa itens={itens} ofertas={ofertas} lojas={lojas} fretes={fretes} />
      )}
    </div>
  );
}
