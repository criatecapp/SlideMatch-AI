import { test, expect } from "@playwright/test";

// Fluxo completo pedido explicitamente (section 32): Login → Criar
// apresentação → Gerar com IA → Editar → Salvar (autosave) → Reabrir →
// Exportar. Roda contra o app real (vercel dev), sem mock de rede — cada
// passo bate na API real, no Firestore real, e o passo de geração faz uma
// chamada real à OpenAI (por isso o timeout generoso).
//
// Cria um usuário descartável por execução (signup real via Firebase Auth)
// em vez de reaproveitar uma conta fixa, pra cada rodada partir de um
// estado limpo sem precisar de fixture/seed externo.

const runId = Date.now();
const email = `e2e-playwright-${runId}@example.com`;
const password = "senha-teste-123";

test.describe.configure({ mode: "serial" });

test("fluxo completo: login → template → projeto → gerar → editar → reabrir → exportar", async ({ page }) => {
  // 1. Signup (conta descartável)
  await page.goto("/login");
  await page.getByText("Não tem conta? Criar uma").click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  // 2. Criar um template com um layout mínimo (pré-requisito pra gerar)
  await page.getByRole("link", { name: "Templates" }).click();
  await expect(page).toHaveURL("/templates");
  await page.getByRole("button", { name: "Novo template" }).click();
  await expect(page).toHaveURL(/\/templates\/.+/, { timeout: 10_000 });

  await page.getByRole("button", { name: "+ Novo layout" }).click();
  await page.getByRole("button", { name: "+ Slot" }).click();
  const roleInputs = page.locator('input[list="role-suggestions"]');
  await roleInputs.first().fill("title");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Salvando…")).toHaveCount(0, { timeout: 10_000 });

  // 3. Criar projeto
  await page.goto("/");
  await page.getByRole("button", { name: "Novo projeto" }).click();
  await page.getByLabel("Título").fill(`Projeto E2E ${runId}`);
  await page.getByLabel("Objetivo").fill("treinar colaboradores em segurança");
  await page.getByLabel("Público").fill("colaboradores novos");
  await page
    .getByLabel("Conteúdo-fonte")
    .fill(
      "A empresa precisa treinar colaboradores em segurança da informação. " +
        "Os principais riscos são phishing e senhas fracas. Use autenticação de dois fatores.",
    );
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 10_000 });

  // 4. Criar apresentação (template já vem selecionado — só um ativo)
  await page.getByRole("button", { name: "Criar apresentação" }).click();
  await expect(page).toHaveURL(/\/presentations\/.+/, { timeout: 10_000 });
  const presentationUrl = page.url();

  // 5. Gerar com IA (chamada real à OpenAI — pode levar alguns segundos)
  await page.getByRole("button", { name: "Gerar com IA" }).click();
  await expect(page.getByRole("button", { name: "Gerando…" })).toBeVisible();
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 45_000 });

  // 6. Editar o texto do slide ativo (autosave)
  const textarea = page.locator("textarea").first();
  const original = await textarea.inputValue();
  await textarea.fill(original + " [editado pelo teste]");
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 5_000 });

  // 7. Reabrir (navega pra outra página e volta)
  await page.goto("/");
  await page.goto(presentationUrl);
  await expect(page.locator("textarea").first()).toContainText("[editado pelo teste]", { timeout: 10_000 });

  // 8. Exportar .pptx — mostra um link de download real com a URL assinada
  // do Storage (não abre aba sozinho: window.open() depois de um await é
  // bloqueado silenciosamente pelos navegadores, então o app mostra um
  // link de verdade pro usuário clicar).
  const exportResponse = page.waitForResponse((res) => res.url().includes("/export?format=pptx"), { timeout: 30_000 });
  await page.getByRole("button", { name: "Exportar .pptx" }).click();
  const exportRes = await exportResponse;
  expect(exportRes.ok()).toBe(true);
  const downloadLink = page.getByRole("link", { name: "pptx" });
  await expect(downloadLink).toBeVisible({ timeout: 10_000 });
  await expect(downloadLink).toHaveAttribute("href", /storage\.googleapis\.com/);
});
