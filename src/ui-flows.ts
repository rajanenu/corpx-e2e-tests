import { expect, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import type { AuthSession } from "./corpx-api";
import type { TestUser } from "./test-data";
import { config } from "./config";

const sampleImagePath = path.resolve(process.cwd(), "tests/fixtures/sample-image.png");

const openSelectForLabel = async (page: Page, label: string) => {
  const labelLocator = page.getByText(label, { exact: true }).first();
  await labelLocator.locator('xpath=following::button[@role="combobox"][1]').click();
};

const selectRadixOption = async (page: Page, triggerLabel: string, optionText: string) => {
  await openSelectForLabel(page, triggerLabel);
  await page.getByRole("option", { name: optionText, exact: true }).click();
};

export const signInViaOtpFlow = async (page: Page, user: TestUser): Promise<AuthSession> => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Continue with corporate email" }).click();
  await expect(page).toHaveURL(/\/otp-email$/);

  await page.getByPlaceholder("you@company.com").fill(user.email);
  await page.getByRole("button", { name: "Continue" }).click();
  // Existing users are quick-signed in to /index; new users continue to /otp-verify.
  await page.waitForURL(/\/(otp-verify|index)$/, { timeout: 30000 });

  if (page.url().endsWith("/otp-verify")) {
    await page.getByPlaceholder("Enter the 6-digit code sent to your email").fill(config.fixedOtp);
    await page.getByPlaceholder("Raja").fill(user.firstName);
    await page.getByPlaceholder("Sekhar").fill(user.lastName);
    const orgInput = page.getByPlaceholder("e.g. TechCorp");
    // Org is auto-filled from allow-listed domain in current auth flow.
    await page.waitForTimeout(500);
    await page.getByPlaceholder("e.g. 9876543210").fill(user.phone);
    await selectRadixOption(page, "City", user.city);
    await page.getByRole("button", { name: /Get Started/ }).click();
  }

  await expect(page).toHaveURL(/\/index$/);
  await expect(page.getByRole("heading", { name: "Recent Listings" })).toBeVisible();

  const session = await page.evaluate(() => {
    const token = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("user");
    return {
      token,
      user: storedUser ? JSON.parse(storedUser) : null,
    };
  });

  if (!session.token || !session.user) {
    throw new Error("Login did not populate local storage as expected.");
  }

  return session as AuthSession;
};

export const updateProfile = async (page: Page, profile: { department: string; designation: string; address: string; bio: string }) => {
  await page.goto("/create-profile");
  await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();

  await page.getByLabel("Department").fill(profile.department);
  await page.getByLabel("Designation").fill(profile.designation);
  await page.getByLabel("Address").fill(profile.address);
  await page.getByLabel("Bio").fill(profile.bio);

  const profileSaveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/users/profile") && response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "Save Profile" }).click();

  const response = await profileSaveResponse;
  if (!response.ok()) {
    throw new Error(`Profile save failed with status ${response.status()}`);
  }

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText(profile.designation)).toBeVisible();
};

export const createMarketplaceItem = async (page: Page, itemTitle: string) => {
  await page.goto("/post-item");
  await expect(page.getByRole("heading", { name: /Sell or Rent an Item|Post Item|Edit Item/ })).toBeVisible();

  await page.locator('input[type="file"][multiple]').setInputFiles(sampleImagePath);
  await page.waitForTimeout(2300);

  await page.getByLabel("Item Title").fill(itemTitle);
  await selectRadixOption(page, "Category", "Electronics");
  await page.getByLabel("Price").fill("85000");
  if (await page.getByText("Condition", { exact: true }).first().isVisible().catch(() => false)) {
    await selectRadixOption(page, "Condition", "Like New");
  }
  await page.getByLabel(/Description|Additional Details/).fill(`Automated listing for ${itemTitle}`);
  const submitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/items")
      && ["POST", "PUT"].includes(response.request().method()),
    { timeout: 30000 }
  );

  await page.getByRole("button", { name: /Preview & Post Item|Post Item|Update Item/i }).click();
  const submitResponse = await submitResponsePromise;
  expect(submitResponse.ok()).toBeTruthy();
};

export const favoriteRecentListingFromHome = async (page: Page, itemTitle: string) => {
  await page.goto("/index");
  const card = page.locator("div.bg-white.rounded-2xl").filter({ hasText: itemTitle }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button").first().click();
};

export const openItemDetailsAndStartWhatsAppChat = async (page: Page, itemId: number) => {
  await page.goto(`/item/${itemId}`);
  await expect(page.getByRole("heading", { name: "Item Details" })).toBeVisible();

  await page.getByRole("button", { name: "Chat" }).click();
  await page.waitForURL(/\/messages\?/);
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  return page.url();
};

export const createJobPost = async (page: Page, jobTitle: string, city: string) => {
  await page.goto("/post-job");
  await expect(page.getByRole("heading", { name: /Post Job|Edit Job|Share a Job Opening/ })).toBeVisible();

  await page.getByLabel("Job Title").fill(jobTitle);
  await selectRadixOption(page, "Job Category", "Software Development");
  await selectRadixOption(page, "Location", city);
  await page.getByLabel("Detailed Description").fill(`Automated job post for ${jobTitle}`);
  await page.getByRole("button", { name: /Post Job|Update Job|Post Job Opening/ }).click();

  await expect(page).toHaveURL(/\/(index|view-posts\?tab=jobs)$/);
};

export const verifyJobDetails = async (page: Page, jobId: number, jobTitle: string) => {
  await page.goto(`/job/${jobId}`);
  await expect(page.getByRole("heading", { name: "Job Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: jobTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply|Apply via Email/ })).toBeVisible();
};

export const createEventPost = async (page: Page, eventTitle: string, city: string) => {
  await page.goto("/post-event");
  await expect(page.getByRole("heading", { name: /Post Event|Edit Event|Publish an Event/ })).toBeVisible();

  await page.getByLabel("Event Title").fill(eventTitle);
  await selectRadixOption(page, "Event Type", "Networking");
  await page.getByLabel("Date").fill("2026-12-20");
  await page.getByLabel("Time").fill("18:30");
  await selectRadixOption(page, "City", city);
  await page.getByLabel("Venue / Meeting Point").fill("CorpX Automation Cafe");
  await page.getByLabel(/Event Description|Detailed Description/).fill(`Automated event for ${eventTitle}`);
  await page.getByLabel("Interests & Skills Needed").fill("Networking, mentoring, product discussions");
  await page.getByLabel("Maximum Participants").fill("25");
  await page.getByLabel("Cost per Person (₹)").fill("0");
  await page.getByRole("button", { name: /Post Event|Update Event|Publish Event/ }).click();

  await expect(page).toHaveURL(/\/(index|event\/\d+|view-posts\?tab=events)/);
};

export const showInterestAndOpenEventWhatsApp = async (page: Page, eventId: number) => {
  await page.goto(`/event/${eventId}`);
  await expect(page.getByRole("heading", { name: "Event Details" })).toBeVisible();
  await page.getByTitle(/show interest|interested/i).click();
  await page.getByRole("button", { name: "Chat" }).click();
  await page.waitForURL(/\/messages\?/);
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  return page.url();
};

export const closeContextPages = async (context: BrowserContext | null) => {
  if (context) {
    await context.close().catch(() => undefined);
  }
};
