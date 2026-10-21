"use client";

import type { Sugestao } from "@/lib/sugestoes/sugerir";

interface Props {
  sugestoes: Sugestao[];
  onAdicionar: (s: Sugestao) => void;
}

export default function Sugestoes({ sugestoes, onAdicionar }: Props) {
  if (sugestoes.length === 0) return null;
  const grupos: { titulo: string; tipo: Sugestao["tipo"] }[] = [
    { titulo: "Você pode ter esquecido", tipo: "esquecido" },
    { titulo: "Itens úteis", tipo: "util" },
  ];
  return (
    <div className="space-y-4" data-testid="sugestoes">
      {grupos.map((g) => {
        const lista = sugestoes.filter((s) => s.tipo === g.tipo);
        if (lista.length === 0) return null;
        return (
          <div key={g.tipo}>
            <h3 className="mb-2 text-sm font-semibold text-suave">{g.titulo}</h3>
            <ul className="space-y-1.5">
              {lista.map((s) => (
                <li key={s.nome} className="flex items-center gap-2 rounded-lg border border-borda bg-cartao px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.quantidade > 1 && <span className="text-suave">{s.quantidade}× </span>}
                      {s.nome}
                    </p>
                    <p className="truncate text-xs text-suave">{s.motivo}</p>
                  </div>
                  <button
                    onClick={() => onAdicionar(s)}
                    className="shrink-0 rounded-md border border-destaque px-2 py-1 text-xs font-medium text-destaque hover:bg-destaque hover:text-destaque-texto"
                    aria-label={`Adicionar ${s.nome}`}
                  >
                    + adicionar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
