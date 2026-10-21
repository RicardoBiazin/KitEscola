import { describe, expect, it } from "vitest";
import { relevancia, RELEVANCIA_MINIMA } from "@/lib/relevancia";

const aceita = (item: string, titulo: string) => relevancia(item, titulo) >= RELEVANCIA_MINIMA;

describe("relevancia", () => {
  it("aceita títulos correspondentes", () => {
    expect(aceita("Caderno 10 matérias", "Caderno Universitário Capa Dura 10 Matérias 160 Folhas")).toBe(true);
    expect(aceita("Caderno 10 matérias", "Caderno Universitário Capa Dura, 10 x 160 Folhas, Brief")).toBe(true);
    expect(aceita("lápis preto nº 2", "Lápis Preto HB Faber-Castell")).toBe(true);
    expect(aceita("borrachas", "Borracha Branca Mercur")).toBe(true);
    expect(aceita("Tesoura sem ponta", "Tesoura Escolar Sem Ponta 13cm Tris")).toBe(true);
    expect(aceita("Cola branca 90g", "Cola Branca Escolar 90 g Tenaz")).toBe(true);
    expect(aceita("Lápis de cor 24 cores", "Lapis de Cor Faber Castell 24 Cores Ecolapis")).toBe(true);
  });

  it("cola bastão escolar não é cola quente", () => {
    expect(aceita("cola bastão", "Bastões de Cola Quente para Pistola 10 Un 7,2x300mm")).toBe(false);
    expect(aceita("cola bastão", "Cola Bastão 10g Tenaz Kit com 12 unidades")).toBe(true);
    expect(aceita("cola quente", "Bastões de Cola Quente para Pistola 10 Un")).toBe(true);
  });

  it("rejeita outro produto", () => {
    expect(aceita("Caderno 10 matérias", "Estojo Para Vinho B.Home 3pç")).toBe(false);
    expect(aceita("Caderno 10 matérias", "Caderno Brochura 96 folhas")).toBe(false);
    expect(aceita("Caderno", "Capa para caderno universitário")).toBe(false);
    expect(aceita("Lápis de cor 24 cores", "Lápis de Cor 12 Cores")).toBe(false);
    expect(aceita("Caderno 10 matérias", "Caderno Universitário Capa Dura, 1x1, 80 folhas, CBF Camisa 10")).toBe(false);
    expect(aceita("Cola branca 90g", "Cola Branca 40g Tenaz")).toBe(false);
  });
});

describe("relevancia: usos que não são escolares", () => {
  it("tesoura de unha não é tesoura sem ponta; mochila não precisa dizer 'escolar'", () => {
    expect(relevancia("tesoura sem ponta", "Tesoura para Unha Mundial Flex Ponta Reta") >= RELEVANCIA_MINIMA).toBe(false);
    expect(relevancia("tesoura sem ponta", "Tesoura Escolar Sem Ponta Tris 13cm") >= RELEVANCIA_MINIMA).toBe(true);
    expect(relevancia("mochila escolar", "Mochila Infantil Rodinhas Unicórnio") >= RELEVANCIA_MINIMA).toBe(true);
    expect(relevancia("lápis de cor", "Lápis Labial Vermelho") >= RELEVANCIA_MINIMA).toBe(false);
  });
});
