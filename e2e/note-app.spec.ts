import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import JSZip from "jszip";
import { buildNotebookTestId } from "../web/src/components/folderTreeTestIds";

const UPDATED_AT_STATUS_PATTERN = /^Updated at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
  const editorPanel = page.getByTestId("editor-panel-desktop");
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
    .poll(async () => ({
      notebook: await notebookCard.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        };
      }),
      notes: await notesCard.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        };
      }),
      editor: await editorPanel.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        };
      })
    }))
    .toEqual({
      notebook: {
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px"
      },
      notes: {
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px"
      },
      editor: {
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px"
      }
    });

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

test("keeps the left workspace lanes screen-tall while the editor and preview content scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Viewport lanes ${suffix}`;
  const noteTitle = `Overflow note ${suffix}`;
  const previewBottomMarker = `Preview bottom marker ${suffix}`;
  const longMarkdown = `${Array.from({ length: 18 }, (_, index) => `Paragraph ${index + 1} for ${suffix}.`).join("\n\n")}\n\n${previewBottomMarker}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();
  await createNoteWithContent(page, noteTitle, longMarkdown);

  for (let index = 0; index < 12; index += 1) {
    const uploadFile = await createTempFile(`lane-overflow-${suffix}-${index}.txt`, `attachment ${index} for ${suffix}`);
    await page.getByTestId("media-input-file").first().setInputFiles(uploadFile);
    await expect(activeAttachmentCards(page).filter({ hasText: `lane-overflow-${suffix}-${index}.txt` }).first()).toBeVisible();
  }

  const viewport = page.viewportSize();
  const notebookPane = page.getByTestId("notebook-pane");
  const notesPane = page.getByTestId("notes-pane");
  const editorPanel = page.getByTestId("editor-panel-desktop");
  const editorTextarea = editorPanel.getByPlaceholder("Write in Markdown");

  await expect
    .poll(async () =>
      editorTextarea.evaluate((element) => element.scrollHeight - element.clientHeight)
    )
    .toBeGreaterThan(120);

  await editorTextarea.evaluate((element) => {
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

  await page.getByRole("button", { name: /^preview$/i }).click();
  const editorPreview = editorPanel.locator(".bb-editor-preview");
  await expect
    .poll(async () =>
      editorPreview.evaluate((element) => element.scrollHeight - element.clientHeight)
    )
    .toBeGreaterThan(120);
  await editorPreview.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(editorPreview.getByText(previewBottomMarker)).toBeVisible();
});

test.describe("mobile workspace", () => {
  let mobileActions: Locator;
  let browseNotebooksButton: Locator;
  let browseNewNoteButton: Locator;
  let focusedShortcuts: Locator;
  let focusedNotebooksButton: Locator;
  let focusedNotesButton: Locator;
  let focusedNewNoteButton: Locator;
  let titleInput: Locator;
  let textarea: Locator;
  let mobileEditorPanel: Locator;
  let desktopEditorPanel: Locator;
  let notebooksDrawer: Locator;
  let notesDrawer: Locator;

  test.beforeEach(({ page }) => {
    mobileActions = page.locator(".bb-mobile-workspace__actions");
    mobileEditorPanel = page.getByTestId("editor-panel-mobile");
    desktopEditorPanel = page.getByTestId("editor-panel-desktop");
    browseNotebooksButton = mobileActions.getByRole("button", { name: /^notebooks$/i });
    browseNewNoteButton = mobileActions.getByRole("button", { name: /^new note$/i });
    focusedShortcuts = mobileEditorPanel.getByTestId("mobile-editor-shortcuts");
    focusedNotebooksButton = mobileEditorPanel.getByRole("button", { name: /^notebooks$/i });
    focusedNotesButton = mobileEditorPanel.getByRole("button", { name: /^notes$/i });
    focusedNewNoteButton = mobileEditorPanel.getByRole("button", { name: /^new note$/i });
    titleInput = page.getByRole("textbox", { name: "Title" }).first();
    textarea = activeEditorTextarea(page);
    notebooksDrawer = page.getByTestId("mobile-notebooks-drawer");
    notesDrawer = page.getByTestId("mobile-notes-drawer");
  });

  test("uses a full-height mobile workspace and full-screen drawers on small screens", async ({ page }) => {
    const suffix = createTestSuffix();
    const notebookName = `Pocket ${suffix}`;
    const firstNoteTitle = `Pocket note ${suffix}`;
    const firstNoteBody = `Mobile body ${suffix}\n\nThis note should stay comfortable on phones.`;
    const secondNoteTitle = `Pocket follow-up ${suffix}`;
    const secondNoteBody = `Second mobile body ${suffix}\n\nCompact actions should still feel easy to use.`;

    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const viewport = page.viewportSize();
    const emptyState = mobileEditorPanel.locator(".bb-empty-state");
    const mobileToolbarImageButton = page.getByRole("button", { name: /^add image$/i }).first();
    const topbar = page.locator(".bb-topbar").first();
    const topbarTitleField = page.getByTestId("page-nav-title-input");
    const topbarTitleIcon = topbarTitleField.getByTestId("page-nav-title-icon");
    const brandMark = page.getByRole("link", { name: /bbnote home/i }).first();
    const userMenuButton = page.getByRole("button", { name: /open user menu/i }).first();

    await expect(mobileActions).toBeVisible();
    await expect(mobileEditorPanel).toBeVisible();
    await expect(desktopEditorPanel).toBeHidden();
    await expect(emptyState).toBeVisible();
    await expect(topbarTitleField).toHaveCount(0);
    await expect
      .poll(async () => parseFloat(await browseNotebooksButton.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(12.5);
    await expect
      .poll(async () => parseFloat(await browseNotebooksButton.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeLessThan(14.25);
    await expect
      .poll(async () => parseFloat(await emptyState.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(18.5);
    await expect
      .poll(async () => ({
        notebooks: await browseNotebooksButton.evaluate((element) => getComputedStyle(element).borderRadius),
        newNote: await browseNewNoteButton.evaluate((element) => getComputedStyle(element).borderRadius)
      }))
      .toEqual({
        notebooks: "0px",
        newNote: "0px"
      });
    await expect
      .poll(async () => (await browseNewNoteButton.boundingBox())?.height ?? 0)
      .toBeGreaterThan(36);
    await expect
      .poll(async () => (await browseNewNoteButton.boundingBox())?.height ?? 0)
      .toBeLessThan(42.5);
    await expect
      .poll(async () => {
        const topbarBox = await topbar.boundingBox();
        const menuBox = await userMenuButton.boundingBox();
        if (!topbarBox || !menuBox) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(topbarBox.x + topbarBox.width - (menuBox.x + menuBox.width));
      })
      .toBeLessThan(8);
    await expect
      .poll(async () => {
        const editorBox = await mobileEditorPanel.boundingBox();
        if (!editorBox || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return viewport.width - editorBox.width;
      })
      .toBeLessThan(8);
    await expect
      .poll(async () => {
        const editorBox = await mobileEditorPanel.boundingBox();
        if (!editorBox || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(editorBox.y + editorBox.height - viewport.height);
      })
      .toBeLessThan(14);
    await expect
      .poll(async () => (await mobileEditorPanel.boundingBox())?.height ?? 0)
      .toBeGreaterThan(520);
    await expect
      .poll(async () =>
        mobileEditorPanel.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            topLeft: styles.borderTopLeftRadius,
            topRight: styles.borderTopRightRadius,
            bottomRight: styles.borderBottomRightRadius,
            bottomLeft: styles.borderBottomLeftRadius
          };
        })
      )
      .toEqual({
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px"
      });

    await browseNotebooksButton.click();
    await expect(notebooksDrawer).toBeVisible();
    await expect
      .poll(async () => {
        const box = await notebooksDrawer.boundingBox();
        if (!box || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(box.x + box.width - viewport.width);
      })
      .toBeLessThan(2);
    await expect
      .poll(async () => {
        const box = await notebooksDrawer.boundingBox();
        if (!box || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(box.y + box.height - viewport.height);
      })
      .toBeLessThan(2);

    await createNotebookWithDialog(page, notebookName);
    await expect(notebooksDrawer).toHaveCount(0);
    await browseNotebooksButton.click();
    await expect(notebooksDrawer).toBeVisible();
    const mobileNotebookRow = notebooksDrawer.getByTestId(buildNotebookTestId("drag", notebookName)).locator(".bb-tree-row");
    await expect(mobileNotebookRow).toBeVisible();
    await expect
      .poll(async () => (await mobileNotebookRow.boundingBox())?.height ?? 0)
      .toBeGreaterThan(54);
    await notebooksDrawer
      .getByTestId(buildNotebookTestId("drag", notebookName))
      .locator(".bb-tree-row__content")
      .click();
    await expect(notebooksDrawer).toHaveCount(0);

    await expect(browseNewNoteButton).toBeEnabled();
    await browseNewNoteButton.click();
    await expect(titleInput).toHaveValue("");
    const initialUpdatedStatusText = await waitForUpdatedStatus(page);
    await titleInput.fill(firstNoteTitle);
    await textarea.fill(firstNoteBody);
    await waitForUpdatedStatus(page, initialUpdatedStatusText);
    await expect(mobileActions).toBeHidden();
    await expect(focusedShortcuts).toBeVisible();
    await expect(focusedNotebooksButton).toBeVisible();
    await expect(focusedNotesButton).toBeVisible();
    await expect(focusedNewNoteButton).toBeVisible();
    await expect(mobileEditorPanel.getByTestId("editor-updated-at")).toHaveCount(0);
    await expect
      .poll(async () => (await mobileToolbarImageButton.boundingBox())?.width ?? 0)
      .toBeLessThan(40);
    await expect
      .poll(async () => {
        const textareaBox = await textarea.boundingBox();
        const editorBox = await mobileEditorPanel.boundingBox();
        if (!textareaBox || !editorBox) {
          return 0;
        }
        return textareaBox.height / editorBox.height;
      })
      .toBeGreaterThan(0.48);
    await expect
      .poll(async () => parseFloat(await titleInput.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(17);
    await expect
      .poll(async () => parseFloat(await titleInput.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeLessThan(18.6);
    await expect
      .poll(async () => (await topbarTitleField.boundingBox())?.height ?? 0)
      .toBeLessThan(45);
    await expect
      .poll(async () => {
        const titleBox = await topbarTitleField.boundingBox();
        const iconBox = await topbarTitleIcon.boundingBox();
        if (!titleBox || !iconBox) {
          return 0;
        }
        return iconBox.x - titleBox.x;
      })
      .toBeGreaterThan(5);
    await expect
      .poll(async () => parseFloat(await textarea.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(19.8);
    await expect
      .poll(async () => parseFloat(await focusedNewNoteButton.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeLessThan(13.5);
    await expect
      .poll(async () => {
        const titleBox = await topbarTitleField.boundingBox();
        const brandBox = await brandMark.boundingBox();
        const menuBox = await userMenuButton.boundingBox();
        if (!titleBox || !brandBox || !menuBox) {
          return Number.POSITIVE_INFINITY;
        }
        const titleCenterY = titleBox.y + titleBox.height / 2;
        const brandCenterY = brandBox.y + brandBox.height / 2;
        const menuCenterY = menuBox.y + menuBox.height / 2;
        return Math.max(Math.abs(titleCenterY - brandCenterY), Math.abs(titleCenterY - menuCenterY));
      })
      .toBeLessThan(8);

    await focusedNewNoteButton.click();
    await expect(titleInput).toHaveValue("");
    const secondUpdatedStatusText = await waitForUpdatedStatus(page);
    await titleInput.fill(secondNoteTitle);
    await textarea.fill(secondNoteBody);
    await waitForUpdatedStatus(page, secondUpdatedStatusText);

    await focusedNotesButton.click();
    await expect(notesDrawer).toBeVisible();
    await expect
      .poll(async () => {
        const box = await notesDrawer.boundingBox();
        if (!box || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(box.x + box.width - viewport.width);
      })
      .toBeLessThan(2);
    await expect
      .poll(async () => {
        const box = await notesDrawer.boundingBox();
        if (!box || !viewport) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(box.y + box.height - viewport.height);
      })
      .toBeLessThan(2);
    await expect
      .poll(async () =>
        parseFloat(await notesDrawer.locator(".bb-search-shell input").evaluate((element) => getComputedStyle(element).fontSize))
      )
      .toBeGreaterThanOrEqual(18);

    const firstMobileNoteCard = notesDrawer.getByTestId(buildNoteTestId("drag", firstNoteTitle));
    const secondMobileNoteCard = notesDrawer.getByTestId(buildNoteTestId("drag", secondNoteTitle));
    await expect(firstMobileNoteCard).toBeVisible();
    await expect(secondMobileNoteCard).toBeVisible();
    await expect
      .poll(async () => (await firstMobileNoteCard.boundingBox())?.height ?? 0)
      .toBeGreaterThan(72);
    await firstMobileNoteCard.click();
    await expect(notesDrawer).toHaveCount(0);
    await expect(titleInput).toHaveValue(firstNoteTitle);

    await focusedNotebooksButton.click();
    await expect(notebooksDrawer).toBeVisible();
    await notebooksDrawer
      .getByTestId(buildNotebookTestId("drag", notebookName))
      .locator(".bb-tree-row__content")
      .click();
    await expect(notebooksDrawer).toHaveCount(0);
    await expect(mobileActions).toBeVisible();
    await expect(focusedShortcuts).toHaveCount(0);
  });

  test("applies the larger phone scale on wider mobile screens", async ({ page }) => {
    const suffix = createTestSuffix();
    const notebookName = `Large phone ${suffix}`;
    const noteTitle = `Large phone note ${suffix}`;
    const noteBody = `Wider phone body ${suffix}\n\nThis should still feel app-sized.`;
    const topbar = page.locator(".bb-topbar").first();
    const topbarTitleField = page.getByTestId("page-nav-title-input");
    const topbarTitleIcon = topbarTitleField.getByTestId("page-nav-title-icon");
    const brandMark = page.getByRole("link", { name: /bbnote home/i }).first();
    const userMenuButton = page.getByRole("button", { name: /open user menu/i }).first();

    await login(page);
    await page.setViewportSize({ width: 540, height: 960 });

    await expect(mobileActions).toBeVisible();
    await expect(mobileEditorPanel).toBeVisible();
    await expect(topbarTitleField).toHaveCount(0);
    await expect
      .poll(async () => parseFloat(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)))
      .toBeGreaterThanOrEqual(17);
    await expect
      .poll(async () => parseFloat(await browseNewNoteButton.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(12.5);
    await expect
      .poll(async () => parseFloat(await browseNewNoteButton.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeLessThan(14.25);
    await expect
      .poll(async () => ({
        notebooks: await browseNotebooksButton.evaluate((element) => getComputedStyle(element).borderRadius),
        newNote: await browseNewNoteButton.evaluate((element) => getComputedStyle(element).borderRadius)
      }))
      .toEqual({
        notebooks: "0px",
        newNote: "0px"
      });
    await expect
      .poll(async () => (await browseNewNoteButton.boundingBox())?.height ?? 0)
      .toBeGreaterThan(36);
    await expect
      .poll(async () => (await browseNewNoteButton.boundingBox())?.height ?? 0)
      .toBeLessThan(42.5);
    await expect
      .poll(async () => {
        const topbarBox = await topbar.boundingBox();
        const menuBox = await userMenuButton.boundingBox();
        if (!topbarBox || !menuBox) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(topbarBox.x + topbarBox.width - (menuBox.x + menuBox.width));
      })
      .toBeLessThan(8);

    await browseNotebooksButton.click();
    await expect(notebooksDrawer).toBeVisible();
    await createNotebookWithDialog(page, notebookName);
    await expect(notebooksDrawer).toHaveCount(0);
    await browseNotebooksButton.click();
    await expect(notebooksDrawer).toBeVisible();
    await notebooksDrawer
      .getByTestId(buildNotebookTestId("drag", notebookName))
      .locator(".bb-tree-row__content")
      .click();
    await expect(notebooksDrawer).toHaveCount(0);
    await expect(browseNewNoteButton).toBeEnabled();

    await browseNewNoteButton.click();
    const initialUpdatedStatusText = await waitForUpdatedStatus(page);
    await titleInput.fill(noteTitle);
    await textarea.fill(noteBody);
    await waitForUpdatedStatus(page, initialUpdatedStatusText);
    await expect(mobileActions).toBeHidden();
    await expect(focusedShortcuts).toBeVisible();
    await expect(mobileEditorPanel.getByTestId("editor-updated-at")).toHaveCount(0);

    await expect
      .poll(async () => parseFloat(await titleInput.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(17);
    await expect
      .poll(async () => parseFloat(await titleInput.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeLessThan(18.6);
    await expect
      .poll(async () => (await topbarTitleField.boundingBox())?.height ?? 0)
      .toBeLessThan(45);
    await expect
      .poll(async () => {
        const titleBox = await topbarTitleField.boundingBox();
        const iconBox = await topbarTitleIcon.boundingBox();
        if (!titleBox || !iconBox) {
          return 0;
        }
        return iconBox.x - titleBox.x;
      })
      .toBeGreaterThan(5);
    await expect
      .poll(async () => parseFloat(await textarea.evaluate((element) => getComputedStyle(element).fontSize)))
      .toBeGreaterThanOrEqual(19.8);
    await expect
      .poll(async () => {
        const textareaBox = await textarea.boundingBox();
        const editorBox = await mobileEditorPanel.boundingBox();
        if (!textareaBox || !editorBox) {
          return 0;
        }
        return textareaBox.height / editorBox.height;
      })
      .toBeGreaterThan(0.52);
    await expect
      .poll(async () => {
        const titleBox = await topbarTitleField.boundingBox();
        const brandBox = await brandMark.boundingBox();
        const menuBox = await userMenuButton.boundingBox();
        if (!titleBox || !brandBox || !menuBox) {
          return Number.POSITIVE_INFINITY;
        }
        const titleCenterY = titleBox.y + titleBox.height / 2;
        const brandCenterY = brandBox.y + brandBox.height / 2;
        const menuCenterY = menuBox.y + menuBox.height / 2;
        return Math.max(Math.abs(titleCenterY - brandCenterY), Math.abs(titleCenterY - menuCenterY));
      })
      .toBeLessThan(8);

    await focusedNotesButton.click();
    await expect(notesDrawer).toBeVisible();
    await expect
      .poll(async () =>
        parseFloat(await notesDrawer.locator(".bb-search-shell input").evaluate((element) => getComputedStyle(element).fontSize))
      )
      .toBeGreaterThanOrEqual(18);
    await expect(notesDrawer.getByTestId(buildNoteTestId("drag", noteTitle))).toBeVisible();
  });
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
  expect(topbarBox?.height ?? 0).toBeLessThan(38);
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
  await expect(renameNotebookDialog.locator(".bb-dialog__description")).toHaveCount(0);
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
  const notebookBeforeDropZone = page.getByTestId(buildNotebookTestId("before", notebookName));
  await expect(archiveNotebookRow).toBeVisible();
  const folderSpacingPreview = await startDrag(page, archiveNotebookDragRow);
  await notebookBeforeDropZone.dispatchEvent("dragover", { dataTransfer: folderSpacingPreview });
  await expect(page.getByTestId(buildNotebookTestId("node", notebookName))).toHaveClass(/bb-tree-node--drop-before/);
  await endDrag(archiveNotebookDragRow, folderSpacingPreview);
  await dragLocatorToLocator(
    page,
    archiveNotebookDragRow,
    notebookBeforeDropZone
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
  const bodyTextarea = activeEditorTextarea(page);
  expect(await bodyTextarea.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await expect(page.getByText("Uploaded files will appear here.")).toHaveCount(0);
  await expect
    .poll(async () => {
      const toolbar = page.getByTestId("editor-media-toolbar").first();
      const widths = await toolbar.locator("button").evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).borderTopWidth));
      return widths.join("|");
    })
    .toBe("0px|0px|0px|0px|0px|0px");
  await expect
    .poll(async () => {
      const textareaBox = await bodyTextarea.boundingBox();
      const footerBox = await activeEditorFooter(page).boundingBox();
      if (!textareaBox || !footerBox) {
        return Number.POSITIVE_INFINITY;
      }
      return footerBox.y - (textareaBox.y + textareaBox.height);
    })
    .toBeLessThan(56);
  await bodyTextarea.fill(`# Budget\n\nalpha launch ${searchTerm}`);
  await expect(page.getByText(/^Saved /)).toHaveCount(0);
  await expect(page.locator(".bb-editor-body-header")).toHaveCount(0);
  await expect(activeEditorPanel(page).locator(".bb-editor-header .bb-editor-mode").first()).toBeVisible();
  await waitForUpdatedStatus(page);

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  const followUpInitialStatusText = await waitForUpdatedStatus(page);
  await page.getByRole("textbox", { name: "Title" }).first().fill(followUpNoteTitle);
  await activeEditorTextarea(page).fill("Second note to test manual priority.");
  await waitForUpdatedStatus(page, followUpInitialStatusText);

  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);
  await expect(page.locator('[data-testid^="note-drag-"] .bb-note-icon')).toHaveCount(0);
  const followUpNoteCard = page.locator('[data-testid^="note-drag-"]').filter({ hasText: followUpNoteTitle }).first();
  const targetNoteSlot = page.getByTestId(buildNoteTestId("slot", noteTitle));
  const targetNoteDropBefore = page.getByTestId(buildNoteTestId("before", noteTitle));
  await expect(followUpNoteCard).toBeVisible();
  const dragReadyPreview = await startNoteDrag(page, followUpNoteCard);
  await expect(targetNoteSlot).toHaveClass(/is-drag-ready/);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropBefore.evaluate((element) => getComputedStyle(element).height)))
    .toBeGreaterThan(10);
  await expect
    .poll(async () => Number.parseFloat(await targetNoteDropBefore.evaluate((element) => getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
  await endDrag(followUpNoteCard, dragReadyPreview);
  await dragNoteCardToNoteCard(page, followUpNoteCard, targetNoteSlot, "top");
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
  const followUpBody = activeEditorTextarea(page);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue(followUpNoteTitle);
  await expect(followUpBody).toHaveValue("Second note to test manual priority.");
  const previousFollowUpStatusText = await waitForUpdatedStatus(page);
  await followUpBody.click();
  await followUpBody.press("Control+A");
  await followUpBody.press("Delete");
  await followUpBody.pressSequentially("Second note to test manual priority and autosave list refresh.");
  await expect(followUpBody).toHaveValue("Second note to test manual priority and autosave list refresh.");
  await waitForUpdatedStatus(page, previousFollowUpStatusText);
  await expect(page.locator(".bb-skeleton-card")).toHaveCount(0);
  await expect(page.getByTestId(buildNoteTestId("drag", followUpNoteTitle))).toBeVisible();
  await waitForUpdatedStatus(page);

  await page.getByPlaceholder("Search notes").fill("priority");
  await expect(page.locator('[data-testid^="note-before-"]')).toHaveCount(0);
  await page.getByPlaceholder("Search notes").fill("");
  await expect.poll(async () => page.locator('[data-testid^="note-drag-"]').count()).toBe(2);

  await allNotesButton.click();
  await expect(page.locator('[data-testid^="note-before-"]')).toHaveCount(0);
  await expect(page.getByText(noteTitle).first()).toBeVisible();
  await expect
    .poll(async () =>
      page.locator('[data-testid^="note-drag-"]').evaluateAll((elements) =>
        elements.filter((element) => {
          const noteCard = element as HTMLElement;
          return noteCard.draggable || noteCard.classList.contains("bb-note-card--draggable");
        }).length
      )
    )
    .toBe(0);

  const notePreview = page.getByRole("button", { name: new RegExp(noteTitle, "i") }).first();
  await expect(notePreview).toBeVisible();
  await notePreview.click();
  await expect(notePreview).toHaveClass(/is-active/);
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
  expect(await activeEditorPanel(page).locator(".bb-markdown").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Open Sans");
  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await page.getByRole("button", { name: /^markdown$/i }).click();

  const uploadFile = await createTempFile("budget.txt", "budget attachment");
  await page.locator('input[type="file"]').first().setInputFiles(uploadFile);
  await expect(page.getByRole("button", { name: /attachments/i }).first()).toBeVisible();
  await expect(activeAttachmentCards(page).filter({ hasText: "budget.txt" }).first()).toBeVisible();

  await page.getByRole("button", { name: /^link$/i }).click();
  await expect(activeEditorTextarea(page)).toHaveValue(/budget\.txt/);

  await page.getByPlaceholder("Search notes").fill("");
  await notebookRow(page, renamedSubNotebookName).click();
  await expect(notebookRowContainer(page, renamedSubNotebookName)).toHaveClass(/is-active/);
  await expect(page.getByTestId("notes-refresh-indicator")).toHaveCount(0);
  const desktopFollowUpNoteDrag = page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", followUpNoteTitle));
  const archiveNotebookDropTarget = page.getByTestId("notebook-pane").getByTestId(buildNotebookTestId("drag", archiveNotebookName));
  const moveNoteResponse = page.waitForResponse((response) => {
    if (response.request().method() !== "PATCH" || !response.ok()) {
      return false;
    }

    return /^\/api\/v1\/notes\/[^/]+\/move$/.test(new URL(response.url()).pathname);
  });
  await expect(desktopFollowUpNoteDrag).toBeVisible();
  const moveToArchiveDrag = await startHeldNoteDrag(page, desktopFollowUpNoteDrag);
  await archiveNotebookDropTarget.dispatchEvent("dragenter", { dataTransfer: moveToArchiveDrag });
  await archiveNotebookDropTarget.dispatchEvent("dragover", { dataTransfer: moveToArchiveDrag });
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-note-target/);
  const archiveNotebookBox = await archiveNotebookDropTarget.boundingBox();
  if (!archiveNotebookBox) {
    throw new Error("Expected the archive notebook drop target to be visible.");
  }
  await page.mouse.move(
    archiveNotebookBox.x + archiveNotebookBox.width / 2,
    archiveNotebookBox.y + archiveNotebookBox.height / 2,
    { steps: 8 }
  );
  await archiveNotebookDropTarget.dispatchEvent("drop", { dataTransfer: moveToArchiveDrag });
  await endDrag(desktopFollowUpNoteDrag, moveToArchiveDrag, page);
  await moveNoteResponse;
  await expect(page.getByTestId("notes-refresh-indicator")).toHaveCount(0);
  await expect(page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", followUpNoteTitle))).toBeVisible();
  await expect(page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", noteTitle))).toHaveCount(0);
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await notebookRow(page, archiveNotebookName).click();
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", followUpNoteTitle))).toBeVisible();

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
  const followUpNoteDrag = page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", followUpNoteTitle));
  await expect(page.getByTestId("notebooks-delete-target")).toHaveCount(0);

  const cancelDeleteFromNotebookLaneDrag = await startNoteDrag(page, followUpNoteDrag);
  const deleteNotebookTargetForNote = page.getByTestId("notebooks-delete-target");
  await expect(deleteNotebookTargetForNote).toBeVisible();
  await deleteNotebookTargetForNote.dispatchEvent("dragover", { dataTransfer: cancelDeleteFromNotebookLaneDrag });
  await expect(deleteNotebookTargetForNote).toHaveClass(/is-active/);
  await dropOnTarget(followUpNoteDrag, deleteNotebookTargetForNote, cancelDeleteFromNotebookLaneDrag);
  const moveToDeletedDialog = page.getByRole("dialog", { name: /^move note to deleted notes\?$/i });
  await expect(moveToDeletedDialog).toBeVisible();
  await moveToDeletedDialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(moveToDeletedDialog).toHaveCount(0);
  await notebookRow(page, archiveNotebookName).click();
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(followUpNoteDrag).toBeVisible();

  const cancelDeleteDrag = await startNoteDrag(page, followUpNoteDrag);
  const deleteNoteTarget = page.getByTestId("notes-delete-target");
  await expect(deleteNoteTarget).toBeVisible();
  await expect(page.getByTestId("notes-actions")).toHaveCount(0);
  const noteDeleteStyles = await expectCenteredHeaderAction(notesHeader, deleteNoteTarget);
  expect(noteDeleteStyles.backgroundColor).toBe(expectedTrashBackgroundColor);
  expect(noteDeleteStyles.color).toBe(expectedTrashColor);
  await deleteNoteTarget.dispatchEvent("dragover", { dataTransfer: cancelDeleteDrag });
  await expect(deleteNoteTarget).toHaveClass(/is-active/);
  const activeNoteDeleteStyles = await getHeaderActionStyles(deleteNoteTarget);
  expect(activeNoteDeleteStyles.backgroundColor).not.toBe(noteDeleteStyles.backgroundColor);
  expect(activeNoteDeleteStyles.backgroundImage).toBe(expectedActiveTrashBackgroundImage);
  await dropOnTarget(followUpNoteDrag, deleteNoteTarget, cancelDeleteDrag);
  const moveToDeletedDialogFromNotesLane = page.getByRole("dialog", { name: /^move note to deleted notes\?$/i });
  await expect(moveToDeletedDialogFromNotesLane).toBeVisible();
  await moveToDeletedDialogFromNotesLane.getByRole("button", { name: /^cancel$/i }).click();
  await expect(moveToDeletedDialogFromNotesLane).toHaveCount(0);
  await notebookRow(page, archiveNotebookName).click();
  await expect(notebookRowContainer(page, archiveNotebookName)).toHaveClass(/is-active/);
  await expect(followUpNoteDrag).toBeVisible();

  const confirmDeleteDrag = await startNoteDrag(page, followUpNoteDrag);
  await expect(deleteNoteTarget).toBeVisible();
  await dropOnTarget(followUpNoteDrag, deleteNoteTarget, confirmDeleteDrag);
  await page.getByRole("dialog", { name: /^move note to deleted notes\?$/i }).getByRole("button", { name: /^move to deleted notes$/i }).click();
  await expect(page.getByText(followUpNoteTitle).first()).toHaveCount(0);
  await expect(page.getByRole("button", { name: /choose icon for deleted notes/i })).toHaveCount(0);
  await expect(page.getByTestId(buildNotebookTestId("drag", "Deleted Notes"))).toBeVisible();
  await expect
    .poll(async () => {
      const items = await page
        .locator('[data-testid^="notebook-drag-"] .bb-tree-row__label')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.trim() ?? ""));
      return items[items.length - 1];
    })
    .toBe("Deleted Notes");

  await allNotesButton.click();
  await expect(page.getByText(followUpNoteTitle).first()).toHaveCount(0);
  await expect(page.getByText(noteTitle).first()).toBeVisible();

  await notebookRow(page, "Deleted Notes").click();
  await expect(notebookRowContainer(page, "Deleted Notes")).toHaveClass(/is-active/);
  await expect(page.getByText(followUpNoteTitle).first()).toBeVisible();
  await page.getByRole("button", { name: new RegExp(followUpNoteTitle, "i") }).click();
  await activeEditorPanel(page).getByRole("button", { name: /delete note/i }).click();
  const permanentDeleteDialog = page.getByRole("dialog", { name: /^delete note permanently\?$/i });
  await expect(permanentDeleteDialog).toBeVisible();
  await permanentDeleteDialog.getByRole("button", { name: /^delete permanently$/i }).click();
  await expect(page.getByText(followUpNoteTitle).first()).toHaveCount(0);

  await notebookRow(page, renamedSubNotebookName).click();
  await expect(notebookRowContainer(page, renamedSubNotebookName)).toHaveClass(/is-active/);

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

test("opens notes on click, switches the cursor after a hold, and keeps held release from opening the note", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Click then drag ${suffix}`;
  const firstNoteTitle = `Alpha ${suffix}`;
  const secondNoteTitle = `Beta ${suffix}`;
  const thirdNoteTitle = `Gamma ${suffix}`;

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await notebookRow(page, notebookName).click();

  await createNoteWithContent(page, firstNoteTitle, "First note body.");
  const firstNoteId = extractNoteIdFromUrl(page.url());
  await createNoteWithContent(page, secondNoteTitle, "Second note body.");
  const secondNoteId = extractNoteIdFromUrl(page.url());
  await createNoteWithContent(page, thirdNoteTitle, "Third note body.");
  const firstNoteCard = page.getByTestId(buildNoteTestId("drag", firstNoteTitle));
  const secondNoteCard = page.getByTestId(buildNoteTestId("drag", secondNoteTitle));
  const thirdNoteCard = page.getByTestId(buildNoteTestId("drag", thirdNoteTitle));

  await expect
    .poll(async () => firstNoteCard.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("pointer");

  await firstNoteCard.click();
  await expect(page).toHaveURL(new RegExp(`/folders/[^/]+/notes/${firstNoteId}$`));

  await holdNoteCardWithMouseDown(page, secondNoteCard);
  await expect
    .poll(async () => secondNoteCard.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("grabbing");
  await page.mouse.up();
  await page.waitForTimeout(50);
  await expect(page).toHaveURL(new RegExp(`/folders/[^/]+/notes/${firstNoteId}$`));
  await expect(page).not.toHaveURL(new RegExp(`/folders/[^/]+/notes/${secondNoteId}$`));
  await expect
    .poll(async () => secondNoteCard.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("pointer");

  await armNoteCardForDrag(page, thirdNoteCard, "touch");
  const touchDragPreview = await page.evaluateHandle(() => new DataTransfer());
  await thirdNoteCard.dispatchEvent("dragstart", { dataTransfer: touchDragPreview });
  await expect(page.getByTestId("notes-delete-target")).toBeVisible();
  await endDrag(thirdNoteCard, touchDragPreview);
  await thirdNoteCard.dispatchEvent("pointerup", { button: 0, pointerType: "touch" });
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

  const downwardIndicatorDrag = await startNoteDrag(page, downwardSource);
  await downwardTargetSlot.dispatchEvent("dragover", {
    dataTransfer: downwardIndicatorDrag,
    clientY: downwardTargetBox.y + 10
  });
  await expect(downwardTargetSlot).toHaveClass(/is-drop-after/);
  await expect(downwardTargetCard).toHaveClass(/bb-note-card--drop-after/);
  await expect(downwardTargetCard).toHaveClass(/bb-note-card--shift-up/);
  await endDrag(downwardSource, downwardIndicatorDrag);

  await dragNoteCardToNoteCard(page, downwardSource, downwardTargetSlot, "bottom");
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle]);

  await dragNoteCardToNoteCard(
    page,
    page.getByTestId(buildNoteTestId("drag", firstNoteTitle)),
    page.getByTestId(buildNoteTestId("slot", secondNoteTitle)),
    "top"
  );
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [firstNoteTitle, secondNoteTitle]);
});

test("reorders notes when dropped on the explicit seam lanes", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const suffix = Date.now().toString();
  const notebookName = `Lane reorder ${suffix}`;
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

  await dragNoteCardToNoteCard(
    page,
    page.getByTestId(buildNoteTestId("drag", thirdNoteTitle)),
    page.getByTestId(buildNoteTestId("slot", secondNoteTitle)),
    "top"
  );
  await expectNoteOrderInLane(page, [firstNoteTitle, thirdNoteTitle, secondNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [firstNoteTitle, thirdNoteTitle, secondNoteTitle]);

  await dragNoteCardToNoteCard(
    page,
    page.getByTestId(buildNoteTestId("drag", firstNoteTitle)),
    page.getByTestId(buildNoteTestId("slot", secondNoteTitle)),
    "top"
  );
  await expectNoteOrderInLane(page, [thirdNoteTitle, firstNoteTitle, secondNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [thirdNoteTitle, firstNoteTitle, secondNoteTitle]);
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

  const gapDrag = await startNoteDrag(page, source);
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
  await endDrag(source, gapDrag);
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle, thirdNoteTitle]);

  await page.reload();
  await notebookRow(page, notebookName).click();
  await expectNoteOrderInLane(page, [secondNoteTitle, firstNoteTitle, thirdNoteTitle]);
});

test("waits for autosave before moving another note to a notebook", async ({ page }) => {
  const suffix = Date.now().toString();
  const archiveName = `Move archive ${suffix}`;
  const sourceName = `Move source ${suffix}`;
  const movingTitle = `Moving note ${suffix}`;
  await login(page, { assertTheme: false });
  await createNotebookWithDialog(page, archiveName);
  await page.getByRole("button", { name: /all notes/i }).first().click();
  await createNotebookWithDialog(page, sourceName);
  await createNoteWithContent(page, movingTitle, "Move this note.");
  await createNoteWithContent(page, `Editing note ${suffix}`, "Keep this edit.");
  const editorId = extractNoteIdFromUrl(page.url());

  let releaseSave!: () => void;
  let saveStarted!: () => void;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  const pendingSave = new Promise<void>((resolve) => { saveStarted = resolve; });
  await page.route(`**/api/v1/notes/${editorId}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    saveStarted();
    await saveGate;
    await route.fulfill({ response });
  });
  await activeEditorTextarea(page).fill("Keep this edit while another note moves.");
  await pendingSave;
  await page.evaluate(() => {
    const state = window as Window & { noteMoveRequests: number };
    state.noteMoveRequests = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (init?.method === "PATCH" && /\/notes\/[^/]+\/move$/.test(url)) {
        state.noteMoveRequests += 1;
      }
      return originalFetch(input, init);
    };
  });

  const source = page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", movingTitle));
  const target = page.getByTestId("notebook-pane").getByTestId(buildNotebookTestId("drag", archiveName));
  const moved = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/notes\/[^/]+\/move$/.test(response.url()));
  let prematureMoves = -1;
  try {
    const transfer = await startHeldNoteDrag(page, source);
    await target.dispatchEvent("dragover", { dataTransfer: transfer });
    await target.dispatchEvent("drop", { dataTransfer: transfer });
    await endDrag(source, transfer, page);
    prematureMoves = await page.evaluate(() => (window as Window & { noteMoveRequests: number }).noteMoveRequests);
  } finally {
    releaseSave();
  }
  expect((await moved).ok()).toBe(true);
  expect(prematureMoves).toBe(0);
  await expect(notebookRowContainer(page, archiveName)).toHaveClass(/is-active/);
  await expect(page.getByTestId("notes-pane").getByTestId(buildNoteTestId("drag", movingTitle))).toBeVisible();
});

