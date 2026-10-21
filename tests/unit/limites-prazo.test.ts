import { describe, expect, it } from "vitest";
import { comPrazo, verificarLimites, type Armazem } from "@/lib/limites";

describe("limites: armazenamento que não responde", () => {
  it("comPrazo falha em vez de esperar para sempre", async () => {
    await expect(comPrazo(new Promise(() => {}), 20)).rejects.toThrow("não respondeu");
    await expect(comPrazo(Promise.resolve(7), 20)).resolves.toBe(7);
  });

  it("armazém travado não pendura nem bloqueia: segue sem contar", async () => {
    const travado: Armazem = { ler: () => comPrazo(new Promise(() => {}), 20), gravar: async () => {} };
    delete process.env.KITESCOLA_LOCAL;
    expect(await verificarLimites("buscar", "1.2.3.4", null, Date.now(), travado)).toBe("ok");
  });
});
