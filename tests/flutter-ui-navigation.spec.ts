import { expect, test } from "@playwright/test";

test.describe("Flutter UI navigation and button responsiveness", () => {
  test("login routes, back navigation, and auth links work", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login?mobile=1`);

    await expect(page.getByText("Use mobile number")).toBeVisible();
    await expect(page.getByText("Use corporate email")).toBeVisible();

    await page.getByRole("button", { name: /Use mobile number/i }).click();
    await expect(page).toHaveURL(/\/phone-login/);
    await expect(page.getByText("Not registered? Sign in with corporate email")).toBeVisible();

    await page.getByRole("button", { name: /Not registered\? Sign in with corporate email/i }).click();
    await expect(page).toHaveURL(/\/otp-email/);
    await expect(page.getByText("Already registered? Sign in with mobile number")).toBeVisible();

    await page.getByRole("button", { name: /Already registered\? Sign in with mobile number/i }).click();
    await expect(page).toHaveURL(/\/phone-login/);

    await page.getByRole("button", { name: /arrow back/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard pages and major buttons navigate correctly", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/index?mobile=1`);

    await expect(page.getByText("Browse")).toBeVisible();
    await expect(page.getByText("Services")).toBeVisible();

    await page.getByRole("button", { name: /^Browse$/i }).first().click();
    await expect(page.getByText("Search marketplace listings").first()).toBeVisible();

    await page.getByRole("button", { name: /^Alerts$/i }).first().click();
    await expect(page.getByText("Live updates from your account").first()).toBeVisible();

    await page.getByRole("button", { name: /^Profile$/i }).first().click();
    await expect(page.getByText("My Profile").first()).toBeVisible();

    await page.getByRole("button", { name: /^Home$/i }).first().click();
    await expect(page.getByText("Services")).toBeVisible();

    await page.getByRole("button", { name: /^Need$/i }).first().click();
    await expect(page.getByText("Requirements").first()).toBeVisible();
    await page.goBack();

    await page.getByRole("button", { name: /^Split$/i }).first().click();
    await expect(page.getByText("Split Expenses").first()).toBeVisible();
    await page.goBack();

    await page.getByRole("button", { name: /^Checklist$/i }).first().click();
    await expect(page.getByText("Checklist Guide").first()).toBeVisible();
    await page.goBack();

    await page.getByRole("button", { name: /^Buy$/i }).first().click();
    await expect(page.getByText("View Posts").first()).toBeVisible();
    await page.goBack();

    const postButton = page.getByRole("button", { name: /post|auto awesome|sparkle/i }).first();
    if (await postButton.isVisible()) {
      await postButton.click();
      await expect(page.getByText("Create Post").first()).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});