test("shows the note title in the topbar above the editor lane and supports table insertion, fullscreen editing, and markdown formatting tools", async ({
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

  const topbar = page.locator(".bb-topbar");
  const editorPanel = page.getByTestId("editor-panel-desktop");
  const topbarTitleField = topbar.getByTestId("page-nav-title-input");
  const editorHeader = editorPanel.locator(".bb-editor-header");
  const editorStack = editorPanel.locator(".bb-editor-stack");
  const titleIcon = topbarTitleField.getByTestId("page-nav-title-icon");
  const titleInput = topbar.getByRole("textbox", { name: "Title" });
  const expandEditorButton = editorHeader.getByRole("button", { name: /^expand editor$/i });
  const deleteButton = editorHeader.getByRole("button", { name: /delete note/i });
  const updatedAtStatus = editorPanel.getByTestId("editor-updated-at");
  const editorHeaderActions = editorHeader.locator(".bb-editor-header__actions");
  const textarea = editorPanel.getByPlaceholder("Write in Markdown");

  await expect(titleIcon).toBeVisible();
  await expect(titleIcon).toHaveAttribute("data-icon", "document");
  await expect(titleInput).toBeVisible();
  await expect(titleInput).toHaveAttribute("placeholder", "Untitled note");
  await expect(editorPanel.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(expandEditorButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expect(activeEditorPanel(page).getByTestId("editor-format-toolbar")).toBeVisible();
  await expect(updatedAtStatus).toBeVisible();
  await textarea.click();
  await expect
    .poll(async () =>
      titleInput.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          boxShadow: styles.boxShadow
        };
      })
    )
    .toEqual({
      backgroundColor: "rgba(0, 0, 0, 0)",
      boxShadow: "none"
    });

  const topbarBox = await topbar.boundingBox();
  const editorPanelBox = await editorPanel.boundingBox();
  const topbarTitleFieldBox = await topbarTitleField.boundingBox();
  const editorStackBox = await editorStack.boundingBox();
  const titleIconBox = await titleIcon.boundingBox();
  const titleInputBox = await titleInput.boundingBox();
  const textareaBox = await textarea.boundingBox();
  const deleteButtonBox = await deleteButton.boundingBox();
  const updatedAtStatusBox = await updatedAtStatus.boundingBox();
  const editorHeaderActionsBox = await editorHeaderActions.boundingBox();
  expect(topbarBox).not.toBeNull();
  expect(editorPanelBox).not.toBeNull();
  expect(topbarTitleFieldBox).not.toBeNull();
  expect(editorStackBox).not.toBeNull();
  expect(titleIconBox).not.toBeNull();
  expect(titleInputBox).not.toBeNull();
  expect(textareaBox).not.toBeNull();
  expect(deleteButtonBox).not.toBeNull();
  expect(updatedAtStatusBox).not.toBeNull();
  expect(editorHeaderActionsBox).not.toBeNull();
  if (!topbarBox || !editorPanelBox || !topbarTitleFieldBox || !editorStackBox || !titleIconBox || !titleInputBox || !textareaBox || !deleteButtonBox || !updatedAtStatusBox || !editorHeaderActionsBox) {
    throw new Error("Expected the topbar title input and editor actions layout to be visible.");
  }
  const titleGap = titleInputBox.x - (titleIconBox.x + titleIconBox.width);
  expect(topbarTitleFieldBox.x).toBeGreaterThanOrEqual(editorPanelBox.x - 4);
  expect(topbarTitleFieldBox.x + topbarTitleFieldBox.width).toBeLessThanOrEqual(editorPanelBox.x + editorPanelBox.width + 4);
  expect(titleGap).toBeGreaterThan(1);
  expect(titleGap).toBeLessThan(10);
  expect(Math.abs(titleIconBox.y + titleIconBox.height / 2 - (titleInputBox.y + titleInputBox.height / 2))).toBeLessThan(2);
  expect(titleIconBox.width).toBeLessThan(18);
  expect(Math.abs(topbarTitleFieldBox.x - editorPanelBox.x)).toBeLessThan(12);
  expect(topbarTitleFieldBox.y).toBeGreaterThanOrEqual(topbarBox.y - 1);
  expect(topbarTitleFieldBox.y + topbarTitleFieldBox.height).toBeLessThanOrEqual(topbarBox.y + topbarBox.height + 1);
  expect(titleInputBox.y).toBeLessThan(editorPanelBox.y - 8);
  expect(titleInputBox.height).toBeLessThan(34);
  expect(titleInputBox.width).toBeGreaterThan(editorPanelBox.width * 0.3);
  expect(topbarBox.height).toBeLessThan(38);
  expect(textareaBox.height / editorStackBox.height).toBeGreaterThan(0.72);
  expect(updatedAtStatusBox.x + updatedAtStatusBox.width).toBeLessThanOrEqual(editorHeaderActionsBox.x + 8);
  await titleInput.click();
  await expect
    .poll(async () =>
      titleInput.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderTopColor,
          boxShadow: styles.boxShadow,
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius,
          fontWeight: styles.fontWeight
        };
      })
    )
    .toEqual({
      backgroundColor: expect.not.stringMatching(/^rgba\(0,\s0,\s0,\s0\)$/),
      borderColor: expect.not.stringMatching(/^rgba\(0,\s0,\s0,\s0\)$/),
      boxShadow: expect.not.stringMatching(/^none$/),
      topLeft: "0px",
      topRight: "0px",
      bottomRight: "0px",
      bottomLeft: "0px",
      fontWeight: "600"
    });
  await expect
    .poll(async () =>
      textarea.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        };
      })
    )
    .toEqual({
      topLeft: "0px",
      topRight: "0px",
      bottomRight: "0px",
      bottomLeft: "0px"
    });

  const uploadFile = await createTempFile(`toolbar-attachment-${suffix}.txt`, "budget attachment");
  await page.getByTestId("media-input-file").first().setInputFiles(uploadFile);
  const attachmentList = editorPanel.getByTestId("attachment-list").first();
  const attachmentCard = attachmentList.locator(".bb-attachment-card").first();
  const attachmentIcon = attachmentCard.locator(".bb-attachment-card__icon").first();
  const attachmentToggle = attachmentList.locator(".bb-attachment-list__toggle");
  const attachmentActionButton = attachmentCard.locator(".bb-attachment-card__button").first();
  await expect(attachmentList).toBeVisible();
  await expect(attachmentList.getByText(`toolbar-attachment-${suffix}.txt`)).toBeVisible();
  await expect(attachmentIcon).toBeVisible();
  await expect
    .poll(async () => ({
      list: await attachmentList.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius
        };
      }),
      card: await attachmentCard.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          topLeft: styles.borderTopLeftRadius,
          topRight: styles.borderTopRightRadius,
          bottomRight: styles.borderBottomRightRadius,
          bottomLeft: styles.borderBottomLeftRadius,
          backgroundColor: styles.backgroundColor,
          borderTopWidth: styles.borderTopWidth,
          boxShadow: styles.boxShadow
        };
      }),
      button: await attachmentActionButton.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          borderTopWidth: styles.borderTopWidth
        };
      }),
      cardHeight: (await attachmentCard.boundingBox())?.height ?? Number.POSITIVE_INFINITY,
      iconWidth: (await attachmentIcon.boundingBox())?.width ?? Number.POSITIVE_INFINITY,
      toggleHeight: await attachmentToggle.evaluate((element) => element.getBoundingClientRect().height),
      buttonHeight: await attachmentActionButton.evaluate((element) => element.getBoundingClientRect().height)
    }))
    .toEqual({
      list: {
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px"
      },
      card: {
        topLeft: "0px",
        topRight: "0px",
        bottomRight: "0px",
        bottomLeft: "0px",
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderTopWidth: "0px",
        boxShadow: "none"
      },
      button: {
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderTopWidth: "0px"
      },
      cardHeight: expect.any(Number),
      iconWidth: expect.any(Number),
      toggleHeight: expect.any(Number),
      buttonHeight: expect.any(Number)
    });
  expect((await attachmentIcon.boundingBox())?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(20);
  expect((await attachmentCard.boundingBox())?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(74);
  expect(await attachmentToggle.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(50);
  expect(await attachmentActionButton.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(32);

  await expect
    .poll(async () => notebookRow(page, notebookName).evaluate((element) => getComputedStyle(element).cursor))
    .toBe("pointer");
  await expect
    .poll(async () =>
      page
        .getByTestId(buildNoteTestId("drag", noteTitle))
        .evaluate((element) => getComputedStyle(element).cursor)
    )
    .toBe("pointer");

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
  const tablePicker = page.getByRole("dialog", { name: /^insert table$/i });
  await expect(tablePicker).toBeVisible();
  await expect(tablePicker.getByTestId("table-picker-grid")).toBeVisible();
  await expect(tablePicker.getByTestId("table-picker-summary")).toHaveText("2 columns x 1 row");
  await tablePicker.getByRole("button", { name: /^insert table$/i }).click();
  await expect(textarea).toHaveValue("| Column 1 | Column 2 |\n| --- | --- |\n|  |  |");
  await expect
    .poll(async () =>
      textarea.evaluate((element) => {
        const textareaElement = element as HTMLTextAreaElement;
        return {
          selectionStart: textareaElement.selectionStart,
          selectionEnd: textareaElement.selectionEnd,
          selectedText: textareaElement.value.slice(textareaElement.selectionStart, textareaElement.selectionEnd)
        };
      })
    )
    .toEqual({
      selectionStart: 2,
      selectionEnd: 10,
      selectedText: "Column 1"
    });

  await textarea.fill("");
  await editorPanel.getByRole("button", { name: /^insert table$/i }).click();
  await expect(tablePicker).toBeVisible();
  await tablePicker.getByRole("button", { name: /^use 3 columns x 2 rows$/i }).click();
  await expect(textarea).toHaveValue("| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |");
  await expect
    .poll(async () =>
      textarea.evaluate((element) => {
        const textareaElement = element as HTMLTextAreaElement;
        return {
          selectionStart: textareaElement.selectionStart,
          selectionEnd: textareaElement.selectionEnd,
          selectedText: textareaElement.value.slice(textareaElement.selectionStart, textareaElement.selectionEnd)
        };
      })
    )
    .toEqual({
      selectionStart: 2,
      selectionEnd: 10,
      selectedText: "Column 1"
    });

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

test.describe("scratch overlay", () => {
  test("draws without disturbing the note, saves once per stroke, and survives a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1900, height: 1000 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    await createNoteWithContent(page, `Inline scratch ${suffix}`, "Sketch goes here.");
    await waitForUpdatedStatus(page);

    const panel = page.getByTestId("editor-panel-desktop");
    const textarea = panel.getByPlaceholder("Write in Markdown");
    const scratchButton = panel.getByRole("button", { name: /^scratch$/i });

    // Turning scratch on must not remount the textarea, or it would lose focus, selection, and undo history.
    await selectTextRange(textarea, 7, 11);
    await textarea.evaluate((element) => element.setAttribute("data-same-element", "yes"));
    const plainLayout = await readScratchTextLayout(page);
    const plainTextOrigin = await readTextOrigin(textarea);
    await scratchButton.click();
    await expect(scratchButton).toHaveAttribute("aria-pressed", "true");
    await expect(scratchButton).toHaveClass(/bb-icon-button--is-active/);
    await expect(panel.getByTestId("scratch-toolbar")).toBeVisible();
    await expect(textarea).toHaveAttribute("data-same-element", "yes");
    await expect
      .poll(() => textarea.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]))
      .toEqual([7, 11]);

    // Turning scratch on must not move or re-wrap a single word.
    expect(await readScratchTextLayout(page)).toEqual(plainLayout);
    expect(await readTextOrigin(textarea)).toEqual(plainTextOrigin);

    // Nor may the first stroke, which locks the layout to its current width.
    const widthBeforeStroke = await textarea.evaluate((element) => element.clientWidth);
    const updates = trackNoteUpdates(page);

    await page.mouse.move(0, 0);
    const { x: rightClickX, y: rightClickY } = await scratchClientPoint(page, 300, 300);
    await page.mouse.move(rightClickX, rightClickY);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.mouse.click(0, 0);

    await drawScratchStroke(page, [[200, 100], [320, 150], [480, 220], [600, 300]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(1);

    expect(await textarea.evaluate((element) => element.clientWidth)).toBe(widthBeforeStroke);
    await expect(textarea).toHaveValue("Sketch goes here.");

    const scratchpad = await readScratchpad(page);
    expect(scratchpad.version).toBe(2);
    expect(scratchpad.layoutWidth).toBe(await scratchStageWidth(page));
    expect(scratchpad.strokes[0]).toMatchObject({ tool: "draw", width: 3 });
    expect(scratchpad.strokes[0].points[0]).toEqual({ x: 200, y: 100 });
    expect(await readScratchAlpha(page, 480, 220)).toBeGreaterThan(0);
    expect(await readScratchAlpha(page, 300, 300)).toBe(0);

    // Exactly one save: the server's copy of the document must not look like a new edit.
    await page.waitForTimeout(1500);
    expect(updates()).toBe(1);

    // After Done the ink no longer intercepts the pointer.
    await panel.getByRole("button", { name: /^done$/i }).click();
    await expect(panel.getByTestId("scratch-toolbar")).toHaveCount(0);
    await expect(scratchButton).toHaveAttribute("aria-pressed", "false");
    await textarea.click({ position: { x: 480, y: 220 } });
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" More.");
    await expect(textarea).toHaveValue("Sketch goes here. More.");
    await expect.poll(() => readNote(page).then((note) => note.bodyMarkdown)).toBe("Sketch goes here. More.");

    // The overlay also shows in preview, and the markdown never contains it.
    await page.getByRole("button", { name: /^preview$/i }).click();
    await expect(panel.locator(".bb-markdown")).toContainText("Sketch goes here. More.");
    await expect.poll(() => readScratchAlpha(page, 480, 220)).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId("editor-panel-desktop").getByPlaceholder("Write in Markdown")).toHaveValue("Sketch goes here. More.");
    await expect.poll(() => readScratchAlpha(page, 480, 220)).toBeGreaterThan(0);
    expect(await scratchStageWidth(page)).toBe(scratchpad.layoutWidth);

    // Reopened strokes stay editable: the next stroke adds to them.
    await page.getByTestId("editor-panel-desktop").getByRole("button", { name: /^scratch$/i }).click();
    await drawScratchStroke(page, [[700, 120], [760, 180]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(2);
  });

  test("keeps ink in place when the text changes, and keeps the caret in view while typing", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    await createNoteWithContent(page, `Stable ink ${suffix}`, "First line.");
    await waitForUpdatedStatus(page);

    const panel = page.getByTestId("editor-panel-desktop");
    const textarea = panel.getByPlaceholder("Write in Markdown");
    await panel.getByRole("button", { name: /^scratch$/i }).click();
    await drawScratchStroke(page, [[150, 60], [300, 60]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(1);
    await panel.getByRole("button", { name: /^done$/i }).click();

    // Adding text used to stretch ink, because y was stored relative to the note height.
    const stageHeightBefore = await scratchStageHeight(page);
    const longBody = Array.from({ length: 120 }, (_, index) => `Line ${index + 1}`).join("\n");
    await textarea.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(`\n${longBody}`);
    await expect.poll(() => scratchStageHeight(page)).toBeGreaterThan(stageHeightBefore * 2);
    expect(await readScratchAlpha(page, 225, 60)).toBeGreaterThan(0);
    expect(await readScratchAlpha(page, 225, 600)).toBe(0);
    await expect.poll(() => readNote(page).then((note) => note.bodyMarkdown.length)).toBeGreaterThan(500);
    expect((await readScratchpad(page)).strokes[0].points[0]).toEqual({ x: 150, y: 60 });

    // Pasting past the end used to strand the caret off screen, since the stage scrolls now, not the textarea.
    await expect.poll(() => scratchViewportScrollTop(page)).toBeGreaterThan(0);
    await page.keyboard.type("Typing at the end");
    await expect
      .poll(async () => {
        const viewportBox = await panel.getByTestId("scratch-viewport").boundingBox();
        const textareaBox = await textarea.boundingBox();
        return Boolean(viewportBox && textareaBox && textareaBox.y + textareaBox.height >= viewportBox.y + viewportBox.height - 1);
      })
      .toBe(true);
    await expect
      .poll(() =>
        panel.getByTestId("scratch-viewport").evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))
      )
      .toBeLessThan(60);

    // Ink far down the page keeps the stage tall enough even after the text above it is removed.
    await panel.getByRole("button", { name: /^scratch$/i }).click();
    const lowY = Math.round((await scratchStageHeight(page)) - 200);
    await panel.getByTestId("scratch-viewport").evaluate((element, y) => {
      element.scrollTop = y - 200;
    }, lowY);
    await drawScratchStroke(page, [[200, lowY], [320, lowY]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(2);
    await panel.getByRole("button", { name: /^done$/i }).click();
    await textarea.fill("Short again.");
    await expect.poll(() => readNote(page).then((note) => note.bodyMarkdown)).toBe("Short again.");
    expect(await scratchStageHeight(page)).toBeGreaterThan(lowY);
    await expect.poll(() => readScratchAlpha(page, 260, lowY)).toBeGreaterThan(0);
  });

  test("keeps ink on the same words through browser zoom, including across the mobile breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1900, height: 1000 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    const wrappingText = "Words that wrap across several lines so any reflow would change the height of the note. ".repeat(30);
    await createNoteWithContent(page, `Zoomed ink ${suffix}`, wrappingText);
    await waitForUpdatedStatus(page);

    const desktopPanel = page.getByTestId("editor-panel-desktop");
    await desktopPanel.getByRole("button", { name: /^scratch$/i }).click();
    await drawScratchStroke(page, [[220, 90], [420, 150]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(1);

    const layoutAtFullSize = await readScratchTextLayout(page);
    expect(layoutAtFullSize.textHeight).toBeGreaterThan(200);

    const cdp = await page.context().newCDPSession(page);
    async function zoomBrowser(zoom: number) {
      // Browser zoom shrinks the viewport in CSS pixels and raises the device pixel ratio by the same factor.
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: Math.round(1900 / zoom),
        height: Math.round(1000 / zoom),
        deviceScaleFactor: zoom,
        mobile: false
      });
    }

    let strokes = 1;
    for (const zoom of [1.25, 1.5, 2, 3, 0.75, 1]) {
      await zoomBrowser(zoom);
      await expect.poll(() => page.evaluate(() => [window.devicePixelRatio, window.innerWidth])).toEqual([zoom, Math.round(1900 / zoom)]);
      await expect(page.getByTestId(zoom >= 2 ? "editor-panel-mobile" : "editor-panel-desktop")).toBeVisible();

      // No reflow: the same text occupies the same stage layout at every zoom, on both sides of the breakpoint.
      await expect.poll(() => readScratchTextLayout(page).catch(() => null)).toEqual(layoutAtFullSize);
      await expect.poll(() => readScratchAlpha(page, 320, 120).catch(() => 0)).toBeGreaterThan(0);

      // The ink and the text share one transform, and the bitmap tracks the screen's density.
      await expect
        .poll(() =>
          scratchCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
            const scale = canvas.getBoundingClientRect().width / canvas.offsetWidth;
            return Math.abs(canvas.width / canvas.offsetWidth - Math.max(window.devicePixelRatio, 1) * scale) < 0.05;
          })
        )
        .toBe(true);
      const placement = await activeEditorPanel(page)
        .getByTestId("scratch-canvas")
        .evaluate((canvas: HTMLCanvasElement) => {
          const stage = canvas.parentElement as HTMLElement;
          const surface = stage.querySelector("textarea") as HTMLTextAreaElement;
          const canvasRect = canvas.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          const surfaceRect = surface.getBoundingClientRect();
          const scale = canvasRect.width / canvas.offsetWidth;
          return {
            scale,
            canvasOffset: [canvasRect.left - stageRect.left, canvasRect.top - stageRect.top],
            surfaceOffset: [(surfaceRect.left - canvasRect.left) / scale, (surfaceRect.top - canvasRect.top) / scale]
          };
        });
      expect(placement.canvasOffset[0]).toBeCloseTo(0, 3);
      expect(placement.canvasOffset[1]).toBeCloseTo(0, 3);
      expect(placement.surfaceOffset[0]).toBeCloseTo(0, 3);
      expect(placement.surfaceOffset[1]).toBeCloseTo(0, 3);
      expect(placement.scale).toBeLessThanOrEqual(1);

      // Drawing still lands where the pointer is, and drawing mode survives the switch between panels.
      await expect(activeEditorPanel(page).getByTestId("scratch-toolbar")).toBeVisible();
      await drawScratchStroke(page, [[500, 40 + strokes * 20], [560, 40 + strokes * 20]]);
      strokes += 1;
      await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(strokes);
      const saved = (await readScratchpad(page)).strokes.at(-1)!;
      expect(saved.points[0].x).toBeCloseTo(500, -1);
      expect(saved.points[0].y).toBeCloseTo(40 + (strokes - 1) * 20, -1);
    }

    // The hidden panel shares the note text. Editing on one side of the breakpoint must not leave the other collapsed.
    await zoomBrowser(2);
    await expect(page.getByTestId("editor-panel-mobile")).toBeVisible();
    await activeEditorTextarea(page).fill(wrappingText + "\nMore text added while zoomed in.".repeat(60));
    await zoomBrowser(1);
    await expect(page.getByTestId("editor-panel-desktop")).toBeVisible();
    await expect
      .poll(() =>
        activeEditorTextarea(page).evaluate((element) => element.scrollHeight <= element.clientHeight && element.clientHeight > 1500)
      )
      .toBe(true);

    await cdp.send("Emulation.clearDeviceMetricsOverride");
  });

  test("keeps the scroll position when turning scratch on and off", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    const longBody = Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join("\n");
    await createNoteWithContent(page, `Scrolled ${suffix}`, longBody);
    await waitForUpdatedStatus(page);

    const panel = page.getByTestId("editor-panel-desktop");
    const textarea = panel.getByPlaceholder("Write in Markdown");
    await textarea.evaluate((element) => {
      element.scrollTop = 1200;
    });
    await expect.poll(() => textarea.evaluate((element) => element.scrollTop)).toBe(1200);

    await panel.getByRole("button", { name: /^scratch$/i }).click();
    await expect.poll(() => scratchViewportScrollTop(page)).toBe(1200);

    await panel.getByTestId("scratch-viewport").evaluate((element) => {
      element.scrollTop = 900;
    });
    await expect.poll(() => scratchViewportScrollTop(page)).toBe(900);
    await panel.getByRole("button", { name: /^done$/i }).click();
    await expect(panel.getByTestId("scratch-viewport")).not.toHaveClass(/is-enabled/);
    await expect.poll(() => textarea.evaluate((element) => element.scrollTop)).toBe(900);
  });

  test("erases, undoes, redoes, and clears", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    await createNoteWithContent(page, `Tools ${suffix}`, "Tool test.");
    await waitForUpdatedStatus(page);

    const panel = page.getByTestId("editor-panel-desktop");
    const viewport = panel.getByTestId("scratch-viewport");
    await expect(viewport).not.toHaveClass(/is-enabled/);
    await panel.getByRole("button", { name: /^scratch$/i }).click();
    await expect(viewport).toHaveClass(/is-enabled/);
    const clearButton = panel.getByRole("button", { name: /^clear$/i });
    const undoButton = panel.getByRole("button", { name: /^undo stroke$/i });
    const redoButton = panel.getByRole("button", { name: /^redo stroke$/i });
    await expect(clearButton).toBeDisabled();
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    // Erasing an empty overlay records nothing.
    await panel.getByRole("button", { name: /^eraser$/i }).click();
    await expect(panel.getByRole("button", { name: /^eraser$/i })).toHaveAttribute("aria-pressed", "true");
    await drawScratchStroke(page, [[100, 100], [200, 100]]);
    await expect(undoButton).toBeDisabled();

    await panel.getByRole("button", { name: /^draw$/i }).click();
    await drawScratchStroke(page, [[200, 200], [400, 200]]);
    await expect.poll(() => readScratchAlpha(page, 300, 200)).toBeGreaterThan(0);

    await panel.getByRole("button", { name: /^eraser$/i }).click();
    await drawScratchStroke(page, [[290, 170], [290, 230]]);
    await expect.poll(() => readScratchAlpha(page, 290, 200)).toBe(0);
    expect(await readScratchAlpha(page, 240, 200)).toBeGreaterThan(0);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.map((stroke) => stroke.tool))).toEqual(["draw", "erase"]);

    await undoButton.click();
    await expect.poll(() => readScratchAlpha(page, 290, 200)).toBeGreaterThan(0);
    await expect(redoButton).toBeEnabled();
    await redoButton.click();
    await expect.poll(() => readScratchAlpha(page, 290, 200)).toBe(0);

    // Keyboard shortcuts work once the pointer has moved focus off the text field.
    await page.keyboard.press("Control+z");
    await expect.poll(() => readScratchAlpha(page, 290, 200)).toBeGreaterThan(0);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => readScratchAlpha(page, 290, 200)).toBe(0);

    // Clear removes the overlay entirely, and is itself undoable rather than a one-click loss.
    await clearButton.click();
    await expect.poll(() => readScratchpad(page)).toBeNull();
    expect(await readScratchAlpha(page, 240, 200)).toBe(0);
    await undoButton.click();
    await expect.poll(() => readScratchAlpha(page, 240, 200)).toBeGreaterThan(0);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(2);

    await clearButton.click();
    await expect.poll(() => readScratchpad(page)).toBeNull();
    await page.keyboard.press("Escape");
    await expect(panel.getByTestId("scratch-toolbar")).toHaveCount(0);

    // A note with no ink goes back to the plain editor.
    await expect(viewport).not.toHaveClass(/is-enabled/);
    await expect(panel.getByTestId("scratch-canvas")).toHaveCount(0);
  });

  test("keeps drawing when a draft is saved, and never drops strokes made during a save", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();

    await page.getByRole("button", { name: /^new note$/i }).first().click();
    const panel = page.getByTestId("editor-panel-desktop");
    await expect(panel.getByPlaceholder("Write in Markdown")).toBeVisible();
    await expect.poll(() => page.url()).toContain("/notes/");
    await panel.getByRole("button", { name: /^scratch$/i }).click();

    // Holding the save open proves a stroke drawn meanwhile is saved afterwards, not stranded.
    const noteId = extractNoteIdFromUrl(page.url());
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let saveStarted!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      saveStarted = resolve;
    });
    let heldOnce = false;
    await page.route(`**/api/v1/notes/${noteId}`, async (route) => {
      if (route.request().method() !== "PUT" || heldOnce) {
        await route.continue();
        return;
      }

      heldOnce = true;
      const response = await route.fetch();
      saveStarted();
      await saveGate;
      await route.fulfill({ response });
    });

    await drawScratchStroke(page, [[100, 100], [240, 140]]);
    await pendingSave;
    await drawScratchStroke(page, [[300, 100], [440, 140]]);
    await expect(panel.getByTestId("scratch-toolbar")).toBeVisible();
    await page.waitForTimeout(900);
    releaseSave();
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(2);
    await expect(panel.getByTestId("scratch-toolbar")).toBeVisible();
    await page.unroute(`**/api/v1/notes/${noteId}`);

    // Opening another note right after a stroke must not lose it, and scratch mode must not follow along.
    await drawScratchStroke(page, [[500, 100], [640, 140]]);
    await page.getByRole("button", { name: /^new note$/i }).first().click();
    await expect.poll(() => /\/notes\/([^/]+)/.exec(page.url())?.[1] ?? noteId).not.toBe(noteId);
    await expect(panel.getByTestId("scratch-toolbar")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async (id) => {
          const response = await fetch(`/api/v1/notes/${id}`);
          return ((await response.json()) as { scratchpad?: { strokes: unknown[] } }).scratchpad?.strokes.length ?? 0;
        }, noteId)
      )
      .toBe(3);
  });

  test("keeps unsaved strokes when an attachment finishes uploading, and survives Deleted Notes", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    const title = `Attachments ${suffix}`;
    await createNoteWithContent(page, title, "With an attachment.");
    await waitForUpdatedStatus(page);
    const panel = page.getByTestId("editor-panel-desktop");
    await panel.getByRole("button", { name: /^scratch$/i }).click();

    const filePath = await createTempFile(`scratch-${suffix}.txt`, "attachment");
    await drawScratchStroke(page, [[100, 100], [240, 140]]);
    await panel.getByTestId("media-input-file").setInputFiles(filePath);
    await expect(panel.locator(".bb-attachment-card")).toHaveCount(1);
    expect(await readScratchAlpha(page, 170, 120)).toBeGreaterThan(0);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(1);

    await panel.getByRole("button", { name: /^done$/i }).click();
    const noteId = extractNoteIdFromUrl(page.url());
    const deleted = await page.evaluate(async (id) => (await fetch(`/api/v1/notes/${id}`, { method: "DELETE" })).status, noteId);
    expect(deleted).toBe(204);
    const trashed = await page.evaluate(async (id) => (await (await fetch(`/api/v1/notes/${id}`)).json()) as { scratchpad?: unknown }, noteId);
    expect(trashed.scratchpad).not.toBeNull();
  });

  test("draws ink in the active theme's color and repaints when the theme changes", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    await createNoteWithContent(page, `Themes ${suffix}`, "Theme test.");
    await waitForUpdatedStatus(page);
    const panel = page.getByTestId("editor-panel-desktop");
    await panel.getByRole("button", { name: /^scratch$/i }).click();
    await drawScratchStroke(page, [[100, 100], [300, 100]]);
    await expect.poll(() => readScratchAlpha(page, 200, 100)).toBeGreaterThan(0);

    async function expectInkToMatchThemeAccent() {
      await expect
        .poll(async () => {
          const expected = await panel.getByTestId("scratch-canvas").evaluate((canvas: HTMLCanvasElement) => {
            const probe = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
            probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim();
            probe.fillRect(0, 0, 1, 1);
            void canvas;
            return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3));
          });
          const actual = (await readScratchPixel(page, 200, 100)).slice(0, 3);
          return actual.every((channel, index) => Math.abs(channel - expected[index]) <= 2);
        })
        .toBe(true);
    }

    await expectInkToMatchThemeAccent();
    const seaInk = (await readScratchPixel(page, 200, 100)).slice(0, 3);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "midnight";
    });
    await expectInkToMatchThemeAccent();
    expect((await readScratchPixel(page, 200, 100)).slice(0, 3)).not.toEqual(seaInk);
  });

  test("works on a phone, panning across a note drawn on a much wider screen", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    const suffix = createTestSuffix();
    await login(page);
    await createNotebookWithDialog(page, `Scratch ${suffix}`);
    await notebookRow(page, `Scratch ${suffix}`).click();
    await createNoteWithContent(page, `Phone ${suffix}`, "Drawn on a desktop.");
    await waitForUpdatedStatus(page);
    await page.getByTestId("editor-panel-desktop").getByRole("button", { name: /^scratch$/i }).click();
    await drawScratchStroke(page, [[120, 80], [320, 120]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(1);
    const { layoutWidth } = await readScratchpad(page);

    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.getByTestId("editor-panel-mobile");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("scratch-toolbar")).toBeVisible();
    await expect.poll(() => readScratchAlpha(page, 220, 100)).toBeGreaterThan(0);
    expect(await scratchStageWidth(page)).toBe(layoutWidth);

    // Text stays readable: the stage stops shrinking at half size, and the viewport pans the rest.
    const canvas = panel.getByTestId("scratch-canvas");
    const scale = await canvas.evaluate((element) => element.getBoundingClientRect().width / element.offsetWidth);
    expect(scale).toBeCloseTo(0.5, 2);
    const overflow = await panel.getByTestId("scratch-viewport").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeGreaterThan(0);
    const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(documentOverflow).toBeLessThanOrEqual(0);

    await drawScratchStroke(page, [[140, 200], [300, 240]]);
    await expect.poll(() => readScratchpad(page).then((document) => document?.strokes.length ?? 0)).toBe(2);
  });
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
  const voiceAttachment = activeAttachmentCards(page).filter({ hasText: /voice-note-\d{14}\.webm/i }).first();
  const bodyTextarea = activeEditorTextarea(page);
  await expect(page.getByRole("button", { name: /attachments/i }).first()).toBeVisible();
  await expect(voiceAttachment).toBeVisible();
  await expect(recorderPanels).toHaveCount(0);
  await expect(bodyTextarea).toHaveValue(/\[voice-note-\d{14}\.webm\]\(.*\/attachments\/.*\)/i);
  await expect(page.getByRole("button", { name: /^retry save$/i })).toHaveCount(0);
  await page.getByRole("button", { name: /^preview$/i }).click();
  const audioEmbed = activeEditorPanel(page).locator(".bb-editor-preview .bb-markdown__audio-card").first();
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

  const editorPanel = page.getByTestId("editor-panel-desktop");
  const attachmentCards = editorPanel.locator(".bb-attachment-card").filter({ hasText: audioFileName });
  const attachmentCard = attachmentCards.first();
  const bodyTextarea = editorPanel.getByPlaceholder("Write in Markdown");
  const attachmentToggle = editorPanel.getByRole("button", { name: /attachments/i });
  await expect(attachmentToggle).toBeVisible();
  await expect(attachmentCard).toBeVisible();
  await expect(bodyTextarea).toHaveValue(new RegExp(`\\[song-${suffix}\\.mp3\\]\\(.*\\/attachments\\/.*\\)`, "i"));
  await expect(page.locator(".bb-error-banner")).toHaveCount(0);
  await expect(attachmentToggle).toHaveAttribute("aria-expanded", "true");
  await attachmentToggle.click();
  await expect(attachmentToggle).toHaveAttribute("aria-expanded", "false");
  await expect(attachmentCards).toHaveCount(0);
  await attachmentToggle.click();
  await expect(attachmentToggle).toHaveAttribute("aria-expanded", "true");
  await expect(attachmentCard).toBeVisible();

  await page.getByRole("button", { name: /^preview$/i }).click();
  const audioEmbed = activeEditorPanel(page).locator(".bb-editor-preview .bb-markdown__audio-card").first();
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
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toBeFocused();
  await expect.poll(async () => page.locator(".bb-note-card__title").count()).toBe(1);
  await expect(page.locator(".bb-note-card__title").first()).toHaveText("Untitled note");

  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toBeFocused();
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
  await activeEditorTextarea(page).fill("Route this note back in.");
  await waitForUpdatedStatus(page);
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

