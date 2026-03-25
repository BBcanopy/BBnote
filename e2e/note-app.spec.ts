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
  const notebookCard = notebookPane.locator(".bb-pane-card").first();
  const notesCard = notesPane.locator(".bb-pane-card").first();

  await expect
    .poll(async () => Number.parseFloat(await notebookPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThan(0.05);
  await expect
    .poll(async () => Number.parseFloat(await notesPaneHandle.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeLessThan(0.05);
  await expect
    .poll(async () =>
      notebookPaneResizer.evaluate((element) => getComputedStyle(element, "::before").content)
    )
    .toBe("none");
  await expect
    .poll(async () =>
      notesPaneResizer.evaluate((element) => getComputedStyle(element, "::before").content)
    )
    .toBe("none");

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
    .toBeLessThan(3);
  await expect
    .poll(async () => {
      const notesBox = await notesPane.boundingBox();
      const editorBox = await editorPanel.boundingBox();
      if (!notesBox || !editorBox) {
        return Number.POSITIVE_INFINITY;
      }
      return editorBox.x - (notesBox.x + notesBox.width);
    })
    .toBeLessThan(3);
  await expect
    .poll(async () => (await notebookPane.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(24);
  await expect
    .poll(async () => {
      const editorBox = await editorPanel.boundingBox();
      if (!editorBox || !viewport) {
        return 0;
      }
      return editorBox.x + editorBox.width;
    })
    .toBeGreaterThan((viewport?.width ?? 0) - 24);
  await expect
    .poll(async () => Number.parseFloat(await notebookCard.evaluate((element) => getComputedStyle(element).borderTopRightRadius)))
    .toBeLessThan(18);
  await expect
    .poll(async () => Number.parseFloat(await notesCard.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)))
    .toBeLessThan(18);
  await expect
    .poll(async () => Number.parseFloat(await notesCard.evaluate((element) => getComputedStyle(element).borderTopRightRadius)))
    .toBeLessThan(18);
  await expect
    .poll(async () => Number.parseFloat(await editorPanel.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)))
    .toBeLessThan(18);

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

test("starts empty, restores separate notebook and notes lanes, supports drag interactions, autosaves notes, and keeps panes open on note selection", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Projects ${suffix}`;
  const subNotebookName = `Roadmaps ${suffix}`;
  const archiveNotebookName = `Archive ${suffix}`;
  const noteTitle = `Launch-plan-${suffix}-preview-overflow-check`;
  const followUpNoteTitle = `Follow-up-${suffix}-priority-check`;
  const searchTerm = `budget-${suffix}-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;
  const editorPanel = page.locator(".bb-editor-panel").first();

  await login(page);

  await expect(page.getByText("No notebooks yet.")).toBeVisible();
  const topbarBox = await page.locator(".bb-topbar").boundingBox();
  const viewport = page.viewportSize();
  expect(topbarBox?.width ?? 0).toBeGreaterThan(((viewport?.width ?? 0) * 0.95));
  await expect
    .poll(async () => page.locator(".bb-topbar").evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(async () => page.locator(".bb-topbar").evaluate((element) => getComputedStyle(element).borderTopWidth))
    .toBe("0px");
  await expect
    .poll(async () => page.locator(".bb-topbar").evaluate((element) => getComputedStyle(element).boxShadow))
    .toBe("none");
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const pill = document.querySelector(".bb-brand-mark__pill")?.getBoundingClientRect();
        const title = document.querySelector(".bb-brand-mark__title")?.getBoundingClientRect();
        if (!pill || !title) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.abs(title.y + title.height / 2 - (pill.y + pill.height / 2));
      });
    })
    .toBeLessThan(6);
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const pill = document.querySelector(".bb-brand-mark__pill")?.getBoundingClientRect();
        const title = document.querySelector(".bb-brand-mark__title")?.getBoundingClientRect();
        if (!pill || !title) {
          return Number.POSITIVE_INFINITY;
        }

        return title.x - (pill.x + pill.width);
      });
    })
    .toBeLessThan(18);
  await expect(page.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(page.getByText("Markdown workspace")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /bbnote home/i })).toHaveAttribute("href", "/");
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
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toHaveAttribute("title", /select a notebook to create a note/i);
  expect((await page.getByRole("button", { name: /^new note$/i }).first().textContent())?.trim() ?? "").toBe("");
  await expect(page.getByText("Select or create a notebook to add a new note.")).toBeVisible();
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
    .toBeLessThan(24);
  await expect
    .poll(async () =>
      collapsedNotebookRail.locator(".bb-collapsed-rail__action").evaluate((element) => getComputedStyle(element).borderTopWidth)
    )
    .toBe("0px");
  expect((await collapsedNotebookRail.textContent())?.trim() ?? "").toBe("");
  await collapsedNotebookRail.click();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await page.getByRole("button", { name: /collapse notes pane/i }).click();
  const collapsedNotesRail = page.getByRole("button", { name: /open notes pane/i });
  await expect(collapsedNotesRail).toBeVisible();
  await expect
    .poll(async () => (await collapsedNotesRail.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
    .toBeLessThan(24);
  await expect
    .poll(async () =>
      collapsedNotesRail.locator(".bb-collapsed-rail__action").evaluate((element) => getComputedStyle(element).borderTopWidth)
    )
    .toBe("0px");
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

  await notebookRow(page, subNotebookName).click();
  await createNotebookWithDialog(page, archiveNotebookName);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(3);

  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();
  await page.getByRole("menuitem", { name: /^use star icon$/i }).click();
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();
  await expect(page.getByRole("menuitem", { name: /^use star icon$/i })).toHaveClass(/is-active/);
  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();

  const archiveNotebookRow = page.getByTestId(buildNotebookTestId("drag", archiveNotebookName));
  const archiveNotebookHandle = page.getByTestId(buildNotebookHandleTestId(archiveNotebookName));
  await expect(archiveNotebookRow).toBeVisible();
  await expect(archiveNotebookHandle).toBeVisible();

  await dragLocatorToLocator(
    page,
    archiveNotebookHandle,
    page.getByTestId(buildNotebookTestId("drag", notebookName))
  );
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 3);
    })
    .toEqual([
      expect.stringContaining(notebookName),
      expect.stringContaining(subNotebookName),
      expect.stringContaining(archiveNotebookName)
    ]);
  await expect
    .poll(async () => {
      const subNotebookBox = await notebookRowContainer(page, subNotebookName).boundingBox();
      const archiveNotebookBox = await notebookRowContainer(page, archiveNotebookName).boundingBox();
      if (!subNotebookBox || !archiveNotebookBox) {
        return Number.POSITIVE_INFINITY;
      }

      return Math.abs(archiveNotebookBox.x - subNotebookBox.x);
    })
    .toBeLessThan(6);

  await dragToDropZone(
    page,
    archiveNotebookHandle,
    page.getByTestId(buildNotebookTestId("before", subNotebookName))
  );
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 3);
    })
    .toEqual([
      expect.stringContaining(notebookName),
      expect.stringContaining(archiveNotebookName),
      expect.stringContaining(subNotebookName)
    ]);

  await page.reload();
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 3);
    })
    .toEqual([
      expect.stringContaining(notebookName),
      expect.stringContaining(archiveNotebookName),
      expect.stringContaining(subNotebookName)
    ]);

  await notebookRow(page, subNotebookName).click();
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toHaveAttribute("title", "New note");
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);
  await expect(page.getByText(/untitled note/i)).toHaveCount(0);

  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  const bodyTextarea = page.getByPlaceholder("Write in Markdown").first();
  expect(await bodyTextarea.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await bodyTextarea.fill(`# Budget\n\nalpha launch ${searchTerm}`);
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
  await notebookRow(page, subNotebookName).click();
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 2);
    })
    .toEqual([expect.stringContaining(followUpNoteTitle), expect.stringContaining(noteTitle)]);

  await page.getByRole("button", { name: new RegExp(followUpNoteTitle, "i") }).click();
  const autosaveListRefreshRequest = page.waitForRequest((request) => {
    return (
      request.method() === "GET" &&
      request.url().includes("/api/v1/notes?") &&
      request.url().includes("folderId=") &&
      request.url().includes("sort=priority") &&
      request.url().includes("order=asc")
    );
  });
  await page.getByPlaceholder("Write in Markdown").first().fill("Second note to test manual priority and autosave list refresh.");
  await autosaveListRefreshRequest;
  await expect(page.locator(".bb-skeleton-card")).toHaveCount(0);
  await expect(page.getByTestId(buildNoteTestId("drag", followUpNoteTitle))).toBeVisible();
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  await page.getByPlaceholder("Search notes").fill("priority");
  await expect(page.locator('[data-testid^="note-before-"]')).toHaveCount(0);
  await page.getByPlaceholder("Search notes").fill("");
  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);

  await allNotesButton.click();
  await expect(page.locator('[data-testid^="note-before-"]')).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open notebooks and notes panes/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /^markdown$/i })).toHaveAttribute("title", "Markdown");
  await expect(page.getByRole("button", { name: /^preview$/i })).toHaveAttribute("title", "Preview");
  await expect(editorPanel.getByRole("button", { name: /^add image$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^add audio$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^add video$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^record voice$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^upload file$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^upload$/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^preview$/i }).click();
  await expect(editorPanel.getByRole("button", { name: /^add image$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^upload file$/i })).toBeVisible();
  expect(await page.locator(".bb-markdown").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await page.getByRole("button", { name: /^markdown$/i }).click();

  await editorPanel.getByTestId("media-input-file").setInputFiles({
    name: "budget.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("budget attachment", "utf8")
  });
  await expect(page.getByText("budget.txt").first()).toBeVisible();

  await page.getByRole("button", { name: /^link$/i }).click();
  await expect(page.getByPlaceholder("Write in Markdown").first()).toHaveValue(/budget\.txt/);

  await page.getByPlaceholder("Search notes").fill("");
  await dragLocatorToLocator(
    page,
    page.getByTestId(buildNoteTestId("drag", followUpNoteTitle)),
    page.getByTestId(buildNotebookTestId("drag", archiveNotebookName))
  );
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(page.getByText(followUpNoteTitle).first()).toBeVisible();
  await expect(page.locator('[data-testid^="note-drag-"]').filter({ hasText: noteTitle })).toHaveCount(0);

  await page.getByRole("button", { name: new RegExp(followUpNoteTitle, "i") }).click();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  const editorDeleteButton = page.locator(".bb-editor-header").getByRole("button", { name: /^delete note$/i });
  await editorDeleteButton.click();
  const deleteNoteDialog = page.getByRole("dialog", { name: /^delete note\?$/i });
  await expect(deleteNoteDialog).toBeVisible();
  await deleteNoteDialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(deleteNoteDialog).toHaveCount(0);
  await expect(page.getByText(followUpNoteTitle).first()).toBeVisible();
  await editorDeleteButton.click();
  await page.getByRole("dialog", { name: /^delete note\?$/i }).getByRole("button", { name: /^delete note$/i }).click();
  await expect(page.getByText(followUpNoteTitle).first()).toHaveCount(0);
  await expect(page.getByText("No note selected").first()).toBeVisible();

  const notebookHeader = page.getByTestId("notebook-pane").locator(".bb-pane-card__header").first();
  const blockedNotebookHandle = page.getByTestId(buildNotebookHandleTestId(subNotebookName));
  const blockedNotebookDrag = await startDrag(page, blockedNotebookHandle);
  const deleteNotebookTarget = page.getByTestId("notebooks-delete-target");
  await expect(deleteNotebookTarget).toBeVisible();
  await expect(deleteNotebookTarget).toBeDisabled();
  await expectCenteredHeaderAction(notebookHeader, deleteNotebookTarget);
  await endDrag(blockedNotebookHandle, blockedNotebookDrag);
  await expect(page.getByRole("dialog", { name: /^delete notebook\?$/i })).toHaveCount(0);

  const archiveNotebookHandleForDelete = page.getByTestId(buildNotebookHandleTestId(archiveNotebookName));
  const archiveNotebookDrag = await startDrag(page, archiveNotebookHandleForDelete);
  await expect(deleteNotebookTarget).toBeVisible();
  await expect(deleteNotebookTarget).toBeEnabled();
  await expectCenteredHeaderAction(notebookHeader, deleteNotebookTarget);
  await dropOnTarget(archiveNotebookHandleForDelete, deleteNotebookTarget, archiveNotebookDrag);
  const deleteNotebookDialog = page.getByRole("dialog", { name: /^delete notebook\?$/i });
  await expect(deleteNotebookDialog).toBeVisible();
  await deleteNotebookDialog.getByRole("button", { name: /^delete notebook$/i }).click();
  await expect(page.getByTestId(buildNotebookTestId("drag", archiveNotebookName))).toHaveCount(0);
});

