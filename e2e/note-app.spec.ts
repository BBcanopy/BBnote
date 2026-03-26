import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("keeps desktop lanes viewport-height and only shows the pane grip on border hover", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });

  await login(page);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  const faviconSvg = await page.evaluate(async () => {
    const response = await fetch("/favicon.svg");
    return await response.text();
  });
  expect(faviconSvg).toContain('aria-label="BBNote note logo"');
  expect(faviconSvg).toContain('id="bbnote-favicon-note"');
  expect(faviconSvg).toContain('id="bbnote-favicon-fold"');
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");

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
    .poll(async () => {
      const paneBox = await notebookPane.boundingBox();
      if (!paneBox || !viewport) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(paneBox.y + paneBox.height - viewport.height);
    })
    .toBeLessThan(6);
  await expect
    .poll(async () => (await notebookPane.boundingBox())?.height ?? 0)
    .toBeGreaterThan((viewport?.height ?? 0) - 140);
  await expect
    .poll(async () => {
      const paneBox = await notesPane.boundingBox();
      if (!paneBox || !viewport) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(paneBox.y + paneBox.height - viewport.height);
    })
    .toBeLessThan(6);
  await expect
    .poll(async () => (await notesPane.boundingBox())?.height ?? 0)
    .toBeGreaterThan((viewport?.height ?? 0) - 140);
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