test.describe("note references", () => {
  function titleInput(page: import("@playwright/test").Page) {
    return page.getByRole("textbox", { name: "Title" }).first();
  }

  function previewSurface(page: import("@playwright/test").Page) {
    return activeEditorPanel(page).locator(".bb-editor-preview");
  }

  async function showPreview(page: import("@playwright/test").Page) {
    await activeEditorPanel(page).getByRole("button", { name: /^preview$/i }).click();
    await expect(previewSurface(page)).toBeVisible();
  }

  /** Creates a target note in one notebook and a source note in another, leaving the source note open. */
  async function createTargetAndSource(page: import("@playwright/test").Page, sourceBody: (targetId: string) => string = () => "") {
    const suffix = createTestSuffix();
    const names = {
      targetNotebook: `Reference target ${suffix}`,
      sourceNotebook: `Reference source ${suffix}`,
      targetTitle: `Target note ${suffix}`,
      targetBody: `Target body ${suffix}`,
      sourceTitle: `Source note ${suffix}`
    };

    await login(page);
    await createNotebookWithDialog(page, names.targetNotebook);
    await createNoteWithContent(page, names.targetTitle, names.targetBody);
    const targetPath = new URL(page.url()).pathname;
    const targetId = extractNoteIdFromUrl(page.url());

    await createNotebookWithDialog(page, names.sourceNotebook);
    await createNoteWithContent(page, names.sourceTitle, sourceBody(targetId) || "Source body");
    const sourcePath = new URL(page.url()).pathname;

    return { ...names, targetPath, targetId, sourcePath };
  }

  test("inserts a note reference with the picker, jumps across notebooks, and comes back", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    const panel = activeEditorPanel(page);
    const textarea = activeEditorTextarea(page);

    const initialStatus = await waitForUpdatedStatus(page);
    await textarea.fill("See  for details");
    await selectTextRange(textarea, 4, 4);
    await panel.getByRole("button", { name: "Link to note" }).click();

    const picker = panel.getByTestId("note-reference-picker");
    await expect(picker.getByRole("searchbox", { name: "Search notes" })).toBeFocused();
    await expect(picker.getByRole("button", { name: new RegExp(notes.sourceTitle) })).toHaveCount(0);
    await picker.getByRole("button", { name: new RegExp(notes.targetTitle) }).click();

    await expect(picker).toHaveCount(0);
    await expect(textarea).toHaveValue(`See [${notes.targetTitle}](/notes/${notes.targetId}) for details`);
    await expect(textarea).toBeFocused();
    await waitForUpdatedStatus(page, initialStatus);

    await showPreview(page);
    await expect(panel.getByRole("button", { name: "Link to note" })).toBeDisabled();
    const reference = previewSurface(page).getByRole("link", { name: notes.targetTitle });
    await expect(reference).toHaveAttribute("href", `/notes/${notes.targetId}`);
    await expect(reference).toHaveClass(/bb-link-button/);
    await reference.click();

    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(notes.targetTitle);
    await expect(previewSurface(page)).toContainText(notes.targetBody);
    await expect(notebookRowContainer(page, notes.targetNotebook)).toHaveClass(/is-active/);
    await expect(page.getByRole("button", { name: new RegExp(notes.targetTitle, "i") }).first()).toHaveClass(/is-active/);

    await page.goBack();
    await expect(titleInput(page)).toHaveValue(notes.sourceTitle);
    await expect(previewSurface(page)).toContainText("See");
    await expect(notebookRowContainer(page, notes.sourceNotebook)).toHaveClass(/is-active/);
    // One Back is enough, and it stays there rather than bouncing forward once the note has loaded.
    await expect(page).toHaveURL(notes.sourcePath);

    await page.goForward();
    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(notes.targetTitle);
  });

  test("uses selected text as the note reference label", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    const panel = activeEditorPanel(page);
    const textarea = activeEditorTextarea(page);

    await textarea.fill("See the plan first");
    await selectTextRange(textarea, 4, 12);
    await panel.getByRole("button", { name: "Link to note" }).click();
    await panel.getByTestId("note-reference-picker").getByRole("button", { name: new RegExp(notes.targetTitle) }).click();

    await expect(textarea).toHaveValue(`See [the plan](/notes/${notes.targetId}) first`);
  });

  test("searches notes in the note reference picker and closes it on escape", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    const panel = activeEditorPanel(page);
    const textarea = activeEditorTextarea(page);
    const body = "Unchanged body";

    const initialStatus = await waitForUpdatedStatus(page);
    await textarea.fill(body);
    await waitForUpdatedStatus(page, initialStatus);

    await panel.getByRole("button", { name: "Link to note" }).click();
    const picker = panel.getByTestId("note-reference-picker");
    await picker.getByRole("searchbox", { name: "Search notes" }).fill(notes.targetBody.split(" ").at(-1)!);
    await expect(picker.getByRole("button", { name: new RegExp(notes.targetTitle) })).toBeVisible();

    await picker.getByRole("searchbox", { name: "Search notes" }).fill(`missing${createTestSuffix()}`);
    await expect(picker.getByRole("status")).toContainText("No notes match");

    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(textarea).toHaveValue(body);
  });

  test("keeps a note reference working after the target is renamed, and leaves modified clicks to the browser", async ({ page }) => {
    const notes = await createTargetAndSource(page, (targetId) => `[Original label](/notes/${targetId})`);
    const renamedTitle = `${notes.targetTitle} renamed`;

    await showPreview(page);
    await previewSurface(page).getByRole("link", { name: "Original label" }).click();
    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(notes.targetTitle);

    const statusBeforeRename = await waitForUpdatedStatus(page);
    await titleInput(page).fill(renamedTitle);
    await waitForUpdatedStatus(page, statusBeforeRename);

    await page.goBack();
    await expect(titleInput(page)).toHaveValue(notes.sourceTitle);
    const reference = previewSurface(page).getByRole("link", { name: "Original label" });

    const popupPromise = page.context().waitForEvent("page");
    await reference.click({ modifiers: ["Control"] });
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new RegExp(`/notes/${notes.targetId}$`));
    await expect(popup.getByRole("textbox", { name: "Title" }).first()).toHaveValue(renamedTitle);
    await popup.close();
    await expect(page).toHaveURL(notes.sourcePath);

    await reference.click();
    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(renamedTitle);
  });

  test("shows an error and stays on the note when a note reference is broken", async ({ page }) => {
    const missingNoteId = randomUUID();
    const notes = await createTargetAndSource(page, () => `Before [Gone](/notes/${missingNoteId}) after`);

    await showPreview(page);
    await previewSurface(page).getByRole("link", { name: "Gone" }).click();

    await expect(activeEditorPanel(page).locator(".bb-error-banner")).toHaveText("Couldn't open the linked note. It may have been deleted.");
    await expect(page).toHaveURL(notes.sourcePath);
    await expect(titleInput(page)).toHaveValue(notes.sourceTitle);
    await expect(previewSurface(page)).toContainText("Before");
  });

  test("saves edits made just before following a note reference", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    const textarea = activeEditorTextarea(page);
    const editedBody = `Edited just before leaving [Target](/notes/${notes.targetId})`;

    await waitForUpdatedStatus(page);
    await textarea.fill(editedBody);
    await showPreview(page);
    await previewSurface(page).getByRole("link", { name: "Target" }).click();
    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(notes.targetTitle);

    await page.goto(notes.sourcePath);
    await expect(activeEditorTextarea(page)).toHaveValue(editedBody);
  });

  test("does nothing when a note reference points at the open note", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    const textarea = activeEditorTextarea(page);
    const sourceId = extractNoteIdFromUrl(notes.sourcePath);

    const initialStatus = await waitForUpdatedStatus(page);
    await textarea.fill(`[Myself](/notes/${sourceId})`);
    await waitForUpdatedStatus(page, initialStatus);
    await showPreview(page);
    await previewSurface(page).getByRole("link", { name: "Myself" }).click();

    await expect(page).toHaveURL(notes.sourcePath);
    await expect(activeEditorPanel(page).locator(".bb-error-banner")).toHaveCount(0);
    await expect(previewSurface(page).getByRole("link", { name: "Myself" })).toBeVisible();
  });

  test("works on a phone-sized screen with the picker inside the viewport", async ({ page }) => {
    const notes = await createTargetAndSource(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const panel = page.getByTestId("editor-panel-mobile");
    const textarea = activeEditorTextarea(page);
    await expect(panel).toBeVisible();
    await textarea.fill("");

    await panel.getByRole("button", { name: "Link to note" }).click();
    const picker = panel.getByTestId("note-reference-picker");
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    await picker.getByRole("button", { name: new RegExp(notes.targetTitle) }).click();
    await expect(textarea).toHaveValue(`[${notes.targetTitle}](/notes/${notes.targetId})`);

    await showPreview(page);
    await previewSurface(page).getByRole("link", { name: notes.targetTitle }).click();
    await expect(page).toHaveURL(notes.targetPath);
    await expect(titleInput(page)).toHaveValue(notes.targetTitle);
  });
});

