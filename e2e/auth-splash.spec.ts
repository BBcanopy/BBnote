import { expect, test } from "@playwright/test";

test("shows the simplified auth splash and docs page", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "sea");
  await expect(page.getByRole("heading", { name: "BBNote" })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with oidc/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /read api docs/i })).toBeVisible();
  await expect(page.getByText("Quietly structured note work")).toHaveCount(0);
  await expect(page.getByText("Keep drafts moving without friction")).toHaveCount(0);
  await expect(page.getByLabel("Workspace preview")).toHaveCount(0);
  await expect(page.getByText("Markdown in files. Metadata in SQLite.")).toHaveCount(0);
  const heroBox = await page.locator(".bb-auth-hero").boundingBox();
  const viewport = page.viewportSize();
  expect(heroBox?.width ?? 0).toBeGreaterThan(((viewport?.width ?? 0) * 0.85));

  await page.getByRole("link", { name: /read api docs/i }).click();

  await expect(page).toHaveURL(/\/docs\/?$/);
  await expect(page.locator("section.swagger-ui").first()).toBeVisible();
  await expect(page.getByText("/api/v1/notes").first()).toBeVisible();
  await expect(page.getByText("/healthz").first()).toBeVisible();
});