test("uploads image, audio, and video from the editor header and renders inline preview after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const suffix = Date.now().toString();
  const notebookName = `Media ${suffix}`;
  const noteTitle = `Media note ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);

  const editorPanel = page.locator(".bb-editor-panel").first();
  await expect(editorPanel.getByRole("button", { name: /^add image$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^add audio$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^add video$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^record voice$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^upload file$/i })).toBeVisible();

  await editorPanel.getByTestId("media-input-image").setInputFiles(createUploadFile("diagram.png", tinyPngBuffer(), "image/png"));
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("Untitled note");
  await expect(page.getByPlaceholder("Write in Markdown").first()).toHaveValue(/!\[diagram\.png\]\(\/api\/v1\/attachments\//);
  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first()).toBeVisible();

  await page.getByRole("button", { name: /^preview$/i }).click();
  await expect(editorPanel.getByRole("button", { name: /^add image$/i })).toBeVisible();
  await expect(editorPanel.getByRole("button", { name: /^upload file$/i })).toBeVisible();
  await expect(editorPanel.locator(".bb-markdown img")).toHaveCount(1);

  await editorPanel.getByTestId("media-input-audio").setInputFiles(
    createUploadFile("voice.webm", Buffer.from("mock-audio-payload", "utf8"), "audio/webm")
  );
  await expect(editorPanel.locator(".bb-markdown audio")).toHaveCount(1);

  await editorPanel.getByTestId("media-input-video").setInputFiles(
    createUploadFile("clip.webm", Buffer.from("mock-video-payload", "utf8"), "video/webm")
  );
  await expect(editorPanel.locator(".bb-markdown video")).toHaveCount(1);
  await page.getByRole("button", { name: /^markdown$/i }).click();
  await expect(page.getByPlaceholder("Write in Markdown").first()).toHaveValue(/voice\.webm/);
  await expect(page.getByPlaceholder("Write in Markdown").first()).toHaveValue(/clip\.webm/);
  await page.waitForTimeout(1600);

  await page.reload();
  await page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first().click();
  const reloadedEditorPanel = page.locator(".bb-editor-panel").first();
  await page.getByRole("button", { name: /^preview$/i }).click();
  await expect(reloadedEditorPanel.locator(".bb-markdown img")).toHaveCount(1);
  await expect(reloadedEditorPanel.locator(".bb-markdown audio")).toHaveCount(1);
  await expect(reloadedEditorPanel.locator(".bb-markdown video")).toHaveCount(1);
});

test("records a voice note from the editor header and saves it inline", async ({ page }) => {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type.startsWith("audio/webm");
      }

      mimeType: string;
      state: "inactive" | "recording" = "inactive";
      private readonly listeners: Record<string, Array<(event: Event | { data: Blob }) => void>> = {
        dataavailable: [],
        stop: []
      };

      constructor(_stream: unknown, options: { mimeType?: string } = {}) {
        this.mimeType = options.mimeType ?? "audio/webm;codecs=opus";
      }

      addEventListener(type: string, listener: (event: Event | { data: Blob }) => void) {
        this.listeners[type] ??= [];
        this.listeners[type].push(listener);
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        const clip = new Blob(["mock voice note"], { type: "audio/webm" });
        queueMicrotask(() => {
          for (const listener of this.listeners.dataavailable ?? []) {
            listener({ data: clip });
          }
          for (const listener of this.listeners.stop ?? []) {
            listener(new Event("stop"));
          }
        });
      }
    }

    const mockTrack = {
      stop() {}
    };
    const mockStream = {
      getTracks() {
        return [mockTrack];
      }
    };

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => mockStream
      }
    });
  });

  await login(page);
  await createNotebookWithDialog(page, `Voice ${Date.now()}`);

  const editorPanel = page.locator(".bb-editor-panel").first();
  await editorPanel.getByRole("button", { name: /^record voice$/i }).click();
  await expect(page.getByText("Recording voice note")).toBeVisible();
  await page.getByRole("button", { name: /^stop$/i }).click();
  await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("Untitled note");
  await page.getByRole("button", { name: /^preview$/i }).click();
  await expect(editorPanel.locator(".bb-markdown audio")).toHaveCount(1);
});

test("shows a friendly message when microphone access is denied", async ({ page }) => {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      static isTypeSupported() {
        return true;
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        }
      }
    });
  });

  await login(page);
  await createNotebookWithDialog(page, `Denied ${Date.now()}`);

  const editorPanel = page.locator(".bb-editor-panel").first();
  await editorPanel.getByRole("button", { name: /^record voice$/i }).click();
  await expect(page.getByText("Microphone access was denied.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^try again$/i })).toBeVisible();
});

test("shows a friendly message when voice recording is unsupported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: undefined
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined
    });
  });

  await login(page);
  await createNotebookWithDialog(page, `Unsupported ${Date.now()}`);

  const editorPanel = page.locator(".bb-editor-panel").first();
  await editorPanel.getByRole("button", { name: /^record voice$/i }).click();
  await expect(page.getByText("Voice recording is not supported in this browser.")).toBeVisible();
});

test("opens migration from the avatar menu and runs both export and import flows", async ({ page }) => {
  await login(page);
  await createNotebookAndPersistedNote(page);
  const userMenuButton = page.getByRole("button", { name: /open user menu/i });
  const notesTopbarWidth = (await page.locator(".bb-topbar").boundingBox())?.width ?? 0;

  await expect(page.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /bbnote home/i })).toHaveAttribute("href", "/");
  await expect
    .poll(async () => ((await userMenuButton.textContent()) ?? "").trim().length)
    .toBe(1);
  await expect
    .poll(async () => userMenuButton.evaluate((element) => getComputedStyle(element).borderTopWidth))
    .toBe("0px");

  await userMenuButton.click();
  const userMenu = page.getByRole("menu");
  await expect(userMenu.getByRole("link", { name: /^notes$/i })).toHaveAttribute("aria-current", "page");
  await expect(userMenu.getByRole("link", { name: /^migration$/i })).toBeVisible();
  await expect(userMenu.getByRole("link", { name: /^imports$/i })).toHaveCount(0);
  await expect(userMenu.getByRole("link", { name: /^exports$/i })).toHaveCount(0);
  await expect(userMenu.locator(".bb-theme-option__copy span")).toHaveCount(0);
  await expect(userMenu.getByText(/cool glass, mineral greens/i)).toHaveCount(0);
  await userMenu.getByRole("button", { name: /^ember/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await userMenu.getByRole("link", { name: /^migration$/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await expect(page).toHaveURL(/\/migration$/);
  const migrationTopbarWidth = (await page.locator(".bb-topbar").boundingBox())?.width ?? 0;
  expect(Math.abs(migrationTopbarWidth - notesTopbarWidth)).toBeLessThan(5);
  await expect(page.getByRole("heading", { name: /bring notes in, package everything out/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /bring in an archive/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /create a markdown bundle/i })).toBeVisible();
  await page.getByRole("button", { name: /export all notes/i }).click();
  const exportJobPanel = page.getByTestId("export-job-panel");
  await expect(exportJobPanel).toContainText(/status/i);
  await expect(exportJobPanel).toContainText(/notebooks/i);
  await expect(exportJobPanel.getByRole("button", { name: /download zip/i })).toBeVisible();

  const importArchive = await createImportArchive();
  await userMenuButton.click();
  const migrationMenu = page.getByRole("menu");
  await expect(migrationMenu.getByRole("link", { name: /^migration$/i })).toHaveAttribute("aria-current", "page");
  await migrationMenu.getByRole("button", { name: /^midnight/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await userMenuButton.click();
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
  await page.getByRole("link", { name: /bbnote home/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in with oidc/i }).click();
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

function buildNotebookHandleTestId(name: string) {
  return `notebook-handle-${encodeURIComponent(name)}`;
}

function buildNoteTestId(kind: "drag" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}

function notebookRow(page: import("@playwright/test").Page, name: string) {
  return page.getByTestId(buildNotebookTestId("drag", name)).locator(".bb-tree-row__content");
}

function notebookRowContainer(page: import("@playwright/test").Page, name: string) {
  return page.getByTestId(buildNotebookTestId("drag", name)).locator(".bb-tree-row");
}

async function createNotebookWithDialog(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /new notebook/i }).click();
  const dialog = page.getByRole("dialog", { name: /create notebook/i });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Notebook name").pressSequentially(name);
  await dialog.getByRole("button", { name: /^create notebook$/i }).click();
  await expect(dialog).toHaveCount(0);
}

function createUploadFile(name: string, buffer: Buffer, mimeType: string) {
  return {
    name,
    mimeType,
    buffer
  };
}

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
    "base64"
  );
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

async function dragLocatorToLocator(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator
) {
  const dataTransfer = await startDrag(page, source);
  await dropOnTarget(source, target, dataTransfer);
}

async function dragToDropZone(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator
) {
  const dataTransfer = await startDrag(page, source);
  await expect(target).toBeAttached();
  await dropOnTarget(source, target, dataTransfer);
}

async function startDrag(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

async function endDrag(source: import("@playwright/test").Locator, dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>) {
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

async function dropOnTarget(
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
  dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>
) {
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await endDrag(source, dataTransfer);
}

async function expectCenteredHeaderAction(
  header: import("@playwright/test").Locator,
  action: import("@playwright/test").Locator
) {
  const headerBox = await header.boundingBox();
  const actionBox = await action.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  if (!headerBox || !actionBox) {
    throw new Error("Expected the notebook header action to be visible.");
  }

  const headerCenterX = headerBox.x + headerBox.width / 2;
  const actionCenterX = actionBox.x + actionBox.width / 2;
  expect(Math.abs(actionCenterX - headerCenterX)).toBeLessThan(8);
  expect(actionBox.width).toBeGreaterThan(46);

  const shellStyles = await action.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow,
      zIndex: styles.zIndex
    };
  });

  expect(shellStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(shellStyles.boxShadow).not.toBe("none");
  expect(Number(shellStyles.zIndex)).toBeGreaterThan(1);
}