test("keeps the previous notes visible while switching folders", async ({ page }) => {
  const suffix = Date.now().toString();
  const firstNotebookName = `Smooth inbox ${suffix}`;
  const secondNotebookName = `Smooth archive ${suffix}`;
  const firstNoteTitle = `First smooth note ${suffix}`;
  const secondNoteTitle = `Second smooth note ${suffix}`;

  await login(page);

  await createNotebookWithDialog(page, firstNotebookName);
  const firstFolderId = extractFolderIdFromUrl(page.url());
  await createNoteWithContent(page, firstNoteTitle, "This note should remain visible during the folder transition.");

  await createNotebookWithDialog(page, secondNotebookName);
  const secondFolderId = extractFolderIdFromUrl(page.url());
  await createNoteWithContent(page, secondNoteTitle, "This note should appear after the delayed response resolves.");

  await page.goto(`/folders/${firstFolderId}`);
  await expect(page).toHaveURL(new RegExp(`/folders/${firstFolderId}$`));
  await expect(notebookRowContainer(page, firstNotebookName)).toHaveClass(/is-active/);
  await expect(page.getByTestId(buildNoteTestId("drag", firstNoteTitle))).toBeVisible();
  await expect(page.getByTestId(buildNoteTestId("drag", secondNoteTitle))).toHaveCount(0);

  let releaseTargetFolderNotes!: () => void;
  const targetFolderNotesReleased = new Promise<void>((resolve) => {
    releaseTargetFolderNotes = resolve;
  });
  let delayedTargetFolderRequestSeen = false;

  await page.route("**/api/v1/notes?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const requestedFolderId = requestUrl.searchParams.get("folderId");
    if (!delayedTargetFolderRequestSeen && requestedFolderId === secondFolderId) {
      delayedTargetFolderRequestSeen = true;
      const response = await route.fetch();
      await targetFolderNotesReleased;
      await route.fulfill({ response });
      return;
    }

    await route.continue();
  });

  await notebookRow(page, secondNotebookName).click();
  await expect(page).toHaveURL(new RegExp(`/folders/${secondFolderId}$`));
  await expect.poll(() => delayedTargetFolderRequestSeen).toBe(true);

  const staleNoteCard = page.getByTestId(buildNoteTestId("drag", firstNoteTitle));
  const refreshIndicator = page.getByTestId("notes-refresh-indicator");
  const notesPane = page.getByTestId("notes-pane");
  await expect(staleNoteCard).toBeVisible();
  await expect(staleNoteCard).toHaveAttribute("aria-disabled", "true");
  await expect(refreshIndicator).toBeVisible();
  await expect(page.locator(".bb-skeleton-card")).toHaveCount(0);
  await expect
    .poll(async () => {
      const paneBox = await notesPane.boundingBox();
      const indicatorBox = await refreshIndicator.boundingBox();
      if (!paneBox || !indicatorBox) {
        return Number.POSITIVE_INFINITY;
      }
      const paneCenter = paneBox.x + paneBox.width / 2;
      const indicatorCenter = indicatorBox.x + indicatorBox.width / 2;
      return Math.abs(paneCenter - indicatorCenter);
    })
    .toBeLessThan(12);

  await staleNoteCard.dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`/folders/${secondFolderId}$`));
  await expect(page.getByTestId(buildNoteTestId("drag", firstNoteTitle))).toBeVisible();

  releaseTargetFolderNotes();

  await expect(page.getByTestId(buildNoteTestId("drag", secondNoteTitle))).toBeVisible();
  await expect(page.getByTestId(buildNoteTestId("drag", firstNoteTitle))).toHaveCount(0);
  await expect(refreshIndicator).toHaveCount(0);
});

