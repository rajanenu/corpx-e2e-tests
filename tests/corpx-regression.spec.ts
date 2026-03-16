import { test, expect } from "@playwright/test";
import { CleanupManager } from "../src/cleanup-manager";
import { CorpXApi } from "../src/corpx-api";
import { closeContextPages, createEventPost, createJobPost, createMarketplaceItem, favoriteRecentListingFromHome, openItemDetailsAndStartWhatsAppChat, showInterestAndOpenEventWhatsApp, signInViaOtpFlow, updateProfile, verifyJobDetails } from "../src/ui-flows";
import { createTestRunData } from "../src/test-data";

test.describe("CorpX two-user regression", () => {
  test("covers the primary external-user flows and cleans up generated data", async ({ browser, request }) => {
    const run = createTestRunData();
    const api = new CorpXApi(request);
    const cleanup = new CleanupManager();

    let sessionA: Awaited<ReturnType<typeof signInViaOtpFlow>> | null = null;
    let sessionB: Awaited<ReturnType<typeof signInViaOtpFlow>> | null = null;
    let userAContext = null;
    let userBContext = null;

    try {
      await test.step("Sign in user A and update profile", async () => {
        userAContext = await browser.newContext();
        const userAPage = await userAContext.newPage();
        sessionA = await signInViaOtpFlow(userAPage, run.userA);
        cleanup.registerUser(run.userA.key, sessionA.user.id, sessionA.token);

        await updateProfile(userAPage, {
          department: "Automation Engineering",
          designation: "CorpX E2E Owner",
          address: `Automation address for ${run.runId}`,
          bio: `Automation profile for ${run.runId}`,
        });
      });

      await test.step("Sign in user B and update profile", async () => {
        userBContext = await browser.newContext();
        const userBPage = await userBContext.newPage();
        sessionB = await signInViaOtpFlow(userBPage, run.userB);
        cleanup.registerUser(run.userB.key, sessionB.user.id, sessionB.token);

        await updateProfile(userBPage, {
          department: "Automation QA",
          designation: "CorpX E2E Reviewer",
          address: `Automation address for ${run.runId}`,
          bio: `Automation reviewer profile for ${run.runId}`,
        });
      });

      await test.step("User A creates a marketplace item", async () => {
        const userAPage = await userAContext!.newPage();
        await createMarketplaceItem(userAPage, run.itemTitle);

        const seller = await api.getEmployeeByEmail(run.userA.email);
        expect(seller).not.toBeNull();
        const items = await api.getItemsBySeller(seller!.id);
        const createdItem = items.find((item) => item.title === run.itemTitle);
        expect(createdItem).toBeTruthy();
        cleanup.registerItem(createdItem.id);
      });

      await test.step("User B favorites the new item from Recent Listings and opens WhatsApp from item details", async () => {
        const userBPage = await userBContext!.newPage();
        const buyer = await api.getEmployeeByEmail(run.userB.email);
        const seller = await api.getEmployeeByEmail(run.userA.email);
        expect(buyer).not.toBeNull();
        expect(seller).not.toBeNull();
        const items = await api.getItemsBySeller(seller!.id);
        const createdItem = items.find((item) => item.title === run.itemTitle);
        expect(createdItem).toBeTruthy();

        await favoriteRecentListingFromHome(userBPage, run.itemTitle);

  expect(sessionB).not.toBeNull();
  const favorites = await api.getFavorites(sessionB!.token);
        expect(favorites.some((favorite) => favorite.itemId === createdItem.id)).toBeTruthy();

        const whatsappUrl = await openItemDetailsAndStartWhatsAppChat(userBPage, createdItem.id);
        expect(whatsappUrl).toContain("wa.me/");
      });

      await test.step("User A creates a job and user B can view its details", async () => {
        const userAPage = await userAContext!.newPage();
        await createJobPost(userAPage, run.jobTitle, run.userA.city);

        const seller = await api.getEmployeeByEmail(run.userA.email);
        expect(seller).not.toBeNull();
        const jobs = await api.getJobsByPoster(seller!.id);
        const createdJob = jobs.find((job) => job.title === run.jobTitle);
        expect(createdJob).toBeTruthy();
        cleanup.registerJob(createdJob.id);

        const userBPage = await userBContext!.newPage();
        await verifyJobDetails(userBPage, createdJob.id, run.jobTitle);
      });

      await test.step("User A publishes an event and user B shows interest then opens WhatsApp", async () => {
        const userAPage = await userAContext!.newPage();
        await createEventPost(userAPage, run.eventTitle, run.userA.city);

        const seller = await api.getEmployeeByEmail(run.userA.email);
        const buyer = await api.getEmployeeByEmail(run.userB.email);
        expect(seller).not.toBeNull();
        expect(buyer).not.toBeNull();

        const events = await api.getEventsByOrganizer(seller!.id);
        const createdEvent = events.find((event) => event.title === run.eventTitle);
        expect(createdEvent).toBeTruthy();
        cleanup.registerEvent(createdEvent.id);

        const userBPage = await userBContext!.newPage();
        const whatsappUrl = await showInterestAndOpenEventWhatsApp(userBPage, createdEvent.id);
        cleanup.registerEventParticipant(createdEvent.id, run.userB.key);

        expect(whatsappUrl).toContain("wa.me/");
        const interestStatus = await api.getInterestStatus(createdEvent.id, buyer!.id);
        expect(interestStatus.joined).toBeTruthy();
        expect(Number(interestStatus.participantCount)).toBeGreaterThan(0);
      });
    } finally {
      await closeContextPages(userAContext);
      await closeContextPages(userBContext);
      await cleanup.run(api);
    }
  });
});