test("keeps the left workspace lanes screen-tall while the editor content scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Viewport lanes ${suffix}`;
  const noteTitle = `Overflow note ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();
  await createNoteWithContent(page, noteTitle, "This note should make the editor stack scroll.");

  for (let index = 0; index < 7; index += 1) {
    const uploadFile = await createTempFile(`lane-overflow-${suffix}-${index}.txt`, `attachment ${index} for ${suffix}`);
    await page.getByTestId("media-input-file").first().setInputFiles(uploadFile);
    await expect(page.getByText(`lane-overflow-${suffix}-${index}.txt`).first()).toBeVisible();
  }

  const viewport = page.viewportSize();
  const notebookPane = page.getByTestId("notebook-pane");
  const notesPane = page.getByTestId("notes-pane");
  const editorStack = page.locator(".bb-editor-stack").first();

  await expect
    .poll(async () =>
      editorStack.evaluate((element) => element.scrollHeight - element.clientHeight)
    )
    .toBeGreaterThan(120);

  await editorStack.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeLessThan(4);
  await expect
    .poll(async () => {
      const paneBox = await notebookPane.boundingBox();
      if (!paneBox || !viewport) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(paneBox.y + paneBox.height - viewport.height);
    })
    .toBeLessThan(6);
  await expect
    .poll(async () => {
      const paneBox = await notesPane.boundingBox();
      if (!paneBox || !viewport) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(paneBox.y + paneBox.height - viewport.height);
    })
    .toBeLessThan(6);
});

test("shows a branded 404 page instead of the router default error screen", async ({ page }) => {
  await page.goto("/missing/notebook/path");

  await expect(page.getByTestId("route-error-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: /that page slipped out of this notebook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^back to home$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^go back$/i })).toBeVisible();
  await expect(page.getByText(/^page not found$/i)).toHaveCount(0);
  await expect(page.getByText("The link may be old, incomplete, or pointing somewhere that was never filed.")).toHaveCount(0);
  await expect(page.getByText("/missing/notebook/path")).toHaveCount(0);
  await expect(page.getByText(/^path$/i)).toHaveCount(0);
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await expect(page.getByText(/^404 Not Found$/i)).toHaveCount(0);
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

  await login(page);
  const initialNotebookCount = await page.locator('[data-testid^="notebook-drag-"]').count();
  const topbar = page.locator(".bb-topbar").first();
  const topbarBox = await topbar.boundingBox();
  const viewport = page.viewportSize();
  expect(topbarBox?.width ?? 0).toBeGreaterThan(((viewport?.width ?? 0) * 0.95));
  expect(topbarBox?.height ?? 0).toBeLessThan(62);
  const topbarStyles = await topbar.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      borderTopWidth: styles.borderTopWidth,
      boxShadow: styles.boxShadow,
      backdropFilter: styles.backdropFilter
    };
  });
  expect(topbarStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(topbarStyles.borderTopWidth).toBe("0px");
  expect(topbarStyles.boxShadow).toBe("none");
  expect(topbarStyles.backdropFilter).toBe("none");
  const brandMark = page.getByRole("link", { name: /bbnote home/i }).first();
  const brandPill = brandMark.locator(".bb-brand-mark__pill");
  const brandTitle = brandMark.locator(".bb-brand-mark__title");
  await expect(brandPill).toHaveText("BB");
  const brandPillBox = await brandPill.boundingBox();
  const brandTitleBox = await brandTitle.boundingBox();
  const expectedBrandPillBackground = normalizeGradientBoundaryStops(
    await resolveBackgroundImage(
      page,
      "linear-gradient(145deg, color-mix(in srgb, #5d94d1 36%, var(--brand-start)) 0%, color-mix(in srgb, #4b78bf 42%, var(--brand-end)) 100%)"
    )
  );
  await expect
    .poll(async () =>
      normalizeGradientBoundaryStops(await brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    )
    .toBe(expectedBrandPillBackground);
  expect(brandPillBox).not.toBeNull();
  expect(brandTitleBox).not.toBeNull();
  if (!brandPillBox || !brandTitleBox) {
    throw new Error("Expected the topbar brand mark to be visible.");
  }
  expect(brandTitleBox.x).toBeGreaterThan(brandPillBox.x + brandPillBox.width - 2);
  expect(Math.abs((brandPillBox.y + brandPillBox.height / 2) - (brandTitleBox.y + brandTitleBox.height / 2))).toBeLessThan(10);
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
  await expect(page.getByText("Select or create a notebook to add a new note.")).toHaveCount(0);
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
  await expect
    .poll(async () => {
      const widths = await page.getByTestId("notes-actions").locator("button").evaluateAll((buttons) =>
        buttons.map((button) => getComputedStyle(button).borderTopWidth)
      );
      return widths.join("|");
    })
    .toBe("0px|0px");

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
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(initialNotebookCount + 1);

  await createNotebookWithDialog(page, subNotebookName);
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(initialNotebookCount + 2);
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName }).first()).toBeVisible();

  const renamedSubNotebookName = `Plans ${suffix}`;
  await notebookRow(page, subNotebookName).dblclick();
  const renameNotebookDialog = page.getByRole("dialog", { name: /^rename notebook$/i });
  await expect(renameNotebookDialog).toBeVisible();
  await expect(renameNotebookDialog.getByPlaceholder("Notebook name")).toHaveValue(subNotebookName);
  await renameNotebookDialog.getByPlaceholder("Notebook name").fill(renamedSubNotebookName);
  await renameNotebookDialog.getByRole("button", { name: /^rename notebook$/i }).click();
  await expect(renameNotebookDialog).toHaveCount(0);
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: renamedSubNotebookName }).first()).toBeVisible();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: subNotebookName })).toHaveCount(0);

  await page.getByRole("button", { name: /collapse all notebooks/i }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: renamedSubNotebookName })).toHaveCount(0);
  await page.getByRole("button", { name: /expand all notebooks/i }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: renamedSubNotebookName }).first()).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`collapse notebook ${notebookName}`, "i") }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: renamedSubNotebookName })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`expand notebook ${notebookName}`, "i") }).click();
  await expect(page.locator('[data-testid^="notebook-drag-"]').filter({ hasText: renamedSubNotebookName }).first()).toBeVisible();

  await notebookRow(page, renamedSubNotebookName).click();
  await createNotebookWithDialog(page, archiveNotebookName);
  await expect.poll(async () => page.locator('[data-testid^="notebook-drag-"]').count()).toBe(initialNotebookCount + 3);

  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();
  await page.getByRole("menuitem", { name: /^use star icon$/i }).click();
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();
  await expect(page.getByRole("menuitem", { name: /^use star icon$/i })).toHaveClass(/is-active/);
  await page.getByRole("button", { name: new RegExp(`choose icon for ${archiveNotebookName}`, "i") }).click();

  const archiveNotebookRow = page.getByTestId(buildNotebookTestId("drag", archiveNotebookName));
  const archiveNotebookDragRow = notebookRow(page, archiveNotebookName);
  await expect(archiveNotebookRow).toBeVisible();
  await dragLocatorToLocator(
    page,
    archiveNotebookDragRow,
    page.getByTestId(buildNotebookTestId("before", notebookName))
  );
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      const archiveIndex = items.findIndex((item) => item.includes(archiveNotebookName));
      const notebookIndex = items.findIndex((item) => item.includes(notebookName));
      return archiveIndex !== -1 && notebookIndex !== -1 && archiveIndex < notebookIndex;
    })
    .toBeTruthy();

  await archiveNotebookDragRow.dragTo(
    page.getByTestId(buildNotebookTestId("drag", notebookName))
  );

  await notebookRow(page, renamedSubNotebookName).click();
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: /^new note$/i }).first()).toHaveAttribute("title", "New note");
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);
  await expect(page.locator(".bb-note-card__title")).toHaveCount(1);
  await expect(page.locator(".bb-note-card__title").first()).toHaveText("Untitled note");
  await expect(page.locator('[data-testid^="note-drag-"] .bb-note-icon')).toHaveCount(0);

  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  const bodyTextarea = page.getByPlaceholder("Write in Markdown").first();
  expect(await bodyTextarea.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await expect(page.getByText("Uploaded files will appear here.")).toHaveCount(0);
  await expect
    .poll(async () => {
      const toolbar = page.getByTestId("editor-media-toolbar").first();
      const widths = await toolbar.locator("button").evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).borderTopWidth));
      return widths.join("|");
    })
    .toBe("0px|0px|0px|0px|0px");
  await expect
    .poll(async () => {
      const textareaBox = await bodyTextarea.boundingBox();
      const footerBox = await page.locator(".bb-editor-footer").first().boundingBox();
      if (!textareaBox || !footerBox) {
        return Number.POSITIVE_INFINITY;
      }
      return footerBox.y - (textareaBox.y + textareaBox.height);
    })
    .toBeLessThan(56);
  await bodyTextarea.fill(`# Budget\n\nalpha launch ${searchTerm}`);
  await expect(page.getByText(/^Saved /)).toHaveCount(0);
  await expect(page.locator(".bb-editor-body-header")).toHaveCount(0);
  await expect(page.locator(".bb-editor-header .bb-editor-mode").first()).toBeVisible();
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  const followUpFooter = page.locator(".bb-editor-footer").first();
  await expect
    .poll(async () => ((await followUpFooter.textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  const followUpInitialFooterText = ((await followUpFooter.textContent()) ?? "").trim();
  await page.getByRole("textbox", { name: "Title" }).first().fill(followUpNoteTitle);
  await page.getByPlaceholder("Write in Markdown").first().fill("Second note to test manual priority.");
  await expect
    .poll(async () => {
      const footerText = ((await followUpFooter.textContent()) ?? "").trim();
      return footerText !== followUpInitialFooterText ? footerText : "";
    })
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);
  await expect(page.locator('[data-testid^="note-drag-"] .bb-note-icon')).toHaveCount(0);
  const followUpNoteCard = page.locator('[data-testid^="note-drag-"]').filter({ hasText: followUpNoteTitle }).first();
  const targetNoteSlot = page.getByTestId(buildNoteTestId("slot", noteTitle));
  const targetNoteDropBefore = page.getByTestId(buildNoteTestId("before", noteTitle));
  const targetNoteDropAfter = page.getByTestId(buildNoteTestId("after", noteTitle));
  await expect(followUpNoteCard).toBeVisible();
  const dragReadyPreview = await startDrag(page, followUpNoteCard);
  await expect(targetNoteSlot).toHaveClass(/is-drag-ready/);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropBefore.evaluate((element) => getComputedStyle(element).height)))
    .toBeGreaterThan(10);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropAfter.evaluate((element) => getComputedStyle(element).height)))
    .toBeGreaterThan(10);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropBefore.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropAfter.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
  await endDrag(followUpNoteCard, dragReadyPreview);
  await dragNoteCardToNoteCard(followUpNoteCard, targetNoteSlot, "top");
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 2);
    })
    .toEqual([expect.stringContaining(followUpNoteTitle), expect.stringContaining(noteTitle)]);

  await page.reload();
  await notebookRow(page, renamedSubNotebookName).click();
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"]')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""));
      return items.slice(0, 2);
    })
    .toEqual([expect.stringContaining(followUpNoteTitle), expect.stringContaining(noteTitle)]);

  await page.getByRole("button", { name: new RegExp(followUpNoteTitle, "i") }).click();
  const followUpBody = page.getByPlaceholder("Write in Markdown").first();
  const followUpEditorFooter = page.locator(".bb-editor-footer").first();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue(followUpNoteTitle);
  await expect(followUpBody).toHaveValue("Second note to test manual priority.");
  const previousFollowUpFooterText = ((await followUpEditorFooter.textContent()) ?? "").trim();
  await followUpBody.click();
  await followUpBody.press("Control+A");
  await followUpBody.press("Delete");
  await followUpBody.pressSequentially("Second note to test manual priority and autosave list refresh.");
  await expect(followUpBody).toHaveValue("Second note to test manual priority and autosave list refresh.");
  await expect
    .poll(async () => {
      const footerText = ((await followUpEditorFooter.textContent()) ?? "").trim();
      return footerText !== previousFollowUpFooterText ? footerText : "";
    })
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
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
  await page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first().click();
  await expect(page.getByRole("button", { name: /collapse notebooks pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /collapse notes pane/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open notebooks and notes panes/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notebooks pane/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open notes pane/i })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /^markdown$/i })).toHaveAttribute("title", "Markdown");
  await expect(page.getByRole("button", { name: /^preview$/i })).toHaveAttribute("title", "Preview");
  await page.getByRole("button", { name: /^preview$/i }).click();
  expect(await page.locator(".bb-markdown").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await page.getByRole("button", { name: /^markdown$/i }).click();

  const uploadFile = await createTempFile("budget.txt", "budget attachment");
  await page.locator('input[type="file"]').first().setInputFiles(uploadFile);
  await expect(page.getByText("Attachments").first()).toBeVisible();
  await expect(page.getByText("Linked files and embeds")).toHaveCount(0);
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

  const notebookHeader = page.getByTestId("notebook-pane").locator(".bb-pane-card__header").first();
  const notesHeader = page.getByTestId("notes-pane").locator(".bb-pane-card__header").first();
  const expectedTrashBackgroundColor = await resolveBackgroundColor(
    page,
    "color-mix(in srgb, var(--danger) 5%, var(--surface-muted))"
  );
  const expectedTrashColor = await resolveTextColor(page, "color-mix(in srgb, var(--danger) 72%, var(--ink-soft))");
  const expectedActiveTrashBackgroundImage = await resolveBackgroundImage(
    page,
    "linear-gradient(135deg, color-mix(in srgb, var(--danger) 14%, var(--surface-strong)), color-mix(in srgb, var(--danger) 8%, var(--surface-muted)))"
  );
  await expect(page.getByTestId("notes-delete-target")).toHaveCount(0);
  const followUpNoteDrag = page.getByTestId(buildNoteTestId("drag", followUpNoteTitle));
  await expect(page.getByTestId("notebooks-delete-target")).toHaveCount(0);

  const cancelDeleteFromNotebookLaneDrag = await startDrag(page, followUpNoteDrag);
  const deleteNotebookTargetForNote = page.getByTestId("notebooks-delete-target");
  await expect(deleteNotebookTargetForNote).toBeVisible();
  await expect(page.getByTestId("notebooks-actions")).toHaveCount(0);
  await expect(deleteNotebookTargetForNote).toHaveAttribute("aria-label", "Delete note");
  const notebookDeleteStyles = await expectCenteredHeaderAction(notebookHeader, deleteNotebookTargetForNote);
  expect(notebookDeleteStyles.backgroundColor).toBe(expectedTrashBackgroundColor);
  expect(notebookDeleteStyles.color).toBe(expectedTrashColor);
  await deleteNotebookTargetForNote.dispatchEvent("dragover", { dataTransfer: cancelDeleteFromNotebookLaneDrag });
  await expect(deleteNotebookTargetForNote).toHaveClass(/is-active/);
  const activeNotebookDeleteStyles = await getHeaderActionStyles(deleteNotebookTargetForNote);
  expect(activeNotebookDeleteStyles.backgroundColor).not.toBe(notebookDeleteStyles.backgroundColor);
  expect(activeNotebookDeleteStyles.backgroundImage).toBe(expectedActiveTrashBackgroundImage);
  await dropOnTarget(followUpNoteDrag, deleteNotebookTargetForNote, cancelDeleteFromNotebookLaneDrag);
  const deleteNoteDialog = page.getByRole("dialog", { name: /^delete note\?$/i });
  await expect(deleteNoteDialog).toBeVisible();
  await deleteNoteDialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(deleteNoteDialog).toHaveCount(0);
  await notebookRow(page, archiveNotebookName).click();
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(followUpNoteDrag).toBeVisible();

  const cancelDeleteDrag = await startDrag(page, followUpNoteDrag);
  const deleteNoteTarget = page.getByTestId("notes-delete-target");
  await expect(deleteNoteTarget).toBeVisible();
  await expect(page.getByTestId("notes-actions")).toHaveCount(0);
  const noteDeleteStyles = await expectCenteredHeaderAction(notesHeader, deleteNoteTarget);
  expect(noteDeleteStyles.backgroundColor).toBe(notebookDeleteStyles.backgroundColor);
  expect(noteDeleteStyles.backgroundColor).toBe(expectedTrashBackgroundColor);
  expect(noteDeleteStyles.color).toBe(notebookDeleteStyles.color);
  expect(noteDeleteStyles.color).toBe(expectedTrashColor);
  await deleteNoteTarget.dispatchEvent("dragover", { dataTransfer: cancelDeleteDrag });
  await expect(deleteNoteTarget).toHaveClass(/is-active/);
  const activeNoteDeleteStyles = await getHeaderActionStyles(deleteNoteTarget);
  expect(activeNoteDeleteStyles.backgroundColor).not.toBe(noteDeleteStyles.backgroundColor);
  expect(activeNoteDeleteStyles.backgroundImage).toBe(expectedActiveTrashBackgroundImage);
  await dropOnTarget(followUpNoteDrag, deleteNoteTarget, cancelDeleteDrag);
  const deleteNoteDialogFromNotesLane = page.getByRole("dialog", { name: /^delete note\?$/i });
  await expect(deleteNoteDialogFromNotesLane).toBeVisible();
  await deleteNoteDialogFromNotesLane.getByRole("button", { name: /^cancel$/i }).click();
  await expect(deleteNoteDialogFromNotesLane).toHaveCount(0);
  await notebookRow(page, archiveNotebookName).click();
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(followUpNoteDrag).toBeVisible();

  const confirmDeleteDrag = await startDrag(page, followUpNoteDrag);
  await expect(deleteNoteTarget).toBeVisible();
  await dropOnTarget(followUpNoteDrag, deleteNoteTarget, confirmDeleteDrag);
  await page.getByRole("dialog", { name: /^delete note\?$/i }).getByRole("button", { name: /^delete note$/i }).click();
  await expect(page.getByText(followUpNoteTitle).first()).toHaveCount(0);

  const blockedNotebookDragSource = notebookRow(page, renamedSubNotebookName);
  const blockedNotebookDrag = await startDrag(page, blockedNotebookDragSource);
  const deleteNotebookTarget = page.getByTestId("notebooks-delete-target");
  await expect(deleteNotebookTarget).toBeVisible();
  await expect(page.getByTestId("notebooks-actions")).toHaveCount(0);
  await expect(deleteNotebookTarget).toBeDisabled();
  await expectCenteredHeaderAction(notebookHeader, deleteNotebookTarget);
  await endDrag(blockedNotebookDragSource, blockedNotebookDrag);
  await expect(page.getByRole("dialog", { name: /^delete notebook\?$/i })).toHaveCount(0);

  const archiveNotebookDeleteSource = notebookRow(page, archiveNotebookName);
  const archiveNotebookDrag = await startDrag(page, archiveNotebookDeleteSource);
  await expect(deleteNotebookTarget).toBeVisible();
  await expect(deleteNotebookTarget).toBeEnabled();
  await expectCenteredHeaderAction(notebookHeader, deleteNotebookTarget);
  await dropOnTarget(archiveNotebookDeleteSource, deleteNotebookTarget, archiveNotebookDrag);
  const deleteNotebookDialog = page.getByRole("dialog", { name: /^delete notebook\?$/i });
  await expect(deleteNotebookDialog).toBeVisible();
  await deleteNotebookDialog.getByRole("button", { name: /^delete notebook$/i }).click();
  await expect(page.getByTestId(buildNotebookTestId("drag", archiveNotebookName))).toHaveCount(0);
});