test("keeps the previous editor visible while switching notes", async ({ page }) => {
  const suffix = Date.now().toString();
  const notebookName = `Smooth note switch ${suffix}`;
  const firstNoteTitle = `Editor stale first ${suffix}`;
  const secondNoteTitle = `Editor stale second ${suffix}`;
  const firstNoteBody = "This note should remain visible while the next note is loading.";
  const secondNoteBody = "This note should replace the stale editor after the delayed response resolves.";

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  const folderId = extractFolderIdFromUrl(page.url());

  await createNoteWithContent(page, firstNoteTitle, firstNoteBody);
  const firstNoteId = extractNoteIdFromUrl(page.url());
  await createNoteWithContent(page, secondNoteTitle, secondNoteBody);
  const secondNoteId = extractNoteIdFromUrl(page.url());
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/folders/${folderId}/notes/${secondNoteId}$`));
  await expect(page.getByTestId(buildNoteTestId("drag", firstNoteTitle))).toBeVisible();
  await expect(page.getByTestId(buildNoteTestId("drag", secondNoteTitle))).toBeVisible();

  await page.getByTestId(buildNoteTestId("drag", firstNoteTitle)).click();
  await expect(page).toHaveURL(new RegExp(`/folders/${folderId}/notes/${firstNoteId}$`));

  const desktopEditorPanel = page.getByTestId("editor-panel-desktop");
  const topbarTitleInput = page.getByTestId("page-nav-title-input").getByRole("textbox", { name: "Title" });
  const bodyTextarea = desktopEditorPanel.getByPlaceholder("Write in Markdown");
  const contentShell = desktopEditorPanel.locator(".bb-editor-panel__content-shell");
  await expect(topbarTitleInput).toHaveValue(firstNoteTitle);
  await expect(bodyTextarea).toHaveValue(firstNoteBody);

  let releaseTargetNote!: () => void;
  const targetNoteReleased = new Promise<void>((resolve) => {
    releaseTargetNote = resolve;
  });
  let delayedTargetNoteRequestSeen = false;

  await page.route(`**/api/v1/notes/${secondNoteId}`, async (route) => {
    if (!delayedTargetNoteRequestSeen && route.request().method() === "GET") {
      delayedTargetNoteRequestSeen = true;
      const response = await route.fetch();
      await targetNoteReleased;
      await route.fulfill({ response });
      return;
    }

    await route.continue();
  });

  await page.getByTestId(buildNoteTestId("drag", secondNoteTitle)).click();
  await expect(page).toHaveURL(new RegExp(`/folders/${folderId}/notes/${secondNoteId}$`));
  await expect.poll(() => delayedTargetNoteRequestSeen).toBe(true);

  const refreshIndicator = desktopEditorPanel.getByTestId("editor-refresh-indicator");
  await expect(refreshIndicator).toBeVisible();
  await expect(page.locator(".bb-editor-panel__content--empty").filter({ hasText: "Loading note" })).toHaveCount(0);
  await expect.poll(async () => Number.parseFloat(await contentShell.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0.95);
  await expect(topbarTitleInput).toHaveValue(firstNoteTitle);
  await expect(topbarTitleInput).toBeDisabled();
  await expect(bodyTextarea).toHaveValue(firstNoteBody);
  await expect(bodyTextarea).toBeDisabled();

  releaseTargetNote();

  await expect(topbarTitleInput).toHaveValue(secondNoteTitle);
  await expect(topbarTitleInput).toBeEnabled();
  await expect(bodyTextarea).toHaveValue(secondNoteBody);
  await expect(bodyTextarea).toBeEnabled();
  await expect(refreshIndicator).toHaveCount(0);
});

test("keeps the editor steady while autosave is in flight", async ({ page }) => {
  const suffix = Date.now().toString();
  const notebookName = `Autosave smooth ${suffix}`;
  const noteTitle = `Autosave steady ${suffix}`;
  const noteBody = "Autosave should not blank or dim the editor while the save request is pending.";

  await login(page);
  await createNotebookWithDialog(page, notebookName);
  await createNoteWithContent(page, noteTitle, noteBody);
  const noteId = extractNoteIdFromUrl(page.url());

  const desktopEditorPanel = page.getByTestId("editor-panel-desktop");
  const topbarTitleInput = page.getByTestId("page-nav-title-input").getByRole("textbox", { name: "Title" });
  const bodyTextarea = desktopEditorPanel.getByPlaceholder("Write in Markdown");
  const contentShell = desktopEditorPanel.locator(".bb-editor-panel__content-shell");
  const previousStatusText = await waitForUpdatedStatus(page);

  let releaseAutosave!: () => void;
  const autosaveReleased = new Promise<void>((resolve) => {
    releaseAutosave = resolve;
  });
  let delayedAutosaveSeen = false;

  await page.route(`**/api/v1/notes/${noteId}`, async (route) => {
    if (!delayedAutosaveSeen && route.request().method() === "PUT") {
      delayedAutosaveSeen = true;
      const response = await route.fetch();
      await autosaveReleased;
      await route.fulfill({ response });
      return;
    }

    await route.continue();
  });

  await bodyTextarea.click();
  await bodyTextarea.press("End");
  await bodyTextarea.pressSequentially(" The editor should stay steady.");
  await expect(bodyTextarea).toHaveValue(/The editor should stay steady\.$/);
  await expect.poll(() => delayedAutosaveSeen).toBe(true);

  await expect(desktopEditorPanel.getByTestId("editor-refresh-indicator")).toHaveCount(0);
  await expect(page.locator(".bb-editor-panel__content--empty").filter({ hasText: "Loading note" })).toHaveCount(0);
  await expect.poll(async () => Number.parseFloat(await contentShell.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0.95);
  await expect(topbarTitleInput).toBeEnabled();
  await expect(bodyTextarea).toBeEnabled();

  releaseAutosave();

  await waitForUpdatedStatus(page, previousStatusText);
  await expect(desktopEditorPanel.getByTestId("editor-refresh-indicator")).toHaveCount(0);
});

test("opens migration from the avatar menu and runs both export and import flows", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await login(page);
  const rootTopbarBox = await page.locator(".bb-topbar").boundingBox();
  const rootTopbarWidth = rootTopbarBox?.width ?? 0;
  const rootTopbarHeight = rootTopbarBox?.height ?? 0;
  await createNotebookAndPersistedNote(page);
  const userMenuButton = page.getByRole("button", { name: /open user menu/i });
  const viewport = page.viewportSize();
  expect(rootTopbarWidth).toBeGreaterThan(((viewport?.width ?? 0) * 0.95));
  expect(rootTopbarHeight).toBeLessThan(38);

  await expect(page.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /bbnote home/i })).toHaveAttribute("href", "/");
  await expect
    .poll(async () => ((await userMenuButton.textContent()) ?? "").trim().length)
    .toBe(1);
  await expect.poll(async () => userMenuButton.getByTestId("user-avatar-image").count()).toBe(0);
  await expect
    .poll(async () => userMenuButton.evaluate((element) => getComputedStyle(element).borderTopWidth))
    .toBe("0px");
  await expect
    .poll(async () =>
      userMenuButton.locator(".bb-avatar-button__letter").evaluate((element) => {
        const glyph = element.querySelector(".bb-avatar-button__glyph");
        if (!(glyph instanceof HTMLElement)) {
          return Number.POSITIVE_INFINITY;
        }

        const circleRect = element.getBoundingClientRect();
        const glyphRect = glyph.getBoundingClientRect();
        const circleCenterX = circleRect.left + circleRect.width / 2;
        const circleCenterY = circleRect.top + circleRect.height / 2;
        const glyphCenterX = glyphRect.left + glyphRect.width / 2;
        const glyphCenterY = glyphRect.top + glyphRect.height / 2;
        return Math.max(Math.abs(glyphCenterX - circleCenterX), Math.abs(glyphCenterY - circleCenterY));
      })
    )
    .toBeLessThan(1.4);

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
  const migrationTopbarBox = await page.locator(".bb-topbar").boundingBox();
  const migrationTopbarWidth = migrationTopbarBox?.width ?? 0;
  const migrationTopbarHeight = migrationTopbarBox?.height ?? 0;
  expect(migrationTopbarWidth).toBeLessThan(((viewport?.width ?? 0) * 0.9));
  expect(migrationTopbarWidth).toBeGreaterThan(((viewport?.width ?? 0) * 0.75));
  expect(migrationTopbarWidth).toBeLessThan(rootTopbarWidth - 150);
  expect(Math.abs(migrationTopbarHeight - rootTopbarHeight)).toBeLessThan(2);
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

test("shows the gravatar image on the avatar button when one is available", async ({ page }) => {
  await page.route("https://www.gravatar.com/avatar/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#1f7a8c"/></svg>'
    });
  });

  await login(page, { assertTheme: false, mockGravatar: false });

  const avatarImage = page.getByRole("button", { name: /open user menu/i }).getByTestId("user-avatar-image");

  await expect(avatarImage).toHaveAttribute(
    "src",
    "https://www.gravatar.com/avatar/c7bab17bda91be4f73ce7604f0d3a01dd80f3a999a370de999dde303f7794fba?d=404&s=64"
  );
  await expect.poll(async () => avatarImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(64);
  await expect
    .poll(async () => avatarImage.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)))
    .toBeGreaterThan(0.95);
});

async function login(page: import("@playwright/test").Page, options?: { assertTheme?: boolean; mockGravatar?: boolean }) {
  if (options?.mockGravatar !== false) {
    await page.route("https://www.gravatar.com/avatar/**", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "not found"
      });
    });
  }

  await page.goto("/");
  await page.getByRole("button", { name: /sign in with oidc/i }).click();
  if (options?.assertTheme !== false) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "sea");
  }
  await expect(page.getByText("Notebook workspace")).toHaveCount(0);
  await expect(page.getByTestId("editor-panel-desktop").locator(".bb-empty-state").getByText("No note selected")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Notebook" })).toHaveCount(0);
}

function createTestSuffix() {
  return randomUUID().replace(/-/g, "");
}

function activeEditorPanel(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="editor-panel-mobile"]:visible, [data-testid="editor-panel-desktop"]:visible').first();
}

function activeEditorTextarea(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).getByPlaceholder("Write in Markdown");
}

function activeEditorFooter(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).locator(".bb-editor-footer").first();
}

function activeAttachmentCards(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).locator(".bb-attachment-card");
}

async function createNotebookAndPersistedNote(page: import("@playwright/test").Page) {
  const suffix = Date.now().toString();
  await createNotebookWithDialog(page, `Exports ${suffix}`);
  await page.getByRole("button", { name: /^new note$/i }).click();
  await expect(page).toHaveURL(/\/folders\/[^/]+\/notes\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue("");
  const initialUpdatedStatusText = await waitForUpdatedStatus(page);
  await page.getByRole("textbox", { name: "Title" }).first().fill(`Export ready note ${suffix}`);
  await activeEditorTextarea(page).fill("This note should travel well.");
  await waitForUpdatedStatus(page, initialUpdatedStatusText);
  await expect(page.getByRole("button", { name: new RegExp(`Export ready note ${suffix}`, "i") })).toBeVisible();
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

function extractFolderIdFromUrl(url: string) {
  const match = /\/folders\/([^/]+)/.exec(url);
  if (!match) {
    throw new Error(`Expected a folder URL, got ${url}`);
  }
  return match[1];
}

function extractNoteIdFromUrl(url: string) {
  const match = /\/notes\/([^/]+)/.exec(url);
  if (!match) {
    throw new Error(`Expected a note URL, got ${url}`);
  }
  return match[1];
}

async function createNotebookWithDialog(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /new notebook/i }).click();
  const dialog = page.getByRole("dialog", { name: /create notebook/i });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Notebook name").fill(name);
  await dialog.getByRole("button", { name: /^create notebook$/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(notebookRowContainer(page, name)).toHaveClass(/is-active/);
  await expect(page).toHaveURL(/\/folders\/[^/]+$/);
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
  const titleInput = page.getByRole("textbox", { name: "Title" }).first();
  await expect(newNoteButton).toBeEnabled();
  await newNoteButton.click();
  await expect(titleInput).toHaveValue("");
  await expect(titleInput).toBeFocused();
  const initialUpdatedStatusText = await waitForUpdatedStatus(page);
  await titleInput.fill(title);
  await activeEditorTextarea(page).fill(body);
  await waitForUpdatedStatus(page, initialUpdatedStatusText);
  await expect(page.getByTestId(buildNoteTestId("drag", title))).toBeVisible();
}

function editorUpdatedAtStatus(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).locator('[data-testid="editor-updated-at"], .bb-editor-footer').first();
}

async function waitForUpdatedStatus(page: import("@playwright/test").Page, previousText?: string) {
  let currentText = "";

  await expect
    .poll(async () => {
      currentText = ((await editorUpdatedAtStatus(page).textContent()) ?? "").trim();
      if (!UPDATED_AT_STATUS_PATTERN.test(currentText)) {
        return "";
      }

      if (previousText && currentText === previousText) {
        return "";
      }

      return currentText;
    })
    .toMatch(UPDATED_AT_STATUS_PATTERN);

  return currentText;
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

const NOTE_MOUSE_DRAG_DELAY_MS = 250;

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
  page: import("@playwright/test").Page,
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

  const dataTransfer = await startNoteDrag(page, source);
  const clientY = box.y + (position === "top" ? Math.max(6, Math.min(box.height / 2, 12)) : Math.max(6, box.height - 6));
  await target.dispatchEvent("dragenter", { dataTransfer, clientY });
  await target.dispatchEvent("dragover", { dataTransfer, clientY });
  await target.dispatchEvent("drop", { dataTransfer, clientY });
  await endDrag(source, dataTransfer);
}

async function startDrag(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

async function waitForNoteCardBounds(source: import("@playwright/test").Locator) {
  await expect(source).toBeVisible();
  let stableBox:
    | {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | null = null;
  await expect
    .poll(async () => {
      const box = await source.boundingBox();
      stableBox = box && box.width > 0 && box.height > 0 ? box : null;
      return stableBox !== null;
    })
    .toBe(true);

  if (!stableBox) {
    throw new Error("Expected a note card to be visible.");
  }

  return stableBox;
}

async function holdNoteCardWithMouseDown(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  const box = await waitForNoteCardBounds(source);

  const startX = box.x + Math.max(16, Math.min(box.width / 2, 28));
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(NOTE_MOUSE_DRAG_DELAY_MS + 80);
  await expect
    .poll(async () =>
      source.evaluate((element) => {
        const noteCard = element as HTMLElement;
        return noteCard.draggable && noteCard.classList.contains("bb-note-card--draggable");
      })
    )
    .toBe(true);
}

async function armNoteCardForDrag(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  pointerType: "mouse" | "touch" | "pen" = "mouse"
) {
  await waitForNoteCardBounds(source);
  await source.dispatchEvent("pointerdown", {
    button: 0,
    pointerType
  });
  await page.waitForTimeout(NOTE_MOUSE_DRAG_DELAY_MS + 80);
  await expect
    .poll(async () =>
      source.evaluate((element) => {
        const noteCard = element as HTMLElement;
        return noteCard.draggable && noteCard.classList.contains("bb-note-card--draggable");
      })
    )
    .toBe(true);
}

async function waitForNoteDragStart(source: import("@playwright/test").Locator) {
  await expect
    .poll(async () =>
      source.evaluate((element) => {
        const noteCard = element as HTMLElement;
        return noteCard.classList.contains("bb-note-card--dragging");
      })
    )
    .toBe(true);
}

async function startNoteDrag(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  await armNoteCardForDrag(page, source);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await waitForNoteDragStart(source);
  return dataTransfer;
}

async function startHeldNoteDrag(page: import("@playwright/test").Page, source: import("@playwright/test").Locator) {
  await holdNoteCardWithMouseDown(page, source);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await waitForNoteDragStart(source);
  return dataTransfer;
}

async function endDrag(
  source: import("@playwright/test").Locator,
  dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>,
  page?: import("@playwright/test").Page
) {
  if (page) {
    await page.mouse.up();
  }
  const [sourceHandle] = await source.elementHandles();
  if (sourceHandle) {
    try {
      await sourceHandle.dispatchEvent("dragend", { dataTransfer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Element is not attached")) {
        throw error;
      }
    }
  }
  await dataTransfer.dispose();
}

async function dropOnTarget(
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
  dataTransfer: Awaited<ReturnType<import("@playwright/test").Page["evaluateHandle"]>>,
  page?: import("@playwright/test").Page
) {
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await endDrag(source, dataTransfer, page);
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

interface ScratchDocumentResponse {
  version: number;
  layoutWidth: number;
  strokes: Array<{ tool: string; width: number; points: Array<{ x: number; y: number }> }>;
}

async function readNote(page: import("@playwright/test").Page) {
  return page.evaluate(async (noteId) => {
    const response = await fetch(`/api/v1/notes/${noteId}`);
    return (await response.json()) as { bodyMarkdown: string; scratchpad: ScratchDocumentResponse | null };
  }, extractNoteIdFromUrl(page.url()));
}

async function readScratchpad(page: import("@playwright/test").Page) {
  return (await readNote(page)).scratchpad as ScratchDocumentResponse;
}

function trackNoteUpdates(page: import("@playwright/test").Page) {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && /\/api\/v1\/notes\/[^/]+$/.test(request.url())) {
      count += 1;
    }
  });
  return () => count;
}

function scratchCanvas(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).getByTestId("scratch-canvas");
}

async function scratchStageWidth(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).getByTestId("scratch-stage").evaluate((stage) => (stage as HTMLElement).offsetWidth);
}

async function scratchStageHeight(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).getByTestId("scratch-stage").evaluate((stage) => (stage as HTMLElement).offsetHeight);
}

async function scratchViewportScrollTop(page: import("@playwright/test").Page) {
  return activeEditorPanel(page).getByTestId("scratch-viewport").evaluate((viewport) => viewport.scrollTop);
}

/** Converts stage coordinates, the unit strokes are stored in, to the pointer position on screen right now. */
async function scratchClientPoint(page: import("@playwright/test").Page, x: number, y: number) {
  return scratchCanvas(page).evaluate(
    (canvas, point) => {
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / (canvas as HTMLElement).offsetWidth;
      return { x: rect.left + point.x * scale, y: rect.top + point.y * scale };
    },
    { x, y }
  );
}

async function drawScratchStroke(page: import("@playwright/test").Page, stagePoints: Array<[number, number]>) {
  const [first, ...rest] = stagePoints;
  const start = await scratchClientPoint(page, first[0], first[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, y] of rest) {
    const next = await scratchClientPoint(page, x, y);
    await page.mouse.move(next.x, next.y, { steps: 8 });
  }
  await page.mouse.up();
}

/** Reads the bitmap directly, which proves what is on screen rather than what is in the document. */
async function readScratchPixel(page: import("@playwright/test").Page, x: number, y: number) {
  return scratchCanvas(page).evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const density = canvas.width / canvas.offsetWidth;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      return Array.from(context.getImageData(Math.round(point.x * density), Math.round(point.y * density), 1, 1).data);
    },
    { x, y }
  );
}

async function readScratchAlpha(page: import("@playwright/test").Page, x: number, y: number) {
  return (await readScratchPixel(page, x, y))[3];
}

/** Where the first character of a text field sits on screen. */
async function readTextOrigin(textarea: Locator) {
  return textarea.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: rect.left + element.clientLeft + parseFloat(style.paddingLeft),
      y: rect.top + element.clientTop + parseFloat(style.paddingTop)
    };
  });
}

/** Layout-space metrics, unaffected by the stage's transform. Identical values mean the text did not re-wrap. */
async function readScratchTextLayout(page: import("@playwright/test").Page) {
  return activeEditorTextarea(page).evaluate((element: HTMLTextAreaElement) => {
    // A textarea stretched to fill the stage reports the stretched height, so collapse it to read the text's own.
    function measureNaturalHeight(textarea: HTMLTextAreaElement) {
      const { flex, height, minHeight } = textarea.style;
      textarea.style.flex = "none";
      textarea.style.height = "0px";
      textarea.style.minHeight = "0px";
      const naturalHeight = textarea.scrollHeight;
      textarea.style.flex = flex;
      textarea.style.height = height;
      textarea.style.minHeight = minHeight;
      return naturalHeight;
    }

    const style = getComputedStyle(element);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    return {
      textWidth: element.clientWidth - paddingX,
      // Drawing mode adds room below the text, which is not part of the text's own layout.
      textHeight: measureNaturalHeight(element) - parseFloat(style.paddingBottom),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      paddingTop: style.paddingTop,
      paddingLeft: style.paddingLeft
    };
  });
}
