import { test, expect } from "@playwright/test";
import { config } from "../src/config";

const FIXED_OTP = process.env.CORPX_FIXED_OTP || "000000";

const apiHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

test("mobile: composer stays above bottom nav and can send", async ({ browser, request }) => {
  const orgsResponse = await request.get(`${config.apiBaseUrl}/auth/allowed-organizations`);
  expect(orgsResponse.ok()).toBeTruthy();
  const orgs = await orgsResponse.json();
  const domain = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].domain || "") : "";
  const organization = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].companyName || "DEFAULT") : "DEFAULT";
  expect(domain).toBeTruthy();

  const demoEmail = `chat-mobile.${Date.now()}@${domain}`;
  const demoPhone = "9000000011";
  const sendOtpResponse = await request.post(`${config.apiBaseUrl}/auth/send-otp`, {
    headers: apiHeaders(),
    data: { email: demoEmail },
  });
  expect(sendOtpResponse.ok()).toBeTruthy();
  const signInResponse = await request.post(`${config.apiBaseUrl}/auth/verify-otp`, {
    headers: apiHeaders(),
    data: {
      email: demoEmail,
      otpCode: FIXED_OTP,
      firstName: "Demo",
      lastName: "Ravi",
      phone: demoPhone,
      organizationId: organization,
      city: "Bangalore",
    },
  });
  expect(signInResponse.ok()).toBeTruthy();

  const session = await signInResponse.json();
  const token = session.token as string;
  const currentUser = (session.employee || session.user) as any;

  const itemsResponse = await request.get(`${config.apiBaseUrl}/items`);
  expect(itemsResponse.ok()).toBeTruthy();

  const items = await itemsResponse.json();
  const item = items.find((entry: any) => Number(entry?.seller?.id || 0) > 0 && Number(entry?.seller?.id) !== Number(currentUser?.id));
  expect(item).toBeTruthy();
  expect(Number(item?.seller?.id || 0)).toBeGreaterThan(0);

  const conversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: Number(item.seller.id),
      relatedItemId: Number(item.id),
      relatedItemTitle: String(item.title),
    },
  });
  expect(conversationResponse.ok()).toBeTruthy();
  const conversation = await conversationResponse.json();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ({ authToken, user }) => {
      localStorage.setItem("authToken", authToken);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { authToken: token, user: currentUser }
  );

  const page = await context.newPage();
  await page.goto(`${config.baseUrl}/messages?conversationId=${Number(conversation.id)}`);
  await page.waitForLoadState("networkidle");

  const textarea = page.locator("textarea");
  const sendButton = page.getByRole("button", { name: "Send message" });
  const bottomNav = page.locator("div.fixed.bottom-0.left-0.right-0").first();

  await expect(page).toHaveURL(/\/messages\?/);
  await expect(textarea).toBeVisible({ timeout: 60000 });
  await expect(sendButton).toBeVisible({ timeout: 60000 });
  await expect(bottomNav).toBeVisible({ timeout: 60000 });

  const textareaBox = await textarea.boundingBox();
  const bottomNavBox = await bottomNav.boundingBox();

  expect(textareaBox).not.toBeNull();
  expect(bottomNavBox).not.toBeNull();
  if (textareaBox && bottomNavBox) {
    expect(textareaBox.y + textareaBox.height).toBeLessThanOrEqual(bottomNavBox.y);
  }

  const mobileMessage = `mobile-ui-message-${Date.now()}`;
  await textarea.fill(mobileMessage);
  await sendButton.click();
  await expect(page.getByText(mobileMessage)).toBeVisible();

  await context.close();
});
