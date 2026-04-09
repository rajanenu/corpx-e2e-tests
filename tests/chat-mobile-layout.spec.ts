import { test, expect } from "@playwright/test";
import { config } from "../src/config";

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
  const signInResponse = await request.post(`${config.apiBaseUrl}/auth/sign-in-existing`, {
    headers: apiHeaders(),
    data: { email: "demo.ravi@corpx.local" },
  });
  expect(signInResponse.ok()).toBeTruthy();

  const session = await signInResponse.json();
  const token = session.token as string;
  const currentUser = (session.employee || session.user) as any;

  const arjunResponse = await request.get(`${config.apiBaseUrl}/employees/email/${encodeURIComponent("demo.arjun@blueorbit.local")}`);
  const itemsResponse = await request.get(`${config.apiBaseUrl}/items`);
  expect(arjunResponse.ok()).toBeTruthy();
  expect(itemsResponse.ok()).toBeTruthy();

  const arjun = await arjunResponse.json();
  const items = await itemsResponse.json();
  const item = items.find((entry: any) => String(entry?.title) === "Noise Cancelling Headphones - Demo 24");
  expect(item).toBeTruthy();

  const conversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: Number(arjun.id),
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

  const textarea = page.locator("textarea");
  const sendButton = page.getByRole("button", { name: "Send message" });
  const bottomNav = page.locator("div.fixed.bottom-0.left-0.right-0").first();

  await expect(textarea).toBeVisible();
  await expect(sendButton).toBeVisible();
  await expect(bottomNav).toBeVisible();

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
