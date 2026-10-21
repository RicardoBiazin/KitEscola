// Navegador real (Edge ou Chrome instalado) para lojas que só respondem a navegador.
// Desliga com KITESCOLA_NAVEGADOR=off. Em hospedagem serverless não há navegador: as lojas
// que dependem dele aparecem como "indisponível".
import type { Browser, BrowserContext } from "playwright-core";
import pLimit from "p-limit";
import { LRUCache } from "lru-cache";
import { USER_AGENT } from "./http";

let contexto: Promise<BrowserContext> | null = null;
const limite = pLimit(3);
const cache = new LRUCache<string, string>({ max: 500, ttl: 60 * 60 * 1000 });

export function navegadorAtivo(): boolean {
  return (process.env.KITESCOLA_NAVEGADOR ?? "auto").toLowerCase() !== "off";
}

async function abrir(): Promise<BrowserContext> {
  const { chromium } = await import("playwright-core");
  let browser: Browser | null = null;
  let ultimoErro: unknown;
  for (const channel of ["msedge", "chrome"]) {
    try {
      browser = await chromium.launch({
        channel,
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      break;
    } catch (e) {
      ultimoErro = e;
    }
  }
  if (!browser) throw new Error(`Edge/Chrome não encontrado: ${String(ultimoErro).slice(0, 120)}`);
  browser.on("disconnected", () => {
    contexto = null;
  });
  return browser.newContext({
    locale: "pt-BR",
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
}

/**
 * HTML da página depois de carregar (espera o seletor, se informado).
 * Se a página casar com `bloqueio` (tela anti-robô), devolve na hora, sem esperar.
 */
export async function htmlPeloNavegador(url: string, seletor?: string, bloqueio?: RegExp): Promise<string> {
  if (!navegadorAtivo()) throw new Error("navegador desligado (KITESCOLA_NAVEGADOR=off)");
  const c = cache.get(url);
  if (c) return c;
  return limite(async () => {
    if (!contexto) contexto = abrir();
    let ctx: BrowserContext;
    try {
      ctx = await contexto;
    } catch (e) {
      contexto = null;
      throw e;
    }
    const pagina = await ctx.newPage();
    try {
      await pagina.route(/\.(png|jpe?g|webp|gif|svg|woff2?|mp4)(\?|$)/i, (r) => r.abort());
      await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!seletor) {
        const html = await pagina.content();
        cache.set(url, html);
        return html;
      }
      // Algumas lojas mostram um desafio em JS que recarrega a página: espera e tenta de novo.
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const esperaSeletor = pagina.waitForSelector(seletor, { timeout: 10000 }).then(() => true, () => false);
        const esperaBloqueio = bloqueio
          ? pagina.waitForFunction((fonte) => new RegExp(fonte, "i").test(document.documentElement.outerHTML), bloqueio.source, { timeout: 10000, polling: 500 }).then(() => false, () => false)
          : new Promise<boolean>(() => {});
        const achou = await Promise.race([esperaSeletor, esperaBloqueio]);
        if (!achou && bloqueio && bloqueio.test(await pagina.content())) return await pagina.content();
        if (achou) {
          const html = await pagina.content();
          cache.set(url, html);
          return html;
        }
        if (tentativa === 0) await pagina.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      }
      return await pagina.content();
    } finally {
      await pagina.close();
    }
  });
}

export async function fecharNavegador() {
  if (contexto) {
    const ctx = await contexto.catch(() => null);
    await ctx?.browser()?.close();
    contexto = null;
  }
}
