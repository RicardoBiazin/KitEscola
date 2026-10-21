import { expect, test } from "@playwright/test";
import path from "node:path";

test("importa planilha, recebe sugestões, busca e mostra o carrinho", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByTestId("upload-planilha").setInputFiles(path.join(__dirname, "..", "..", "exemplos", "lista-5ano.xlsx"));
  await expect(page.getByText("10 item(ns) importados")).toBeVisible();
  await expect(page.getByTestId("lista-itens").locator("li")).toHaveCount(10);

  // Item digitado
  await page.getByPlaceholder("Ex.: Caderno 10 matérias").fill("Estojo");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByTestId("lista-itens").locator("li")).toHaveCount(11);

  // Sugestões pela série
  await page.getByLabel("Série (para sugestões)").selectOption("fundamental2");
  const sugestoes = page.getByTestId("sugestoes");
  await expect(sugestoes.getByText("Compasso")).toBeVisible();
  await sugestoes.getByRole("button", { name: "Adicionar Compasso" }).click();
  await expect(page.getByTestId("lista-itens").locator("li")).toHaveCount(12);
  await expect(sugestoes.getByText("Compasso")).toHaveCount(0);

  await page.getByLabel("CEP de entrega").fill("88010000");
  await expect(page.getByLabel("CEP de entrega")).toHaveValue("88010-000");
  await page.getByRole("button", { name: /Buscar menores preços/ }).click();

  const plano = page.getByTestId("plano-mais-barato");
  await expect(plano).toBeVisible({ timeout: 30_000 });
  await expect(plano.getByText("Recomendado")).toBeVisible();
  await expect(page.getByTestId("status-lojas")).toContainText("Loja A");
  const total = await plano.getByTestId("total-plano").innerText();
  expect(total).toMatch(/R\$\s?\d+,\d{2}/);

  // Sempre 3 opções de carrinho
  await expect(page.locator("[data-testid^=plano-]")).toHaveCount(3);
  await expect(page.getByTestId("plano-opcao-2")).toBeVisible();
  await expect(page.getByTestId("plano-opcao-3")).toBeVisible();

  // Tudo em uma loja: as 3 lojas simuladas, com total e frete do pedido inteiro
  await page.getByRole("tab", { name: "Tudo em uma loja" }).click();
  await expect(page.getByTestId("tudo-em-uma-loja").locator("details")).toHaveCount(3);
  await expect(page.getByTestId("loja-unica-loja-b")).toContainText(/R\$\s?\d+,\d{2}/);

  await page.getByRole("tab", { name: "Comparar preços" }).click();
  await expect(page.locator("table")).toContainText("Compasso");
  await expect(page.locator("table thead th")).toHaveCount(4); // Item + 3 lojas
  // Frete e total por loja
  await expect(page.getByTestId("frete-loja-b")).toContainText("R$");
  await expect(page.getByTestId("frete-loja-c")).toContainText("grátis");
  await expect(page.getByTestId("total-loja-a")).toContainText(/R\$\s?\d+,\d{2}/);

  // A lista fica salva no navegador
  await page.reload();
  await expect(page.getByTestId("lista-itens").locator("li")).toHaveCount(12);
});

test("cola a lista inteira", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Colar lista inteira/ }).click();
  await page.getByLabel("Lista colada").fill("2 cadernos brochura\nlápis preto - 4\ncola branca (2)");
  await page.getByRole("button", { name: "Adicionar itens" }).click();
  const itens = page.getByTestId("lista-itens").locator("li");
  await expect(itens).toHaveCount(3);
  await expect(itens.nth(1).getByLabel(/Quantidade de/)).toHaveValue("4");
});
