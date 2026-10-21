"use client";

// Widget do Cloudflare Turnstile ("não sou um robô", quase sempre sem clique).
// Só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY está definida.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, op: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onloadTurnstileKit?: () => void;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileKit";

export interface TurnstileRef {
  /** Pede um novo token (cada token vale para uma busca só). */
  renovar: () => void;
}

interface Props {
  onToken: (token: string | null) => void;
}

const Turnstile = forwardRef<TurnstileRef, Props>(function Turnstile({ onToken }, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const aoToken = useRef(onToken);
  aoToken.current = onToken;

  useImperativeHandle(ref, () => ({
    renovar: () => {
      aoToken.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const desenhar = () => {
      if (!caixa.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(caixa.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: "pt-br",
        theme: "auto",
        size: "flexible",
        callback: (t: string) => aoToken.current(t),
        "expired-callback": () => aoToken.current(null),
        "error-callback": () => aoToken.current(null),
      });
    };
    if (window.turnstile) desenhar();
    else {
      window.onloadTurnstileKit = desenhar;
      if (!document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile"]`)) {
        const s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
    }
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={caixa} className="mb-3 min-h-[65px]" data-testid="turnstile" />;
});

export default Turnstile;