test("reorders notes by dropping onto note cards and persists the order", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Card reorder ${suffix}`;
  const firstNoteTitle = `Alpha ${suffix}`;
  const secondNoteTitle = `Beta ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();

  await createNoteWithContent(page, firstNoteTitle, "First note body.");
  await createNoteWithContent(page, secondNoteTitle, "Second note body.");
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle]);

  const downwardSource = page.getByTestId(buildNoteTestId("drag", firstNoteTitle));
  const downwardTargetCard = page.getByTestId(buildNoteTestId("drag", secondNoteTitle));
  const downwardTargetSlot = page.getByTestId(buildNoteTestId("slot", secondNoteTitle));
  const downwardTargetBox = await downwardTargetSlot.boundingBox();
  if (!downwardTargetBox) {
    throw new Error("Expected the lower note card to be visible.");
  }

  const downwardIndicatorDrag = await startDrag(page, downwardSource);
  await downwardTargetSlot.dispatchEvent("dragover", {
    dataTransfer: downwardIndicatorDrag,
    clientY: downwardTargetBox.y + 10
  });
  await expect(downwardTargetSlot).toHaveClass(/is-drop-after/);
  await expect(downwardTargetCard).toHaveClass(/bb-note-card--drop-after/);
  await endDrag(downwardSource, downwardIndicatorDrag);

  await dragNoteCardToNoteCard(downwardSource, downwardTargetSlot, "top");
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle]);

  await dragNoteCardToNoteCard(
    page.getByTestId(buildNoteTestId("drag", firstNoteTitle)),
    page.getByTestId(buildNoteTestId("slot", secondNoteTitle)),
    "top"
  );
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle]);
});

