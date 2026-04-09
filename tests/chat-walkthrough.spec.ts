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

test("browser walkthrough: direct chat, switch thread, close chat, reopen another", async ({ browser, request }) => {
  const signInResponse = await request.post(`${config.apiBaseUrl}/auth/sign-in-existing`, {
    headers: apiHeaders(),
    data: { email: "demo.ravi@corpx.local" },
  });
  expect(signInResponse.ok()).toBeTruthy();

  const session = await signInResponse.json();
  const token = session.token as string;
  const currentUser = (session.employee || session.user) as any;
  expect(token).toBeTruthy();
  expect(currentUser?.id).toBeTruthy();

  const arjunResponse = await request.get(`${config.apiBaseUrl}/employees/email/${encodeURIComponent("demo.arjun@blueorbit.local")}`);
  const kiranResponse = await request.get(`${config.apiBaseUrl}/employees/email/${encodeURIComponent("demo.kiran@blueorbit.local")}`);
  expect(arjunResponse.ok()).toBeTruthy();
  expect(kiranResponse.ok()).toBeTruthy();
  const arjun = await arjunResponse.json();
  const kiran = await kiranResponse.json();

  const itemsResponse = await request.get(`${config.apiBaseUrl}/items`);
  const eventsResponse = await request.get(`${config.apiBaseUrl}/events`);
  expect(itemsResponse.ok()).toBeTruthy();
  expect(eventsResponse.ok()).toBeTruthy();
  const items = await itemsResponse.json();
  const events = await eventsResponse.json();

  const item = items.find((entry: any) => String(entry?.title) === "Noise Cancelling Headphones - Demo 24");
  const event = events.find((entry: any) => String(entry?.title) === "AI Builders Meetup - Demo 7");
  expect(item).toBeTruthy();
  expect(event).toBeTruthy();

  const itemConversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: Number(arjun.id),
      relatedItemId: Number(item.id),
      relatedItemTitle: String(item.title),
    },
  });
  const eventConversationResponse = await request.post(`${config.apiBaseUrl}/messages/start`, {
    headers: apiHeaders(token),
    data: {
      toUserId: Number(kiran.id),
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
      toUserId: Number(arjun.id),
      relatedItemId: Number(item.id),
      relatedItemTitle: String(item.title),
      content: itemSeedMessage,
    },
  });
  const eventMessageResponse = await request.post(`${config.apiBaseUrl}/messages`, {
    headers: apiHeaders(token),
    data: {
      toUserId: Number(kiran.id),
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
  const activeHeader = page.locator("div.bg-white.border-b.border-gray-200").first();

  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(activeHeader.getByText(`Item: ${String(item.title)}`)).toBeVisible();
  await expect(page.locator("textarea")).toBeVisible();

  const itemUiMessage = `ui-item-message-${Date.now()}`;
  await page.locator("textarea").fill(itemUiMessage);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(itemUiMessage)).toBeVisible();

  await page.getByRole("button", { name: /Kiran Das/ }).filter({ hasText: String(event.title) }).click();
  await expect(activeHeader.getByText(`Event: ${String(event.title)}`)).toBeVisible();

  const eventUiMessage = `ui-event-message-${Date.now()}`;
  await page.locator("textarea").fill(eventUiMessage);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(eventUiMessage)).toBeVisible();

  await page.getByTitle("Close this chat").click();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByText("Select a conversation")).toBeVisible();

  await page.getByRole("button", { name: /Arjun Nair/ }).filter({ hasText: String(item.title) }).click();
  await expect(activeHeader.getByText(`Item: ${String(item.title)}`)).toBeVisible();

  await context.close();
});