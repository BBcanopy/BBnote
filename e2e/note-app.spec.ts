import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("keeps desktop lanes viewport-height and only shows the pane grip on border hover", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });

  await login(page);

  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toBeVisible();

  const viewport = page.viewportSize();
  const notebookPane = page.getByTestId("notebook-pane");
  const notesPane = page.getByTestId("notes-pane");
  const notebookPaneResizer = page.getByTestId("notebook-pane-resizer");
  const notesPaneResizer = page.getByTestId("notes-pane-resizer");
  const notebookPaneHandle = notebookPaneResizer.locator(".bb-pane-resizer__handle");
  const notesPaneHandle = notesPaneResizer.locator(".bb-pane-resizer__handle");
  const editorPanel = page.locator(".bb-editor-panel").first();

  await expect
    .poll(async () => Number.parseFloat(await notebookPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThan(0.05);
  await expect
    .poll(async () => Number.parseFloat(await notesPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThan(0.05);

  await notebookPaneResizer.hover();
  await expect
    .poll(async () => Number.parseFloat(await notebookPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
  await expect
    .poll(async () => {
      const paneBox = await notebookPane.boundingBox();
      const handleBox = await notebookPaneHandle.boundingBox();
      if (!paneBox || !handleBox) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(handleBox.x + handleBox.width / 2 - (paneBox.x + paneBox.width));
    })
    .toBeLessThan(4);

  await notesPaneResizer.hover();
  await expect
    .poll(async () => Number.parseFloat(await notesPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
  await expect
    .poll(async () => Number.parseFloat(await notebookPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThan(0.05);
  await expect
    .poll(async () => {
      const paneBox = await notesPane.boundingBox();
      const handleBox = await notesPaneHandle.boundingBox();
      if (!paneBox || !handleBox) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(handleBox.x + handleBox.width / 2 - (paneBox.x + paneBox.width));
    })
    .toBeLessThan(4);

  await expect
    .poll(async () => (await notebookPane.boundingBox())?.height ?? 0)
    .toBeGreaterThan((viewport?.height ?? 0) - 4);
  await expect
    .poll(async () => (await notesPane.boundingBox())?.height ?? 0)
    .toBeGreaterThan((viewport?.height ?? 0) - 4);
  await expect
    .poll(async () => {
      const notebookBox = await notebookPane.boundingBox();
      const notesBox = await notesPane.boundingBox();
      if (!notebookBox || !notesBox) {
        return Number.POSITIVE_INFINITY;
      }
      return notesBox.x - (notebookBox.x + notebookBox.width);
    })
    .toBeLessThan(20);
  await expect
    .poll(async () => {
      const notesBox = await notesPane.boundingBox();
      const editorBox = await editorPanel.boundingBox();
      if (!notesBox || !editorBox) {
        return Number.POSITIVE_INFINITY;
      }
      return editorBox.x - (notesBox.x + notesBox.width);
    })
    .toBeLessThan(20);

  const notebookPaneWidthBefore = (await notebookPane.boundingBox())?.width ?? 0;
  const notesPaneWidthBefore = (await notesPane.boundingBox())?.width ?? 0;
  await dragResizer(page, notebookPaneResizer, 72);
  await dragResizer(page, notesPaneResizer, 88);
  await expect
    .poll(async () => ((await notebookPane.boundingBox())?.width ?? 0) - notebookPaneWidthBefore)
    .toBeGreaterThan(40);
  await expect
    .poll(async () => ((await notesPane.boundingBox())?.width ?? 0) - notesPaneWidthBefore)
    .toBeGreaterThan(48);
});

test("starts empty, restores separate notebook and notes lanes, supports row dragging, autosaves notes, and collapses both lanes", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Projects ${suffix}`;
  const subNotebookName = `Roadmaps ${suffix}`;
  const archiveNotebookName = `Archive ${suffix}`;
  const noteTitle = `Launch-plan-${suffix}-preview-overflow-check`;
  const followUpNoteTitle = `Follow-up-${suffix}-priority-check`;
  const searchTerm = `budget-${suffix}-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;

  await login(page);

  await expect(page.getByText("No notebooks yet.")).toBeVisible();
  const topbarBox = await page.locator(".bb-topbar").boundingBox();
  const viewport = page.viewportSize();
  expect(topbarBox?.width ?? 0).toBeGreaterThan(((viewport?.width ?? 0) * 0.85));
  await expect(page.getByText(/inbox/i)).toHaveCount(0);
  const allNotesButton = page.getByRole("button", { name: /all notes/i }).first();
  await expect(allNotesButton).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toBeVisible();
  const notebookPane = page.getByTestId("notebook-pane");
  const notesPane = page.getByTestId("notes-pane");
  await expect(notebookPane.locator("p.bb-eyebrow")).toHaveCount(0);
  await expect(notesPane.locator("p.bb-eyebrow")).toHaveCount(0);
  const notebookPaneWidthBefore = (await notebookPane.boundingBox())?.width ?? 0;
  const notesPaneWidthBefore = (await notesPane.boundingBox())?.width ?? 0;
  await dragResizer(page, page.getByTestId("notebook-pane-resizer"), 72);
  await dragResizer(page, page.getByTestId("notes-pane-resizer"), 88);
  await expect
    .poll(async () => ((await notebookPane.boundingBox())?.width ?? 0) - notebookPaneWidthBefore)
    .toBeGreaterThan(40);
  await expect
    .poll(async () => ((await notesPane.boundingBox())?.width ?? 0) - notesPaneWidthBefore)
    .toBeGreaterThan(48);
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toHaveAttribute("title", "New note");
  expect((await page.getByRole("button", { name: /^new note$/i }).first().textContent())?.trim() ?? "").toBe("");
  await expect
    .poll(async () => {
      const labels = await page.getByTestId("notebooks-actions").locator("button").evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "")
      );
      return labels.join("|");
    })
    .toBe("Expand all notebooks|Collapse all notebooks|New notebook|Collapse notebooks pane");
  await expect
    .poll(async () => {
      const labels = await page.getByTestId("notes-actions").locator("button").evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "")
      );
      return labels.join("|");
    })
    .toBe("New note|Collapse notes pane");

  await page.getByRole("button", { name: /collapse notebooks pane/i }).click();
  const collapsedNotebookRail = page.getByRole("button", { name: /open notebooks pane/i });
  await expect(collapsedNotebookRail).toBeVisible();
  await expect
    .poll(async () => (await collapsedNotebookRail.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(60);
  expect((await collapsedNotebookRail.textContent())?.trim() ?? "").toBe("");
  await collapsedNotebookRail.click();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await page.getByRole("button", { name: /collapse notes pane/i }).click();
  const collapsedNotesRail = page.getByRole("button", { name: /open notes pane/i });
  await expect(collapsedNotesRail).toBeVisible();
  await expect
    .poll(async () => (await collapsedNotesRail.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(60);
  expect((await collapsedNotesRail.textContent())?.trim() ?? "").toBe("");
  await collapsedNotesRail.click();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sub-notebook/i })).toHaveCount(0);
  await expect(page.getByPlaceholder("Notebook name")).toHaveCount(0);

  await createNotebookWithDialog(page, notebookName);
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(1);

  await createNotebookWithDialog(page, subNotebookName);
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(2);
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName }).first()).toBeVisible();

  await page.getByRole("button", { name: /collapse all notebooks/i }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName })).toHaveCount(0);
  await page.getByRole("button", { name: /expand all notebooks/i }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName }).first()).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`collapse notebook ${notebookName}`, "i") }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`expand notebook ${notebookName}`, "i") }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName }).first()).toBeVisible();

  await page.getByRole("button", { name: new RegExp(subNotebookName, "i") }).click();
  await createNotebookWithDialog(page, archiveNotebookName);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(3);

  const archiveNotebookRow = page.getByTestId(buildNotebookTestId("drag", archiveNotebookName));
  await expect(archiveNotebookRow).toBeVisible();
  await dragToDropZone(
    page,
    archiveNotebookRow,
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

  await page.getByRole("button", { name: new RegExp(subNotebookName, "i") }).click();
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);
  await expect(page.getByText(/untitled note/i)).toHaveCount(0);

  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  await page.getByPlaceholder("Write in Markdown").first().fill(`# Budget\n\nalpha launch ${searchTerm}`);
  await expect(page.getByText(/^Saved /)).toHaveCount(0);
  await expect(page.locator(".bb-editor-header .bb-editor-mode")).toHaveCount(0);
  await expect(page.locator(".bb-editor-body-header .bb-editor-mode").first()).toBeVisible();
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  await page.getByRole("button", { name: /^new note$/i }).click();
  await page.getByRole("textbox", { name: "Title" }).first().fill(followUpNoteTitle);
  await page.getByPlaceholder("Write in Markdown").first().fill("Second note to test manual priority.");
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);
  await dragToDropZone(
    page,
    page.getByTestId(buildNoteTestId("drag", followUpNoteTitle)),
    page.getByTestId(buildNoteTestId("before", noteTitle))
  );
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 2);
    })
    .toEqual([expect.stringContaining(followUpNoteTitle), expect.stringContaining(noteTitle)]);

  await page.reload();
  await page.getByRole("button", { name: new RegExp(subNotebookName, "i") }).click();
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 2);
    })
    .toEqual([expect.stringContaining(followUpNoteTitle), expect.stringContaining(noteTitle)]);

  await page.getByPlaceholder("Search notes").fill("priority");
  await expect(page.locator('[data-testid^="note-drag-"]')).toHaveCount(0);
  await page.getByPlaceholder("Search notes").fill("");
  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);

  await allNotesButton.click();
  await expect(page.locator('[data-testid^="note-drag-"]')).toHaveCount(0);
  await expect(page.getByText(noteTitle).first()).toBeVisible();

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
      const excerpt = element.querySelector(".bb-note-card__excerpt") as HTMLElement | null;
      if (!excerpt) {
        return false;
      }
      const style = getComputedStyle(excerpt);
      return style.overflow === "hidden" && style.textOverflow === "ellipsis" && style.whiteSpace === "nowrap";
    })
  ).toBeTruthy();
  expect(
    await notePreview.evaluate((element) => {
      const noteCard = element as HTMLButtonElement;
      return noteCard.getBoundingClientRect().height < 88;
    })
  ).toBeTruthy();
  expect(
    await notePreview.evaluate((element) => {
      const excerpt = element.querySelector(".bb-note-card__excerpt");
      return (excerpt?.textContent ?? "").length <= 45;
    })
  ).toBeTruthy();

  await page.getByPlaceholder("Search notes").fill(searchTerm);
  await notePreview.click();
  const collapsedWorkspaceRail = page.getByRole("button", { name: /open notebooks and notes panes/i });
  await expect(collapsedWorkspaceRail).toBeVisible();
  await expect
    .poll(async () => (await collapsedWorkspaceRail.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(60);
  expect((await collapsedWorkspaceRail.textContent())?.trim() ?? "").toBe("");
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
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

test("opens migration from the avatar menu and runs both export and import flows", async ({ page }) => {
  await login(page);
  await createNotebookAndPersistedNote(page);

  await expect(page.getByRole("navigation", { name: /primary navigation/i }).getByRole("link", { name: /^notes$/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /primary navigation/i }).getByRole("link", { name: /^imports$/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /primary navigation/i }).getByRole("link", { name: /^exports$/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /primary navigation/i }).getByRole("link", { name: /^migration$/i })).toHaveCount(0);
  await expect
    .poll(async () => ((await page.getByRole("button", { name: /open user menu/i }).textContent()) ?? "").trim().length)
    .toBe(1);

  await page.getByRole("button", { name: /open user menu/i }).click();
  const userMenu = page.getByRole("menu");
  await expect(userMenu.getByRole("link", { name: /^notes$/i })).toHaveAttribute("aria-current", "page");
  await expect(userMenu.getByRole("link", { name: /^migration$/i })).toBeVisible();
  await expect(userMenu.getByRole("link", { name: /^imports$/i })).toHaveCount(0);
  await expect(userMenu.getByRole("link", { name: /^exports$/i })).toHaveCount(0);
  await userMenu.getByRole("button", { name: /^ember/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await userMenu.getByRole("link", { name: /^migration$/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await expect(page).toHaveURL(/\/migration$/);
  await expect(page.getByRole("heading", { name: /bring notes in, package everything out/i })).toBeVisible();
  await page.getByRole("button", { name: /export all notes/i }).click();
  const exportJobPanel = page.getByTestId("export-job-panel");
  await expect(exportJobPanel).toContainText(/status/i);
  await expect(exportJobPanel).toContainText(/notebooks/i);
  await expect(exportJobPanel.getByRole("button", { name: /download zip/i })).toBeVisible();

  const importArchive = await createImportArchive();
  await page.getByRole("button", { name: /open user menu/i }).click();
  const migrationMenu = page.getByRole("menu");
  await expect(migrationMenu.getByRole("link", { name: /^migration$/i })).toHaveAttribute("aria-current", "page");
  await migrationMenu.getByRole("button", { name: /^midnight/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await page.getByRole("button", { name: /open user menu/i }).click();
  await page.getByLabel("Source").selectOption("onenote");
  await page.getByLabel("Archive").setInputFiles(importArchive);
  await page.getByRole("button", { name: /start import/i }).click();
  const importJobPanel = page.getByTestId("import-job-panel");
  await expect(importJobPanel).toContainText(/status/i);
  await expect(importJobPanel).toContainText(/created notes/i);
  await expect(importJobPanel).toContainText("1");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(page).toHaveURL(/\/migration$/);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in with oidc/i }).click();
  await page.getByRole("button", { name: /continue to bbnote/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sea");
  await expect(page.getByRole("button", { name: /^new note$/i })).toBeVisible();
  await expect(page.getByText("Notebook workspace")).toHaveCount(0);
  await expect(page.getByText("No note selected").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Notebook" })).toHaveCount(0);
}

async function createNotebookAndPersistedNote(page: import("@playwright/test").Page) {
  const suffix = Date.now().toString();
  await createNotebookWithDialog(page, `Exports ${suffix}`);
  await page.getByRole("button", { name: /^new note$/i }).click();
  await page.getByRole("textbox", { name: "Title" }).first().fill(`Export ready note ${suffix}`);
  await page.getByPlaceholder("Write in Markdown").first().fill("This note should travel well.");
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  await expect(page.getByRole("button", { name: new RegExp(`Export ready note ${suffix}`, "i") })).toBeVisible();
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}

function buildNoteTestId(kind: "drag" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}

async function createNotebookWithDialog(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /new notebook/i }).click();
  const dialog = page.getByRole("dialog", { name: /create notebook/i });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Notebook name").fill(name);
  await dialog.getByRole("button", { name: /^create notebook$/i }).click();
  await expect(dialog).toHaveCount(0);
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

async function dragResizer(page: import("@playwright/test").Page, handle: import("@playwright/test").Locator, deltaX: number) {
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Expected resize handle to be visible.");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 12 });
  await page.mouse.up();
}

async function dragToDropZone(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator
) {
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error("Expected drag source to be visible.");
  }

  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 4 });

  await expect
    .poll(async () => (await target.boundingBox())?.height ?? 0)
    .toBeGreaterThan(4);

  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("Expected drop zone to be visible.");
  }

  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
}
