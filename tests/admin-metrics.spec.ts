import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.CORPX_API_BASE_URL || "http://127.0.0.1:8081/api/v1";
const ADMIN_EMAIL = process.env.CORPX_ADMIN_EMAIL || "admin@corpx.com";

async function signInAdmin(request: any) {
  const response = await request.post(`${API_BASE_URL}/auth/sign-in-existing`, {
    data: { email: ADMIN_EMAIL },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe("Admin metrics capture", () => {
  test("captures route and API metrics only during the enabled window", async ({ page, request, baseURL }) => {
    const signIn = await signInAdmin(request);
    const token = signIn?.token;
    const user = { ...(signIn?.user || {}), isAdmin: true };

    expect(token).toBeTruthy();
    expect(user?.id).toBeTruthy();

    await page.addInitScript(
      ({ authToken, storedUser }) => {
        localStorage.setItem("authToken", authToken);
        localStorage.setItem("user", JSON.stringify(storedUser));
      },
      { authToken: token, storedUser: user },
    );

    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 10 * 60_000);

    await page.goto(`${baseURL}/admin-metrics`);
    await expect(page.getByRole("heading", { name: "Application Metrics" })).toBeVisible();

    const inputs = page.locator('input[type="datetime-local"]');
    await inputs.nth(0).fill(toLocalDateTimeValue(start));
    await inputs.nth(1).fill(toLocalDateTimeValue(end));
    await page.getByRole("button", { name: "Enable capture window" }).click();

    await page.goto(`${baseURL}/index`);
    await expect(page.getByText("Recent Listings")).toBeVisible();

    await page.goto(`${baseURL}/view-posts`);
    await expect(page.getByText("View Posts")).toBeVisible();

    await page.goto(`${baseURL}/admin-metrics`);
    await expect(page.getByText("Captured Timeline")).toBeVisible();
    await expect(page.getByText("/view-posts", { exact: true })).toBeVisible();
  });
});