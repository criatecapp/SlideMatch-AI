import { test, expect } from "@playwright/test";

// Arrastar/redimensionar um slot no Template Editor de verdade (mouse real
// do Playwright, sem simular evento sintético) e confirmar que: os campos
// numéricos refletem o novo x/y/w/h, e o que é salvo no backend bate com o
// que apareceu na tela — a UI e o dado persistido nunca podem divergir.
//
// Move e redimensiona por deltas pequenos (calculados a partir do tamanho
// real do container, não um valor de pixel chutado) pra nunca esbarrar nos
// clamps de "não deixar sair do canvas" — esses clamps são comportamento
// correto, não o que este teste quer exercitar.

const runId = Date.now();
const email = `e2e-dnd-${runId}@example.com`;
const password = "senha-teste-123";

test("arrastar um slot move sua posição, e redimensionar muda seu tamanho — refletido nos campos e persistido", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Não tem conta? Criar uma").click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  await page.getByRole("link", { name: "Templates" }).click();
  await page.getByRole("button", { name: "Novo template" }).click();
  await expect(page).toHaveURL(/\/templates\/.+/, { timeout: 10_000 });

  await page.getByRole("button", { name: "+ Novo layout" }).click();
  await page.getByRole("button", { name: "+ Slot" }).click();

  const container = page.getByTestId("layout-slot-editor");
  const box = page.locator('[data-testid^="slot-box-"]').first();
  await expect(box).toBeVisible();

  const xInput = page.locator("label", { hasText: "x %" }).locator("input");
  const yInput = page.locator("label", { hasText: "y %" }).locator("input");
  const wInput = page.locator("label", { hasText: "largura %" }).locator("input");
  const hInput = page.locator("label", { hasText: "altura %" }).locator("input");

  const beforeX = Number(await xInput.inputValue());
  const beforeY = Number(await yInput.inputValue());
  const beforeW = Number(await wInput.inputValue());
  const beforeH = Number(await hInput.inputValue());

  const containerBox = (await container.boundingBox())!;
  const pxPerPctX = containerBox.width / 100;
  const pxPerPctY = containerBox.height / 100;
  const moveDeltaPct = 3; // bem menor que o headroom (100 - x - w = 10%)

  // Arrasta o corpo do slot (move) por um delta pequeno e conhecido
  const boxBox = (await box.boundingBox())!;
  await page.mouse.move(boxBox.x + boxBox.width / 2, boxBox.y + boxBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxBox.x + boxBox.width / 2 + moveDeltaPct * pxPerPctX, boxBox.y + boxBox.height / 2 + moveDeltaPct * pxPerPctY, { steps: 10 });
  await page.mouse.up();

  const afterMoveX = Number(await xInput.inputValue());
  const afterMoveY = Number(await yInput.inputValue());
  expect(afterMoveX).toBeGreaterThan(beforeX);
  expect(afterMoveY).toBeGreaterThan(beforeY);
  // Tamanho não muda ao mover
  expect(Number(await wInput.inputValue())).toBeCloseTo(beforeW, 0);
  expect(Number(await hInput.inputValue())).toBeCloseTo(beforeH, 0);

  // Redimensiona pela alça (canto inferior direito) — só aparece com o slot
  // selecionado, o que já é o caso (selecionar é o primeiro efeito do drag
  // acima). Headroom disponível: 100 - afterMoveX - beforeW.
  const handle = page.locator('[data-testid^="slot-resize-"]').first();
  const handleBox = (await handle.boundingBox())!;
  const resizeDeltaPct = 2;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + resizeDeltaPct * pxPerPctX, handleBox.y + handleBox.height / 2 + resizeDeltaPct * pxPerPctY, { steps: 10 });
  await page.mouse.up();

  const afterResizeW = Number(await wInput.inputValue());
  const afterResizeH = Number(await hInput.inputValue());
  expect(afterResizeW).toBeGreaterThan(beforeW);
  expect(afterResizeH).toBeGreaterThan(beforeH);
  // Posição não muda ao redimensionar
  expect(Number(await xInput.inputValue())).toBeCloseTo(afterMoveX, 0);
  expect(Number(await yInput.inputValue())).toBeCloseTo(afterMoveY, 0);

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvando…")).toHaveCount(0, { timeout: 10_000 });

  // Reabre a página (sai do estado do React, força reler do backend) pra
  // confirmar que a posição arrastada persistiu de verdade, não só na tela.
  await page.reload();
  await expect(page.locator('[data-testid^="slot-box-"]').first()).toBeVisible({ timeout: 10_000 });
  const reloadedX = Number(await xInput.inputValue());
  const reloadedY = Number(await yInput.inputValue());
  const reloadedW = Number(await wInput.inputValue());
  const reloadedH = Number(await hInput.inputValue());
  expect(Math.abs(reloadedX - afterMoveX)).toBeLessThan(1);
  expect(Math.abs(reloadedY - afterMoveY)).toBeLessThan(1);
  expect(Math.abs(reloadedW - afterResizeW)).toBeLessThan(1);
  expect(Math.abs(reloadedH - afterResizeH)).toBeLessThan(1);
});
