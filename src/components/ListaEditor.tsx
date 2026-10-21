"use client";

import { useRef, useState } from "react";
import type { ItemLista } from "@/lib/tipos";
import { criarItem, interpretarTexto } from "@/lib/normalizar";

interface Props {
  itens: ItemLista[];
  onChange: (itens: ItemLista[]) => void;
  /** Passe da proteção anti-robô para importar (a página pede com o desafio resolvido). */
  obterPasse: () => Promise<string>;
}

export default function ListaEditor({ itens, onChange, obterPasse }: Props) {
  const [novo, setNovo] = useState("");
  const [qtd, setQtd] = useState(1);
  const [colar, setColar] = useState("");
  const [modoColar, setModoColar] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const adicionar = () => {
    if (!novo.trim()) return;
    onChange([...itens, criarItem(novo, qtd)]);
    setNovo("");
    setQtd(1);
  };

  const adicionarColados = () => {
    const lidos = interpretarTexto(colar);
    if (lidos.length === 0) return;
    onChange([...itens, ...lidos]);
    setMsg({ tipo: "ok", texto: `${lidos.length} item(ns) adicionados.` });
    setColar("");
    setModoColar(false);
  };

  const importar = async (f: File) => {
    setEnviando(true);
    setMsg(null);
    try {
      const passe = await obterPasse();
      const form = new FormData();
      form.append("arquivo", f);
      const r = await fetch("/api/importar", { method: "POST", headers: { "x-kitescola-passe": passe }, body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Falha ao importar");
      onChange([...itens, ...j.itens]);
      setMsg({ tipo: "ok", texto: `${j.itens.length} item(ns) importados de ${f.name}.` });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  };

  const alterar = (id: string, parte: Partial<ItemLista>) =>
    onChange(itens.map((i) => (i.id === id ? { ...i, ...parte } : i)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-borda bg-cartao px-3 py-2 outline-none focus:border-destaque"
          placeholder="Ex.: Caderno 10 matérias"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
          aria-label="Nome do item"
        />
        <input
          type="number"
          min={1}
          className="w-20 rounded-lg border border-borda bg-cartao px-3 py-2 outline-none focus:border-destaque"
          value={qtd}
          onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
          aria-label="Quantidade"
        />
        <button onClick={adicionar} className="rounded-lg bg-destaque px-4 py-2 font-medium text-destaque-texto hover:opacity-90">
          Adicionar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => setModoColar(!modoColar)} className="rounded-lg border border-borda px-3 py-1.5 hover:border-destaque">
          📋 Colar lista inteira
        </button>
        <button
          onClick={() => arquivo.current?.click()}
          disabled={enviando}
          className="rounded-lg border border-borda px-3 py-1.5 hover:border-destaque disabled:opacity-50"
        >
          📎 {enviando ? "Importando..." : "Anexar planilha (XLSX/CSV)"}
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".xlsx,.xls,.ods,.csv,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
          data-testid="upload-planilha"
        />
        {itens.length > 0 && (
          <button onClick={() => onChange([])} className="ml-auto rounded-lg px-3 py-1.5 text-suave hover:text-erro">
            Limpar lista
          </button>
        )}
      </div>

      {modoColar && (
        <div className="space-y-2">
          <textarea
            className="h-40 w-full rounded-lg border border-borda bg-cartao p-3 font-mono text-sm outline-none focus:border-destaque"
            placeholder={"Um item por linha, por exemplo:\n2 cadernos brochura 96 folhas\nlápis preto - 4\n1 tesoura sem ponta\ncola branca 90g (2)"}
            value={colar}
            onChange={(e) => setColar(e.target.value)}
            aria-label="Lista colada"
          />
          <button onClick={adicionarColados} className="rounded-lg bg-destaque px-4 py-2 text-sm font-medium text-destaque-texto">
            Adicionar itens
          </button>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.tipo === "ok" ? "text-ok" : "text-erro"}`}>{msg.texto}</p>}

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda p-6 text-center text-suave">
          Nenhum item ainda. Digite acima, cole a lista da escola ou anexe uma planilha.
        </p>
      ) : (
        <ul className="divide-y divide-borda rounded-lg border border-borda bg-cartao" data-testid="lista-itens">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2">
              <input
                type="number"
                min={1}
                value={i.quantidade}
                onChange={(e) => alterar(i.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 rounded border border-borda bg-transparent px-2 py-1 text-sm"
                aria-label={`Quantidade de ${i.nome}`}
              />
              <input
                value={i.nome}
                onChange={(e) => alterar(i.id, { nome: e.target.value })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 hover:border-borda focus:border-destaque"
                aria-label="Nome do item"
              />
              <button
                onClick={() => onChange(itens.filter((x) => x.id !== i.id))}
                className="rounded px-2 text-suave hover:text-erro"
                aria-label={`Remover ${i.nome}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
