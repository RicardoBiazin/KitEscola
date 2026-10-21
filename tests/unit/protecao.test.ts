import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conferirPasse, emitirPasse, ipDe, modoLocal, partesDoPasse, protecaoFaltando, verificarTurnstile } from "@/lib/protecao";

const VARS = ["TURNSTILE_SECRET_KEY", "KITESCOLA_SEGREDO", "KITESCOLA_LOCAL", "NETLIFY", "KITESCOLA_EXIGIR_TURNSTILE", "AWS_LAMBDA_FUNCTION_NAME", "LAMBDA_TASK_ROOT", "AWS_EXECUTION_ENV"];

function configurarOnline() {
  process.env.TURNSTILE_SECRET_KEY = "segredo-turnstile";
  process.env.KITESCOLA_SEGREDO = "segredo-hmac-de-teste";
}

describe("protecao (padrão: exigida)", () => {
  beforeEach(() => {
    for (const v of VARS) delete process.env[v];
    configurarOnline();
  });
  afterEach(() => {
    for (const v of VARS) delete process.env[v];
    vi.restoreAllMocks();
  });

  it("passe vale para o mesmo IP dentro do prazo", () => {
    const agora = 1_000_000;
    const passe = emitirPasse("1.2.3.4", agora);
    expect(conferirPasse(passe, "1.2.3.4", agora + 60_000)).toBe(true);
    expect(conferirPasse(passe, "5.6.7.8", agora + 60_000)).toBe(false); // outro IP
    expect(conferirPasse(passe, "1.2.3.4", agora + 11 * 60_000)).toBe(false); // expirado
  });

  it("passe tem nonce único e formato de três partes", () => {
    const a = emitirPasse("1.2.3.4");
    const b = emitirPasse("1.2.3.4");
    expect(a.split(".")).toHaveLength(3);
    expect(partesDoPasse(a)?.nonce).not.toBe(partesDoPasse(b)?.nonce);
  });

  it("passe adulterado, sem partes certas ou ausente é recusado", () => {
    const passe = emitirPasse("1.2.3.4");
    const [exp, nonce, sig] = passe.split(".");
    expect(conferirPasse(`${Number(exp) + 999999}.${nonce}.${sig}`, "1.2.3.4")).toBe(false);
    expect(conferirPasse(`${exp}.${nonce}x.${sig}`, "1.2.3.4")).toBe(false);
    expect(conferirPasse(`${exp}.${nonce}.x${sig.slice(1)}`, "1.2.3.4")).toBe(false);
    expect(conferirPasse(`${passe}.extra`, "1.2.3.4")).toBe(false);
    expect(conferirPasse(`${exp}.${sig}`, "1.2.3.4")).toBe(false);
    expect(conferirPasse(null, "1.2.3.4")).toBe(false);
    expect(conferirPasse(undefined, "1.2.3.4")).toBe(false);
    expect(conferirPasse("lixo", "1.2.3.4")).toBe(false);
  });

  it("confere o token do Turnstile com a Cloudflare", async () => {
    const fetchFalso = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await verificarTurnstile("x".repeat(40), "1.2.3.4")).toEqual({ ok: true });
    const corpo = String((fetchFalso.mock.calls[0][1] as RequestInit).body);
    expect(corpo).toContain("secret=segredo-turnstile");
    expect(corpo).toContain("remoteip=1.2.3.4");

    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] })));
    expect(await verificarTurnstile("x".repeat(40), "1.2.3.4")).toEqual({ ok: false, motivo: "timeout-or-duplicate" });
    expect((await verificarTurnstile(undefined, "1.2.3.4")).ok).toBe(false);
  });

  it("sem TURNSTILE_SECRET_KEY a proteção falha fechada (não deixa passar)", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchFalso = vi.spyOn(globalThis, "fetch");
    expect(modoLocal()).toBe(false);
    expect(protecaoFaltando()).toBe(true);
    expect(await verificarTurnstile("x".repeat(40), "1.2.3.4")).toEqual({ ok: false, motivo: "proteção não configurada" });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(conferirPasse(undefined, "1.2.3.4")).toBe(false);
  });

  it("sem KITESCOLA_SEGREDO também falha fechada, e o passe não é emitido", () => {
    delete process.env.KITESCOLA_SEGREDO;
    expect(protecaoFaltando()).toBe(true);
    expect(() => emitirPasse("1.2.3.4")).toThrow();
  });

  it("KITESCOLA_EXIGIR_TURNSTILE=0 não abre nada: o padrão é exigir", () => {
    process.env.KITESCOLA_EXIGIR_TURNSTILE = "0";
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(protecaoFaltando()).toBe(true);
  });

  it("com as chaves configuradas a proteção está completa", () => {
    expect(protecaoFaltando()).toBe(false);
  });

  it("KITESCOLA_LOCAL=1 (uso no computador) desliga a verificação e o passe", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.KITESCOLA_SEGREDO;
    process.env.KITESCOLA_LOCAL = "1";
    const fetchFalso = vi.spyOn(globalThis, "fetch");
    expect(modoLocal()).toBe(true);
    expect(protecaoFaltando()).toBe(false);
    expect(await verificarTurnstile(undefined, "local")).toEqual({ ok: true });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(conferirPasse(undefined, "local")).toBe(true);
    expect(emitirPasse("local")).toMatch(/\./);
  });

  it("KITESCOLA_LOCAL é ignorado quando NETLIFY está definido", () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.KITESCOLA_LOCAL = "1";
    process.env.NETLIFY = "true";
    expect(modoLocal()).toBe(false);
    expect(protecaoFaltando()).toBe(true);
  });

  it("KITESCOLA_LOCAL é ignorado dentro da função (Lambda), mesmo sem NETLIFY", () => {
    // Regressão de 21/10/2026: o .env.local foi junto para a função e NETLIFY não existe em tempo de execução.
    for (const lambda of ["AWS_LAMBDA_FUNCTION_NAME", "LAMBDA_TASK_ROOT", "AWS_EXECUTION_ENV"]) {
      delete process.env.TURNSTILE_SECRET_KEY;
      process.env.KITESCOLA_LOCAL = "1";
      process.env[lambda] = "x";
      expect(modoLocal()).toBe(false);
      expect(protecaoFaltando()).toBe(true);
      delete process.env[lambda];
    }
  });

  it("IP vem do cabeçalho da Netlify, que o visitante não forja", () => {
    const req = new Request("https://x", { headers: { "x-nf-client-connection-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" } });
    expect(ipDe(req)).toBe("9.9.9.9");
  });

  it("fora da Netlify, usa os cabeçalhos de proxy como antes", () => {
    expect(ipDe(new Request("https://x", { headers: { "x-forwarded-for": "2.2.2.2, 3.3.3.3" } }))).toBe("2.2.2.2");
    expect(ipDe(new Request("https://x", { headers: { "cf-connecting-ip": "4.4.4.4" } }))).toBe("4.4.4.4");
  });

  it("na Netlify, cabeçalhos forjáveis são ignorados sem o IP da Netlify", () => {
    process.env.NETLIFY = "true";
    const forjado = new Request("https://x", { headers: { "x-forwarded-for": "2.2.2.2", "cf-connecting-ip": "4.4.4.4" } });
    expect(ipDe(forjado)).toBe("desconhecido");
    const real = new Request("https://x", { headers: { "x-nf-client-connection-ip": "9.9.9.9", "x-forwarded-for": "2.2.2.2" } });
    expect(ipDe(real)).toBe("9.9.9.9");
  });
});
