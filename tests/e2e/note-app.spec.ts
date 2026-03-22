import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("signs in through mock oidc, creates a note, searches it, and uploads an attachment", async ({ page }) => {
  const suffix = Date.now().toString();
  const folderName = `Project A ${suffix}`;
  const noteTitle = `Roadmap review ${suffix}`;
  const searchTerm = `budget-${suffix}`;

  await login(page);

  await page.getByPlaceholder("New folder").fill(folderName);
  await page.getByRole("button", { name: "Create folder" }).click();
  await page.getByRole("button", { name: new RegExp(folderName, "i") }).click();

  await page.getByRole("button", { name: /new note/i }).click();
  await page.getByLabel("Title").fill(noteTitle);
  await page.getByLabel("Markdown body").fill(`# Budget\n\nalpha launch ${searchTerm}`);
  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") })).toBeVisible();
  await page.getByPlaceholder("Search notes").fill(searchTerm);
  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") })).toBeVisible();

  const uploadFile = await createTempFile("budget.txt", "budget attachment");
  await page.locator('input[type="file"]').first().setInputFiles(uploadFile);
  await expect(page.getByText("budget.txt")).toBeVisible();

  await page.getByRole("button", { name: /^link$/i }).click();
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("textbox", { name: "Markdown body" })).toHaveValue(/budget\.txt/);
});

test("exports all notes and imports a markdown archive", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /new note/i }).click();
  await page.getByLabel("Title").fill("Export ready note");
  await page.getByLabel("Markdown body").fill("This note should travel well.");
  await page.getByRole("button", { name: /^save$/i }).click();

  await page.getByRole("link", { name: /exports/i }).click();
  await page.getByRole("button", { name: /export all notes/i }).click();
  await expect(page.getByText(/status: completed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /download zip/i })).toBeVisible();

  const importArchive = await createImportArchive();
  await page.getByRole("link", { name: /imports/i }).click();
  await page.getByLabel("Source").selectOption("onenote");
  await page.getByLabel("Archive").setInputFiles(importArchive);
  await page.getByRole("button", { name: /start import/i }).click();
  await expect(page.getByText(/status: completed/i)).toBeVisible();
  await expect(page.getByText(/created notes:/i)).toContainText("1");
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in with oidc/i }).click();
  await page.getByRole("button", { name: /continue to bbnote/i }).click();
  await expect(page.getByRole("button", { name: /new note/i })).toBeVisible();
}

async function createTempFile(name: string, contents: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-playwright-"));
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, contents, "utf8");
  return filePath;
}

async function createImportArchive() {
  const zip = new JSZip();
  zip.file("Imported/OneNote page.md", "# Imported note\n\nThis came from an archive.");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-import-"));
  const filePath = path.join(directory, "import.zip");
  await fs.writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}
