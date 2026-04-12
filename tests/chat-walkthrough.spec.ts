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

test("browser walkthrough: direct chat, switch thread, close chat, reopen another", async ({ browser, request }) => {
  const orgsResponse = await request.get(`${config.apiBaseUrl}/auth/allowed-organizations`);
  expect(orgsResponse.ok()).toBeTruthy();
  const orgs = await orgsResponse.json();
  const domain = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].domain || "") : "";
  const organization = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].companyName || "DEFAULT") : "DEFAULT";
  expect(domain).toBeTruthy();

  const demoEmail = `chat-ui.${Date.now()}@${domain}`;
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
  expect(token).toBeTruthy();
  expect(currentUser?.id).toBeTruthy();

  const itemsResponse = await request.get(`${config.apiBaseUrl}/items`);
  const eventsResponse = await request.get(`${config.apiBaseUrl}/events`);
  expect(itemsResponse.ok()).toBeTruthy();
  expect(eventsResponse.ok()).toBeTruthy();
  const items = await itemsResponse.json();
  const events = await eventsResponse.json();

  const item = items.find((entry: any) => Number(entry?.seller?.id || 0) > 0 && Number(entry?.seller?.id) !== Number(currentUser?.id));
  const event = events.find(
    (entry: any) =>
      Number(entry?.organizerEmployee?.id || 0) > 0
      && Number(entry?.organizerEmployee?.id) !== Number(currentUser?.id)
      && Number(entry?.organizerEmployee?.id) !== Number(item?.seller?.id || 0)
  ) || events.find((entry: any) => Number(entry?.organizerEmployee?.id || 0) > 0 && Number(entry?.organizerEmployee?.id) !== Number(currentUser?.id));
  expect(item).toBeTruthy();
  expect(event).toBeTruthy();
  const itemCounterpartyId = Number(item?.seller?.id || 0);
  const eventCounterpartyId = Number(event?.organizerEmployee?.id || 0);
  expect(itemCounterpartyId).toBeGreaterThan(0);
  expect(eventCounterpartyId).toBeGreaterThan(0);

  const itemConversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: itemCounterpartyId,
      relatedItemId: Number(item.id),
      relatedItemTitle: String(item.title),
    },
  });
  const eventConversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: eventCounterpartyId,
      relatedEventId: Number(event.id),
      relatedItemTitle: String(event.title),
    },
  });
  expect(itemConversationResponse.ok()).toBeTruthy();
  expect(eventConversationResponse.ok()).toBeTruthy();
  const itemConversation = await itemConversationResponse.json();
  const eventConversation = await eventConversationResponse.json();

  const itemSeedMessage = `browser-switch-item-${Date.now()}`;
  const eventSeedMessage = `browser-switch-event-${Date.now()}`;

  const itemMessageResponse = await request.post(`${config.apiBaseUrl}/messages`, {
    headers: apiHeaders(token),
    data: {
      toUserId: itemCounterpartyId,
      relatedItemId: Number(item.id),
      relatedItemTitle: String(item.title),
      content: itemSeedMessage,
    },
  });
  const eventMessageResponse = await request.post(`${config.apiBaseUrl}/messages`, {
    headers: apiHeaders(token),
    data: {
      toUserId: eventCounterpartyId,
      relatedEventId: Number(event.id),
      relatedItemTitle: String(event.title),
      content: eventSeedMessage,
    },
  });
  expect(itemMessageResponse.ok()).toBeTruthy();
  expect(eventMessageResponse.ok()).toBeTruthy();

  const context = await browser.newContext();
  await context.addInitScript(
    ({ authToken, user }) => {
      localStorage.setItem("authToken", authToken);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { authToken: token, user: currentUser }
  );

  const page = await context.newPage();
  await page.goto(`${config.baseUrl}/messages?conversationId=${Number(itemConversation.id)}`);
  await page.waitForLoadState("networkidle");
  const activeHeader = page.locator("div.bg-white.border-b.border-gray-200").first();

  await expect(page).toHaveURL(/\/messages\?/);
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible({ timeout: 60000 });
  await expect(activeHeader.getByText(`Item: ${String(item.title)}`)).toBeVisible({ timeout: 60000 });
  await expect(page.locator("textarea")).toBeVisible({ timeout: 60000 });

  const itemUiMessage = `ui-item-message-${Date.now()}`;
  await page.locator("textarea").fill(itemUiMessage);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(itemUiMessage)).toBeVisible();

  await page.getByRole("button", { name: new RegExp(String(event.organizerEmployee?.fullName || ""), "i") }).filter({ hasText: String(event.title) }).click();
  await expect(activeHeader.getByText(`Event: ${String(event.title)}`)).toBeVisible();

  const eventUiMessage = `ui-event-message-${Date.now()}`;
  await page.locator("textarea").fill(eventUiMessage);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(eventUiMessage)).toBeVisible();

  await page.getByTitle("Close this chat").click();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByText("Select a conversation")).toBeVisible();

  await page.getByRole("button", { name: new RegExp(String(item.seller?.fullName || ""), "i") }).filter({ hasText: String(item.title) }).click();
  await expect(activeHeader.getByText(`Item: ${String(item.title)}`)).toBeVisible();

  await context.close();
});