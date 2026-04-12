import { test, expect } from "@playwright/test";

test.describe("Login policy UI", () => {
  test("shows dual login options and existing-user guidance", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/login`);
    await expect(page.getByRole("button", { name: "Continue with mobile number" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with corporate email" })).toBeVisible();

    await page.getByRole("button", { name: "Continue with corporate email" }).click();
    await expect(page).toHaveURL(/\/otp-email$/);

    await expect(page.getByText("Existing account? Use mobile-number OTP")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with mobile number" })).toBeVisible();
  });
});
