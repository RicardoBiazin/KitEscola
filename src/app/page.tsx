"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ListaEditor from "@/components/ListaEditor";
import Sugestoes from "@/components/Sugestoes";
import Resultados from "@/components/Resultados";
import Turnstile, { TURNSTILE_SITE_KEY, type TurnstileRef } from "@/components/Turnstile";
import type { EventoBusca, Frete, ItemLista, Oferta, Plano, StatusLoja } from "@/lib/tipos";
import { criarItem } from "@/lib/normalizar";
import { SERIES, sugerir, type Serie } from "@/lib/sugestoes/sugerir";
import { VERSAO } from "@/lib/versao";

const CHAVE = "kitescola:v1";

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}

export default function Inicio() {
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [cep, setCep] = useState("");
  const [serie, setSerie] = useState<Serie | "">("");
  const [aceitarRetirada, setAceitarRetirada] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const [buscando, setBuscando] = useState(false);
  const [lojasBusca, setLojasBusca] = useState<{ id: string; nome: string }[]>([]);
  const [status, setStatus] = useState<StatusLoja[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [fretesLoja, setFretesLoja] = useState<Record<string, Frete>>({});
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [porLoja, setPorLoja] = useState<Plano[] | null>(null);
  const [otimizando, setOtimizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itensBusca, setItensBusca] = useState<ItemLista[]>([]);
  const resultados = useRef<HTMLDivElement>(null);
  const desafio = useRef<TurnstileRef>(null);
  const [tokenDesafio, setTokenDesafio] = useState<string | null>(null);

  useEffect(() => {
    const s = ler(CHAVE, { itens: [] as ItemLista[], cep: "", serie: "" as Serie | "", aceitarRetirada: false });
    setItens(s.itens ?? []);
    setCep(s.cep ?? "");
    setSerie(s.serie ?? "");
    setAceitarRetirada(s.aceitarRetirada === true);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ itens, cep, serie, aceitarRetirada }));
    } catch {
      /* sem armazenamento: segue sem lembrar a lista */
    }
  }, [itens, cep, serie, aceitarRetirada, carregado]);

  const sugestoes = useMemo(() => sugerir(itens, serie), [itens, serie]);
  const cepLimpo = cep.replace(/\D/g, "");
  const precisaDesafio = Boolean(TURNSTILE_SITE_KEY);
  const podeBuscar = itens.length > 0 && cepLimpo.length === 8 && !buscando && (!precisaDesafio || Boolean(tokenDesafio));

  const buscar = async () => {
    setErro(null);
    setBuscando(true);
    setStatus([]);
    setOfertas([]);
    setFretesLoja({});
    setPlanos(null);
    setPorLoja(null);
    setLojasBusca([]);
    const lista = itens.filter((i) => i.nome.trim());
    setItensBusca(lista);
    setTimeout(() => resultados.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const todas: Oferta[] = [];
    const fretes: Record<string, Frete> = {};
    let passe = "";
    // O token do desafio vale para uma busca só: já pede o próximo.
    const turnstile = tokenDesafio;
    desafio.current?.renovar();
    try {
      const r = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: lista, cep: cepLimpo, turnstile }),
      });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).erro ?? `Erro ${r.status}`);
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const e = JSON.parse(linha) as EventoBusca;
          if (e.tipo === "passe") passe = e.passe;
          else if (e.tipo === "inicio") setLojasBusca(e.lojas);
          else if (e.tipo === "ofertas") {
            todas.push(...e.ofertas);
            setOfertas([...todas]);
          } else if (e.tipo === "frete") {
            fretes[e.lojaId] = e.frete;
            setFretesLoja({ ...fretes });
          }
          else if (e.tipo === "loja") setStatus((s) => [...s.filter((x) => x.lojaId !== e.status.lojaId), e.status]);
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setBuscando(false);
      return;
    }
    setBuscando(false);

    if (todas.length === 0) {
      setPlanos([]);
      setPorLoja([]);
      return;
    }
    setOtimizando(true);
    try {
      const r = await fetch("/api/otimizar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kitescola-passe": passe },
        body: JSON.stringify({ itens: lista, ofertas: todas, fretes, cep: cepLimpo, aceitarRetirada }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      setPlanos(j.planos);
      setPorLoja(j.porLoja ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOtimizando(false);
    }
  };

  // Passe para importar planilha (a planilha chega antes da busca): usa o desafio resolvido, um por vez.
  const obterPasse = async (): Promise<string> => {
    if (!precisaDesafio) return "";
    if (!tokenDesafio) throw new Error("Aguarde a verificação anti-robô e tente de novo.");
    const turnstile = tokenDesafio;
    desafio.current?.renovar();
    const r = await fetch("/api/passe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstile }),
    });
    const j = (await r.json().catch(() => ({}))) as { passe?: string; erro?: string };
    if (!r.ok || !j.passe) throw new Error(j.erro ?? `Erro ${r.status}`);
    return j.passe;
  };

  const concluidas = status.length;
  const total = lojasBusca.length;

  return (
    <main className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Kit<span className="text-destaque">Escola</span>
        </h1>
        <p className="mt-1 text-suave">
          Informe a lista de material escolar: buscamos o menor preço em várias lojas, somamos o frete para o seu CEP e
          montamos o carrinho mais barato.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-xl border border-borda bg-cartao/60 p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-semibold">1. Lista de materiais</h2>
          <ListaEditor itens={itens} onChange={setItens} obterPasse={obterPasse} />
        </section>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border border-borda bg-cartao/60 p-4 sm:p-5">
            <h2 className="mb-4 text-lg font-semibold">2. Entrega e série</h2>
            <label className="mb-1 block text-sm text-suave" htmlFor="cep">CEP de entrega</label>
            <input
              id="cep"
              inputMode="numeric"
              placeholder="00000-000"
              value={cep}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                setCep(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
              }}
              className="mb-2 w-full rounded-lg border border-borda bg-cartao px-3 py-2 outline-none focus:border-destaque"
            />
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aceitarRetirada} onChange={(e) => setAceitarRetirada(e.target.checked)} />
              Aceito retirar na loja (grátis), quando não houver entrega
            </label>
            <label className="mb-1 block text-sm text-suave" htmlFor="serie">Série (para sugestões)</label>
            <select
              id="serie"
              value={serie}
              onChange={(e) => setSerie(e.target.value as Serie | "")}
              className="mb-5 w-full rounded-lg border border-borda bg-cartao px-3 py-2 outline-none focus:border-destaque"
            >
              <option value="">Não informar</option>
              {SERIES.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
            <Turnstile ref={desafio} onToken={setTokenDesafio} />
            <button
              onClick={buscar}
              disabled={!podeBuscar}
              className="w-full rounded-lg bg-destaque px-4 py-3 font-semibold text-destaque-texto hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {buscando ? "Buscando..." : "🔎 Buscar menores preços"}
            </button>
            {!podeBuscar && !buscando && (
              <p className="mt-2 text-xs text-suave">
                {itens.length === 0
                  ? "Adicione itens à lista."
                  : cepLimpo.length !== 8
                    ? "Informe um CEP com 8 dígitos."
                    : "Aguarde a verificação anti-robô acima."}
              </p>
            )}
          </section>

          {sugestoes.length > 0 && (
            <section className="rounded-xl border border-borda bg-cartao/60 p-4 sm:p-5">
              <h2 className="mb-4 text-lg font-semibold">Sugestões</h2>
              <Sugestoes sugestoes={sugestoes} onAdicionar={(s) => setItens([...itens, criarItem(s.nome, s.quantidade)])} />
            </section>
          )}
        </aside>
      </div>

      <div ref={resultados} className="mt-10 scroll-mt-4">
        {(buscando || status.length > 0 || erro) && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">3. Resultado</h2>
            {erro && <p className="rounded-lg border border-erro/40 bg-erro/10 px-3 py-2 text-sm text-erro">{erro}</p>}

            {total > 0 && (
              <div className="rounded-xl border border-borda bg-cartao p-4">
                <div className="mb-2 flex justify-between text-sm">
                  <span>Lojas consultadas</span>
                  <span className="text-suave">{concluidas}/{total}</span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-borda">
                  <div className="h-full bg-destaque transition-all" style={{ width: `${total ? (concluidas / total) * 100 : 0}%` }} />
                </div>
                <div className="flex flex-wrap gap-1.5" data-testid="status-lojas">
                  {lojasBusca.map((l) => {
                    const s = status.find((x) => x.lojaId === l.id);
                    const cor = !s
                      ? "border-borda text-suave"
                      : s.estado === "ok"
                        ? s.ofertas > 0
                          ? "border-ok/50 text-ok"
                          : "border-borda text-suave"
                        : s.estado === "bloqueada"
                          ? "border-alerta/50 text-alerta"
                          : "border-erro/50 text-erro";
                    const rotulo = !s ? "…" : s.estado === "ok" ? `${s.ofertas}` : s.estado === "bloqueada" ? "bloqueada" : "indisponível";
                    return (
                      <span key={l.id} className={`rounded-full border px-2.5 py-0.5 text-xs ${cor}`} title={s?.mensagem}>
                        {l.nome} · {rotulo}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {!buscando && status.length > 0 && (
              <Resultados itens={itensBusca} ofertas={ofertas} lojas={status} fretes={fretesLoja} planos={planos} porLoja={porLoja} otimizando={otimizando} />
            )}
          </section>
        )}
      </div>

      <footer className="mt-16 border-t border-borda pt-4 text-xs text-suave">
        KitEscola v{VERSAO} · Preços e fretes consultados nas lojas no momento da busca; confira no site da loja antes de
        comprar. Frete “estimado” = a loja não permite calcular sem login.
      </footer>
    </main>
  );
}
