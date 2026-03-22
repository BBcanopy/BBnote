import { expect, test } from "@playwright/test";

test("renders the note workspace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BBNote" })).toBeVisible();
  await expect(page.getByText("Folders")).toBeVisible();
});