test("reorders notes when the drop lands in the note-lane gap", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Gap reorder ${suffix}`;
  const firstNoteTitle = `Alpha ${suffix}`;
  const secondNoteTitle = `Beta ${suffix}`;
  const thirdNoteTitle = `Gamma ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();

  await createNoteWithContent(page, firstNoteTitle, "First note body.");
  await createNoteWithContent(page, secondNoteTitle, "Second note body.");
  await createNoteWithContent(page, thirdNoteTitle, "Third note body.");
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle, thirdNoteTitle]);

  const source = page.getByTestId(buildNoteTestId("drag", firstNoteTitle));
  const secondSlot = page.getByTestId(buildNoteTestId("slot", secondNoteTitle));
  const thirdSlot = page.getByTestId(buildNoteTestId("slot", thirdNoteTitle));
  const noteList = page.locator(".bb-note-list").first();
  const secondBox = await secondSlot.boundingBox();
  const thirdBox = await thirdSlot.boundingBox();
  if (!secondBox || !thirdBox) {
    throw new Error("Expected the note lane slots to be visible.");
  }

  const gapDrag = await startDrag(page, source);
  const gapY = secondBox.y + secondBox.height + Math.max(2, (thirdBox.y - (secondBox.y + secondBox.height)) / 2);
  await noteList.dispatchEvent("dragover", {
    dataTransfer: gapDrag,
    clientY: gapY
  });
  await expect(secondSlot).toHaveClass(/is-drop-after/);
  await noteList.dispatchEvent("drop", {
    dataTransfer: gapDrag,
    clientY: gapY
  });
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle, thirdNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle, thirdNoteTitle]);
});

