import { expect, test } from "@playwright/test";

test("shows the minimal auth splash and docs page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BBNote" })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with oidc/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /read api docs/i })).toBeVisible();

  await page.getByRole("link", { name: /read api docs/i }).click();

  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { name: /api docs/i })).toBeVisible();
  await expect(page.getByText("GET /healthz")).toBeVisible();
  await expect(page.getByText("POST /api/v1/notes", { exact: true })).toBeVisible();
});
