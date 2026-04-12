import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.CORPX_API_BASE_URL || "http://127.0.0.1:8081/api/v1";
const TEST_EMAIL = process.env.CORPX_SMOKE_EMAIL || "";
const TEST_PHONE = process.env.CORPX_SMOKE_PHONE || "9876543210";
const FIXED_OTP = process.env.CORPX_FIXED_OTP || "000000";

async function signInExisting(request: any) {
  let email = TEST_EMAIL;
  let organizationId = "DEFAULT";
  if (!email) {
    const orgsResponse = await request.get(`${API_BASE_URL}/auth/allowed-organizations`);
    expect(orgsResponse.ok()).toBeTruthy();
    const orgs = await orgsResponse.json();
    const domain = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].domain || "") : "";
    organizationId = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].companyName || "DEFAULT") : "DEFAULT";
    expect(domain).toBeTruthy();
    email = `smoke.${Date.now()}@${domain}`;
  }

  const sendOtp = await request.post(`${API_BASE_URL}/auth/send-otp`, {
    data: { email },
  });

  expect(sendOtp.ok()).toBeTruthy();

  const verify = await request.post(`${API_BASE_URL}/auth/verify-otp`, {
    data: {
      email,
      otpCode: FIXED_OTP,
      firstName: "Buyer",
      lastName: "Test User",
      phone: TEST_PHONE,
      organizationId,
      city: "Bangalore",
    },
  });

  expect(verify.ok()).toBeTruthy();
  return verify.json();
}

test.describe("Local UI smoke", () => {
  test("loads the key updated routes and interactions", async ({ page, request, baseURL }) => {
    const signIn = await signInExisting(request);
    const token = signIn?.token;
    const user = signIn?.user;

    expect(token).toBeTruthy();
    expect(user?.id).toBeTruthy();

    await page.addInitScript(
      ({ authToken, storedUser }) => {
        localStorage.setItem("authToken", authToken);
        localStorage.setItem("user", JSON.stringify(storedUser));
        localStorage.setItem("corpx:themePreference", "dark");
        localStorage.setItem("corpx:iconMode", "rich");
      },
      { authToken: token, storedUser: user },
    );

    await page.goto(`${baseURL}/index`);
    await expect(page.getByText("Services")).toBeVisible();
    await expect(page.getByRole("button", { name: "Need" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Split" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vault" })).toBeVisible();
    await expect(page.getByText("Trust")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.goto(`${baseURL}/profile`);
    await expect(page.getByText("My Profile")).toBeVisible();
    await expect(page.getByText("Display Preferences")).toBeVisible();

    const itemsResponse = await request.get(`${API_BASE_URL}/items?limit=5`);
    expect(itemsResponse.ok()).toBeTruthy();
    const items = await itemsResponse.json();
    const item = Array.isArray(items)
      ? items.find((candidate: any) => Number(candidate?.seller?.id || 0) > 0)
      : null;
    expect(item?.id).toBeTruthy();
    expect(Number(item?.seller?.id || 0)).toBeGreaterThan(0);

    await page.goto(`${baseURL}/item/${item.id}`);
    await page.getByRole("button", { name: "Checklist" }).click();
    await expect(page).toHaveURL(/\/checklists\?section=(buying|renting)$/);
    await expect(page.getByText("Checklist Guide")).toBeVisible();

    const jobsResponse = await request.get(`${API_BASE_URL}/jobs?limit=1`);
    expect(jobsResponse.ok()).toBeTruthy();
    const jobs = await jobsResponse.json();
    const job = Array.isArray(jobs) ? jobs[0] : null;
    expect(job?.id).toBeTruthy();

    await page.goto(`${baseURL}/job/${job.id}`);
    await page.getByRole("button", { name: "Checklist" }).click();
    await expect(page).toHaveURL(/\/checklists\?section=jobs$/);

    const eventsResponse = await request.get(`${API_BASE_URL}/events?limit=1`);
    expect(eventsResponse.ok()).toBeTruthy();
    const events = await eventsResponse.json();
    const event = Array.isArray(events) ? events[0] : null;
    expect(event?.id).toBeTruthy();

    await page.goto(`${baseURL}/event/${event.id}`);
    await page.getByRole("button", { name: "Checklist" }).click();
    await expect(page).toHaveURL(/\/checklists\?section=trips$/);

    const recentListingsResponse = await request.get(`${API_BASE_URL}/recent-listings?limit=6`);
    expect(recentListingsResponse.ok()).toBeTruthy();
    const recentListings = await recentListingsResponse.json();
    expect(Array.isArray(recentListings)).toBeTruthy();

    await page.goto(`${baseURL}/messages?userId=${item.seller.id}&itemId=${item.id}&title=${encodeURIComponent(item.title)}`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/messages\?/);
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible({ timeout: 60000 });
  });
});
