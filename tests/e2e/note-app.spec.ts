import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("starts empty, shows a unified notebook tree, supports row dragging, autosaves notes, and collapses the explorer", async ({ page }) => {
  const suffix = Date.now().toString();
  const notebookName = `Projects ${suffix}`;
  const subNotebookName = `Roadmaps ${suffix}`;
  const archiveNotebookName = `Archive ${suffix}`;
  const noteTitle = `Launch-plan-${suffix}-preview-overflow-check`;
  const searchTerm = `budget-${suffix}-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;

  await login(page);

  await expect(page.getByText("No notebooks yet.")).toBeVisible();
  await expect(page.getByText(/inbox/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /all notes/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toHaveCount(0);

  await page.getByRole("button", { name: /collapse notebooks pane/i }).click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toBeVisible();
  await page.getByRole("button", { name: /open notebooks pane/i }).click();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sub-notebook/i })).toHaveCount(0);

  await page.getByPlaceholder("Notebook name").fill(notebookName);
  await page.getByRole("button", { name: /new notebook/i }).click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(1);

  await page.getByPlaceholder("Notebook name").fill(subNotebookName);
  await page.getByRole("button", { name: /new notebook/i }).click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(2);
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName }).first()).toBeVisible();

  await page.getByRole("button", { name: new RegExp(subNotebookName, "i") }).click();
  await page.getByPlaceholder("Notebook name").fill(archiveNotebookName);
  await page.getByRole("button", { name: /new notebook/i }).click();
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(3);

  const archiveNotebookRow = page.getByTestId(buildNotebookTestId("drag", archiveNotebookName));
  await expect(archiveNotebookRow).toBeVisible();
  await archiveNotebookRow.dragTo(
    page.getByTestId(buildNotebookTestId("before", notebookName))
  );
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items[0]?.includes(archiveNotebookName) && items[1]?.includes(notebookName);
    })
    .toBeTruthy();

  await archiveNotebookRow.dragTo(
    page.getByTestId(buildNotebookTestId("drag", notebookName))
  );

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);
  await expect(page.getByText(/untitled note/i)).toHaveCount(0);

  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  await page.getByPlaceholder("Write in Markdown").first().fill(`# Budget\n\nalpha launch ${searchTerm}`);
  await expect(page.getByText(/^Saved /).first()).toBeVisible();

  const notePreview = page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first();
  await expect(notePreview).toBeVisible();
  expect(
    await notePreview.evaluate((element) => {
      const noteCard = element as HTMLButtonElement;
      return noteCard.scrollWidth <= noteCard.clientWidth + 1;
    })
  ).toBeTruthy();
  expect(
    await notePreview.evaluate((element) => {
      const excerpt = element.querySelector("p:nth-of-type(2)");
      return (excerpt?.textContent ?? "").length <= 75;
    })
  ).toBeTruthy();

  await page.getByPlaceholder("Search notes").fill(searchTerm);
  await notePreview.click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /^markdown$/i })).toHaveAttribute("title", "Markdown");
  await expect(page.getByRole("button", { name: /^preview$/i })).toHaveAttribute("title", "Preview");
  await page.getByRole("button", { name: /^preview$/i }).click();
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await page.getByRole("button", { name: /^markdown$/i }).click();

  const uploadFile = await createTempFile("budget.txt", "budget attachment");
  await page.locator('input[type="file"]').first().setInputFiles(uploadFile);
  await expect(page.getByText("budget.txt").first()).toBeVisible();

  await page.getByRole("button", { name: /^link$/i }).click();
  await expect(page.getByPlaceholder("Write in Markdown").first()).toHaveValue(/budget\.txt/);
});

test("navigates imports and exports from the avatar menu", async ({ page }) => {
  await login(page);
  await createNotebookAndPersistedNote(page);

  await page.getByRole("button", { name: /open user menu/i }).click();
  const notesLink = page.getByRole("link", { name: /^notes$/i });
  await expect(notesLink).toHaveClass(/bg-emerald-50/);
  await expect(notesLink).toHaveClass(/text-emerald-950/);
  await page.getByRole("link", { name: /^exports$/i }).click();
  await page.getByRole("button", { name: /export all notes/i }).click();
  await expect(page.getByText(/status: completed/i)).toBeVisible();
  await expect(page.getByText(/notebooks:/i)).toBeVisible();

  const importArchive = await createImportArchive();
  await page.getByRole("button", { name: /open user menu/i }).click();
  const exportsLink = page.getByRole("link", { name: /^exports$/i });
  await expect(exportsLink).toHaveClass(/bg-emerald-50/);
  await expect(exportsLink).toHaveClass(/text-emerald-950/);
  await page.getByRole("link", { name: /^imports$/i }).click();
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
  await expect(page.getByRole("button", { name: /^new note$/i })).toBeVisible();
  await expect(page.getByText("Notebook workspace")).toHaveCount(0);
  await expect(page.getByText("No note selected").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Notebook" })).toHaveCount(0);
}

async function createNotebookAndPersistedNote(page: import("@playwright/test").Page) {
  const suffix = Date.now().toString();
  await page.getByPlaceholder("Notebook name").fill(`Exports ${suffix}`);
  await page.getByRole("button", { name: /new notebook/i }).click();
  await page.getByRole("button", { name: /^new note$/i }).click();
  await page.getByRole("textbox", { name: "Title" }).first().fill(`Export ready note ${suffix}`);
  await page.getByPlaceholder("Write in Markdown").first().fill("This note should travel well.");
  await expect(page.getByText(/^Saved /).first()).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`Export ready note ${suffix}`, "i") })).toBeVisible();
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
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