test("shows a compact editor header, supports table insertion, fullscreen editing, and wraps selections with markdown formatting tools", async ({
  page
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Formatting ${suffix}`;
  const noteTitle = `Toolbar ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();
  await createNoteWithContent(page, noteTitle, "alpha\nbeta\ngamma");

  const editorPanel = page.getByTestId("editor-panel-desktop");
  const editorHeader = editorPanel.locator(".bb-editor-header");
  const titleLabel = editorHeader.getByText(/^title$/i);
  const titleInput = editorHeader.getByRole("textbox", { name: "Title" });
  const expandEditorButton = editorHeader.getByRole("button", { name: /^expand editor$/i });
  const deleteButton = editorHeader.getByRole("button", { name: /delete note/i });
  const textarea = editorPanel.getByPlaceholder("Write in Markdown");

  await expect(titleLabel).toBeVisible();
  await expect(titleInput).toBeVisible();
  await expect(expandEditorButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expect(page.getByTestId("editor-format-toolbar").first()).toBeVisible();

  const headerBox = await editorHeader.boundingBox();
  const titleInputBox = await titleInput.boundingBox();
  const deleteButtonBox = await deleteButton.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(titleInputBox).not.toBeNull();
  expect(deleteButtonBox).not.toBeNull();
  if (!headerBox || !titleInputBox || !deleteButtonBox) {
    throw new Error("Expected the compact editor header layout to be visible.");
  }
  expect(titleInputBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
  expect(titleInputBox.y + titleInputBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
  expect(deleteButtonBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
  expect(deleteButtonBox.y + deleteButtonBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);

  await textarea.fill("alpha");
  await selectTextRange(textarea, 0, 5);
  await editorPanel.getByRole("button", { name: /^bold$/i }).click();
  await expect(textarea).toHaveValue("**alpha**");

  await textarea.fill("beta");
  await selectTextRange(textarea, 0, 4);
  await editorPanel.getByRole("button", { name: /^italic$/i }).click();
  await expect(textarea).toHaveValue("*beta*");

  await textarea.fill("gamma");
  await selectTextRange(textarea, 0, 5);
  await editorPanel.getByRole("button", { name: /^underline$/i }).click();
  await expect(textarea).toHaveValue("<u>gamma</u>");

  await textarea.fill("line one\nline two");
  await selectTextRange(textarea, 0, 17);
  await editorPanel.getByRole("button", { name: /^quote$/i }).click();
  await expect(textarea).toHaveValue("> line one\n> line two");

  await textarea.fill("");
  await editorPanel.getByRole("button", { name: /^insert table$/i }).click();
  await expect(textarea).toHaveValue("| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |");

  const editorWidthBeforeFullscreen = (await editorPanel.boundingBox())?.width ?? 0;
  await expandEditorButton.click();
  await expect(editorHeader.getByRole("button", { name: /^exit fullscreen editor$/i })).toBeVisible();
  await expect(page.getByTestId("notebook-pane")).toHaveCount(0);
  await expect(page.getByTestId("notes-pane")).toHaveCount(0);
  await expect
    .poll(async () => ((await editorPanel.boundingBox())?.width ?? 0) - editorWidthBeforeFullscreen)
    .toBeGreaterThan(500);

  await editorHeader.getByRole("button", { name: /^exit fullscreen editor$/i }).click();
  await expect(page.getByTestId("notebook-pane")).toBeVisible();
  await expect(page.getByTestId("notes-pane")).toBeVisible();
  await expect(editorHeader.getByRole("button", { name: /^expand editor$/i })).toBeVisible();
  await expect
    .poll(async () => Math.abs(((await editorPanel.boundingBox())?.width ?? 0) - editorWidthBeforeFullscreen))
    .toBeLessThan(48);
});

test("auto-saves voice notes on stop, inserts them into the editor, keeps delete available, and shows live recorder progress", async ({
  page
}) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await installMockVoiceRecorder(page);
  const notebookName = `Recorder ${Date.now()}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);

  const recordVoiceButton = page.getByRole("button", { name: /^record voice$/i }).first();
  await expect(recordVoiceButton).toBeEnabled();
  await recordVoiceButton.click();

  const recorderPanels = page.locator(".bb-recorder-panel");
  const recorderPanel = recorderPanels.first();
  const recorderProgress = recorderPanel.getByRole("progressbar", { name: /^recording progress$/i });
  const recorderProgressTime = recorderPanel.getByTestId("recorder-progress-time");
  await expect(recorderPanel).toBeVisible();
  await expect(recorderPanel.getByText("Recording voice note")).toBeVisible();
  await expect(recorderPanel.getByText("Stop when you're ready to review or attach the clip.")).toHaveCount(0);
  await expect(recorderPanel.getByRole("button", { name: /^pause$/i })).toBeVisible();
  await expect(recorderPanel.getByRole("button", { name: /^dismiss$/i })).toHaveCount(0);
  await expect(recorderProgress).toBeVisible();
  await expect(recorderProgressTime).toHaveText(/\d{2}:\d{2}/);
  await expect
    .poll(async () =>
      recorderPanel
        .locator(".bb-recorder-panel__copy p")
        .evaluateAll((elements) =>
          elements.map((element) => `${getComputedStyle(element).marginTop}/${getComputedStyle(element).marginBottom}`).join("|")
        )
    )
    .toBe("0px/0px");
  const initialRecorderProgressValue = (await recorderProgress.getAttribute("aria-valuetext")) ?? "";
  await expect
    .poll(
      async () => {
        const currentValue = await recorderProgress.getAttribute("aria-valuetext");
        return currentValue !== null && currentValue !== initialRecorderProgressValue;
      },
      {
        timeout: 4000
      }
    )
    .toBe(true);

  await recorderPanel.getByRole("button", { name: /^pause$/i }).click();
  await expect(recorderPanel.getByText("Recording paused")).toBeVisible();
  await expect(recorderPanel.getByRole("button", { name: /^resume$/i })).toBeVisible();
  await expect(recorderProgress).toHaveAttribute("aria-valuetext", /recording paused at \d{2}:\d{2}/i);
  const pausedRecorderProgressValue = (await recorderProgress.getAttribute("aria-valuetext")) ?? "";
  await page.waitForTimeout(900);
  await expect(recorderProgress).toHaveAttribute("aria-valuetext", pausedRecorderProgressValue);

  await recorderPanel.getByRole("button", { name: /^resume$/i }).click();
  await expect(recorderPanel.getByRole("button", { name: /^pause$/i })).toBeVisible();
  await expect(recorderProgress).toHaveAttribute("aria-valuetext", /recording for \d{2}:\d{2}/i);
  await expect
    .poll(
      async () => {
        const currentValue = await recorderProgress.getAttribute("aria-valuetext");
        return currentValue !== null && currentValue !== pausedRecorderProgressValue;
      },
      {
        timeout: 4000
      }
    )
    .toBe(true);

  await recorderPanel.getByRole("button", { name: /^stop$/i }).click();
  const voiceAttachment = page.locator(".bb-attachment-card").filter({ hasText: /voice-note-\d{14}\.webm/i }).first();
  const bodyTextarea = page.getByPlaceholder("Write in Markdown").first();
  await expect(page.getByText("Attachments").first()).toBeVisible();
  await expect(voiceAttachment).toBeVisible();
  await expect(recorderPanels).toHaveCount(0);
  await expect(bodyTextarea).toHaveValue(/\[voice-note-\d{14}\.webm\]\(.*\/attachments\/.*\)/i);
  await expect(page.getByRole("button", { name: /^retry save$/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^preview$/i }).click();
  const audioEmbed = page.locator(".bb-editor-preview .bb-markdown__audio-card").first();
  await expect(audioEmbed).toBeVisible();
  await expect(audioEmbed.locator(".bb-markdown__audio-title")).toHaveText(/voice-note-\d{14}\.webm/i);
  await expect(audioEmbed.getByText("Voice note")).toBeVisible();
  await expect(audioEmbed.locator("audio")).toHaveCount(1);
  await expect(audioEmbed.locator(".bb-markdown__media-caption")).toHaveCount(0);
  await page.getByRole("button", { name: /^markdown$/i }).click();
  await voiceAttachment.getByRole("button", { name: /^remove$/i }).click();
  await expect(voiceAttachment).toHaveCount(0);
});

test("uploads multi-megabyte audio attachments without proxy 413 errors", async ({ page }) => {
  const suffix = Date.now().toString();
  const notebookName = `Large uploads ${suffix}`;
  const noteTitle = `Audio upload ${suffix}`;
  const audioFileName = `song-${suffix}.mp3`;
  const audioPayload = Buffer.alloc(2 * 1024 * 1024, 0x61);

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await createNoteWithContent(page, noteTitle, "Ready for a larger audio attachment.");

  await page.getByTestId("media-input-audio").first().setInputFiles({
    name: audioFileName,
    mimeType: "audio/mpeg",
    buffer: audioPayload
  });

  const attachmentCard = page.locator(".bb-attachment-card").filter({ hasText: audioFileName }).first();
  const bodyTextarea = page.getByPlaceholder("Write in Markdown").first();
  await expect(attachmentCard).toBeVisible();
  await expect(bodyTextarea).toHaveValue(new RegExp(`\\[song-${suffix}\\.mp3\\]\\(.*\\/attachments\\/.*\\)`, "i"));
  await expect(page.locator(".bb-error-banner")).toHaveCount(0);

  await page.getByRole("button", { name: /^preview$/i }).click();
  const audioEmbed = page.locator(".bb-editor-preview .bb-markdown__audio-card").first();
  await expect(audioEmbed).toBeVisible();
  await expect(audioEmbed.locator(".bb-markdown__audio-title")).toHaveText(audioFileName);
  await expect(audioEmbed.locator("audio")).toHaveCount(1);
});

test("persists empty notes immediately so repeated new-note clicks create multiple blank notes", async ({ page }) => {
  const notebookName = `Inbox ${Date.now()}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  await expect.poll(async () => page.locator(".bb-note-card__title").count()).toBe(1);
  await expect(page.locator(".bb-note-card__title").first()).toHaveText("Untitled note");

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  await expect.poll(async () => page.locator(".bb-note-card__title").count()).toBe(2);
  await expect(page.locator(".bb-note-card__title")).toHaveText(["Untitled note", "Untitled note"]);
  await expect(page.locator(".bb-note-card__excerpt")).toHaveText(["Empty note", "Empty note"]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expect.poll(async () => page.locator(".bb-note-card__title").count()).toBe(2);
  await expect(page.locator(".bb-note-card__title")).toHaveText(["Untitled note", "Untitled note"]);
});

test("syncs notebook and note selection into the URL and restores deep links on direct open", async ({ page }) => {
  const suffix = Date.now().toString();
  const notebookName = `Routing ${suffix}`;
  const noteTitle = `Deep link ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await expect(page).toHaveURL(/\/folders\/[^/]+$/);
  const folderUrl = page.url();

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  const noteUrl = page.url();

  await page.getByRole("textbox", { name: "Title" }).first().fill(noteTitle);
  await page.getByPlaceholder("Write in Markdown").first().fill("Route this note back in.");
  await expect
    .poll(async () => ((await page.locator(".bb-editor-footer").first().textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first()).toBeVisible();

  await page.goto(folderUrl);
  await expect(page).toHaveURL(folderUrl);
  await expect(notebookRowContainer(page, notebookName)).toHaveClass(/is-active/);
  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first()).toBeVisible();

  await page.goto(noteUrl);
  await expect(page).toHaveURL(noteUrl);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue(noteTitle);
  await expect(page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first()).toHaveClass(/is-active/);

  await page.getByRole("button", { name: /open user menu/i }).click();
  await expect(page.getByRole("menu").getByRole("link", { name: /^notes$/i })).toHaveAttribute("aria-current", "page");
});

test("opens migration from the avatar menu and runs both export and import flows", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await login(page);
  await createNotebookAndPersistedNote(page);
  const userMenuButton = page.getByRole("button", { name: /open user menu/i });
  const notesTopbarWidth = (await page.locator(".bb-topbar").boundingBox())?.width ?? 0;
  const viewport = page.viewportSize();
  expect(notesTopbarWidth).toBeGreaterThan(((viewport?.width ?? 0) * 0.95));

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
  await expect(page.locator(".bb-shell").first()).not.toHaveClass(/bb-shell--workspace/);
  await expect(page.getByRole("heading", { name: /bring in an archive/i })).toBeVisible();
  const migrationTopbarWidth = (await page.locator(".bb-topbar").boundingBox())?.width ?? 0;
  expect(migrationTopbarWidth).toBeLessThan(((viewport?.width ?? 0) * 0.9));
  expect(migrationTopbarWidth).toBeGreaterThan(((viewport?.width ?? 0) * 0.75));
  expect(migrationTopbarWidth).toBeLessThan(notesTopbarWidth - 150);
  await expect(page.getByRole("heading", { name: /bring notes in, package everything out/i })).toHaveCount(0);
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
  await expect(page.getByText("Notebook workspace")).toHaveCount(0);
  await expect(page.getByTestId("editor-panel-desktop").locator(".bb-empty-state").getByText("No note selected")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Notebook" })).toHaveCount(0);
}

async function createNotebookAndPersistedNote(page: import("@playwright/test").Page) {
  const suffix = Date.now().toString();
  await createNotebookWithDialog(page, `Exports ${suffix}`);
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  const editorFooter = page.locator(".bb-editor-footer").first();
  await expect
    .poll(async () => ((await editorFooter.textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  const initialFooterText = ((await editorFooter.textContent()) ?? "").trim();
  await page.getByRole("textbox", { name: "Title" }).first().fill(`Export ready note ${suffix}`);
  await page.getByPlaceholder("Write in Markdown").first().fill("This note should travel well.");
  await expect
    .poll(async () => {
      const footerText = ((await editorFooter.textContent()) ?? "").trim();
      return footerText !== initialFooterText ? footerText : "";
    })
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  await expect(page.getByRole("button", { name: new RegExp(`Export ready note ${suffix}`, "i") })).toBeVisible();
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}

function buildNoteTestId(kind: "drag" | "slot" | "before" | "after", title: string) {
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
  await dialog.getByPlaceholder("Notebook name").fill(name);
  await dialog.getByRole("button", { name: /^create notebook$/i }).click();
  await expect(dialog).toHaveCount(0);
}

async function installMockVoiceRecorder(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      stream: unknown;
      mimeType: string;
      state: "inactive" | "recording" | "paused";
      listeners: Map<string, Set<(event?: Event | { data?: Blob }) => void>>;

      constructor(stream: unknown, options?: { mimeType?: string }) {
        this.stream = stream;
        this.mimeType = options?.mimeType ?? "audio/webm";
        this.state = "inactive";
        this.listeners = new Map();
      }

      addEventListener(type: string, listener: (event?: Event | { data?: Blob }) => void) {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: (event?: Event | { data?: Blob }) => void) {
        this.listeners.get(type)?.delete(listener);
      }

      dispatch(type: string, event?: Event | { data?: Blob }) {
        this.listeners.get(type)?.forEach((listener) => listener(event));
      }

      start() {
        this.state = "recording";
      }

      pause() {
        if (this.state !== "recording") {
          return;
        }
        this.state = "paused";
        this.dispatch("pause", new Event("pause"));
      }

      resume() {
        if (this.state !== "paused") {
          return;
        }
        this.state = "recording";
        this.dispatch("resume", new Event("resume"));
      }

      stop() {
        if (this.state === "inactive") {
          return;
        }
        this.state = "inactive";
        const blob = new Blob(["mock-audio"], { type: this.mimeType || "audio/webm" });
        this.dispatch("dataavailable", { data: blob });
        this.dispatch("stop", new Event("stop"));
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
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop() {}
            }
          ]
        })
      }
    });
  });
}

async function createNoteWithContent(page: import("@playwright/test").Page, title: string, body: string) {
  const newNoteButton = page.getByRole("button", { name: /^new note$/i }).first();
  await expect(newNoteButton).toBeEnabled();
  await newNoteButton.click();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  const editorFooter = page.locator(".bb-editor-footer").first();
  await expect
    .poll(async () => ((await editorFooter.textContent()) ?? "").trim())
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  const initialFooterText = ((await editorFooter.textContent()) ?? "").trim();
  await page.getByRole("textbox", { name: "Title" }).first().fill(title);
  await page.getByPlaceholder("Write in Markdown").first().fill(body);
  await expect
    .poll(async () => {
      const footerText = ((await editorFooter.textContent()) ?? "").trim();
      return footerText !== initialFooterText ? footerText : "";
    })
    .toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  await expect(page.getByTestId(buildNoteTestId("drag", title))).toBeVisible();
}

async function expectNoteOrderInLane(page: import("@playwright/test").Page, titles: string[]) {
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="note-drag-"] .bb-note-card__title')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.trim() ?? ""));
      return items.slice(0, titles.length);
    })
    .toEqual(titles);
}

async function createTempFile(name: string, contents: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-playwright-"));
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, contents, "utf8");
  return filePath;
}

async function selectTextRange(locator: import("@playwright/test").Locator, selectionStart: number, selectionEnd: number) {
  await locator.evaluate(
    (element, range) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(range.selectionStart, range.selectionEnd);
    },
    {
      selectionStart,
      selectionEnd
    }
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

async function dragNoteCardToNoteCard(
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
  position: "top" | "bottom"
) {
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Expected a note card drop target to be visible.");
  }

  await source.dragTo(target, {
    targetPosition: {
      x: Math.max(16, Math.min(box.width / 2, 28)),
      y: position === "top" ? Math.max(6, Math.min(box.height / 2, 12)) : Math.max(6, box.height - 6)
    }
  });
}

async function startDrag(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

async function endDrag(source: import("@playwright/test").Locator, dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>) {
  if (await source.count()) {
    await source.dispatchEvent("dragend", { dataTransfer });
  }
  await dataTransfer.dispose();
}

async function dropOnTarget(
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
  dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>
) {
  const targetHandle = await target.elementHandle();
  if (!targetHandle) {
    throw new Error("Expected a drop target to be available.");
  }

  await targetHandle.dispatchEvent("dragover", { dataTransfer });
  await targetHandle.dispatchEvent("drop", { dataTransfer });
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
  const headerRightX = headerBox.x + headerBox.width;
  const actionRightX = actionBox.x + actionBox.width;
  expect(Math.abs(actionCenterX - headerCenterX)).toBeLessThan(8);
  expect(Math.abs(actionBox.x - headerBox.x)).toBeLessThan(8);
  expect(Math.abs(actionRightX - headerRightX)).toBeLessThan(8);
  expect(actionBox.width).toBeGreaterThan(headerBox.width - 8);

  const shellStyles = await getHeaderActionStyles(action);

  expect(shellStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(shellStyles.backdropFilter).not.toBe("none");
  expect(shellStyles.boxShadow).not.toBe("none");
  expect(Number(shellStyles.zIndex)).toBeGreaterThan(1);
  return shellStyles;
}

async function getHeaderActionStyles(action: import("@playwright/test").Locator) {
  return await action.evaluate((element) => {
    const styles = getComputedStyle(element);
    const backgroundColor = styles.backgroundColor;
    return {
      backgroundColor,
      backgroundImage: styles.backgroundImage,
      color: styles.color,
      backdropFilter: styles.backdropFilter,
      boxShadow: styles.boxShadow,
      zIndex: styles.zIndex
    };
  });
}

async function resolveBackgroundColor(page: import("@playwright/test").Page, backgroundColor: string) {
  return await page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    probe.style.backgroundColor = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  }, backgroundColor);
}

async function resolveBackgroundImage(page: import("@playwright/test").Page, backgroundImage: string) {
  return await page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    probe.style.backgroundImage = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return resolved;
  }, backgroundImage);
}

function normalizeGradientBoundaryStops(backgroundImage: string) {
  const trimmedBackgroundImage = backgroundImage.trim();
  if (!trimmedBackgroundImage.startsWith("linear-gradient(") || !trimmedBackgroundImage.endsWith(")")) {
    return trimmedBackgroundImage;
  }

  const innerValue = trimmedBackgroundImage.slice("linear-gradient(".length, -1);
  const parts: string[] = [];
  let currentPart = "";
  let depth = 0;

  for (const character of innerValue) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (character === "," && depth === 0) {
      parts.push(currentPart.trim());
      currentPart = "";
      continue;
    }

    currentPart += character;
  }

  if (currentPart) {
    parts.push(currentPart.trim());
  }

  if (parts.length < 3) {
    return trimmedBackgroundImage;
  }

  const [gradientPrefix, ...colorStops] = parts;
  const normalizedColorStops = colorStops.map((colorStop, index) => {
    if (index === 0) {
      return colorStop.replace(/\s+0%$/i, "");
    }

    if (index === colorStops.length - 1) {
      return colorStop.replace(/\s+100%$/i, "");
    }

    return colorStop;
  });

  return `linear-gradient(${[gradientPrefix, ...normalizedColorStops].join(", ")})`;
}

async function resolveTextColor(page: import("@playwright/test").Page, color: string) {
  return await page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, color);
}
