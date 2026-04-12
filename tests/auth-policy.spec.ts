import { test, expect } from "@playwright/test";
import { CorpXApi } from "../src/corpx-api";
import { config } from "../src/config";
import { createTestRunData } from "../src/test-data";

const parseDate = (value?: string | null) => (value ? new Date(value) : null);

test.describe("Auth policy: email/mobile/refresh/reverify", () => {
  test("validates required auth and reverification use cases", async ({ request }) => {
    const api = new CorpXApi(request);
    const run = createTestRunData();

    const orgResponse = await request.get(`${config.apiBaseUrl}/auth/allowed-organizations`);
    expect(orgResponse.ok()).toBeTruthy();
    const orgs = await orgResponse.json();
    const firstAllowedDomain = Array.isArray(orgs) && orgs.length > 0 ? String(orgs[0].domain || "") : "";
    expect(firstAllowedDomain).toBeTruthy();

    const localPart = `${run.runId}.usera`.toLowerCase();
    run.userA.email = `${localPart}@${firstAllowedDomain}`;

    // ── First-time corporate email OTP login ───────────────────────────────
    await api.sendOtp(run.userA.email);
    const firstLogin = await api.verifyOtp(run.userA);
    expect(firstLogin.token).toBeTruthy();
    expect(firstLogin.refreshToken).toBeTruthy();

    const userA = await api.getEmployeeByEmail(run.userA.email);
    expect(userA).not.toBeNull();

    // Professional reverify window should be around 180 days from now.
    const initialStatus = await api.getVerificationStatus(firstLogin.token);
    expect(initialStatus.professionalEmailReverifyRequired).toBeFalsy();
    const initialDue = parseDate(initialStatus.professionalEmailReverifyDueAt);
    expect(initialDue).not.toBeNull();
    const daysToDue = initialDue ? (initialDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : 0;
    expect(daysToDue).toBeGreaterThan(170);
    expect(daysToDue).toBeLessThan(190);

    // ── Existing email should be directed to mobile login (409) ───────────
    const existingEmailAttempt = await request.post(`${config.apiBaseUrl}/auth/send-otp`, {
      data: { email: run.userA.email },
    });
    expect(existingEmailAttempt.status()).toBe(409);

    // ── Unknown mobile should fail ─────────────────────────────────────────
    const unknownPhoneAttempt = await api.sendPhoneOtp("+919999000111");
    expect(unknownPhoneAttempt.status()).toBe(404);

    // ── Registered mobile OTP (last 4 digits temporary rule) ──────────────
    const sendPhoneOtp = await api.sendPhoneOtp(run.userA.phone);
    expect(sendPhoneOtp.ok()).toBeTruthy();
    const last4 = run.userA.phone.slice(-4);
    let phoneLogin;
    try {
      phoneLogin = await api.verifyPhoneOtp(run.userA.phone, config.fixedOtp);
    } catch {
      phoneLogin = await api.verifyPhoneOtp(run.userA.phone, last4);
    }
    expect(phoneLogin.token).toBeTruthy();
    expect(phoneLogin.refreshToken).toBeTruthy();

    // ── Refresh token rotation and replay protection ───────────────────────
    const refresh1 = await api.refreshAccessToken(phoneLogin.refreshToken || "", "policy-device-1");
    expect(refresh1.ok()).toBeTruthy();
    const refresh1Json = await refresh1.json();
    expect(refresh1Json.token).toBeTruthy();
    expect(refresh1Json.refreshToken).toBeTruthy();
    expect(refresh1Json.refreshToken).not.toBe(phoneLogin.refreshToken);

    // Reusing old refresh token should fail because of rotation.
    const replayOldRefresh = await api.refreshAccessToken(phoneLogin.refreshToken || "", "policy-device-1");
    expect([401, 403]).toContain(replayOldRefresh.status());

    // ── Company email change grants 7-day grace before mandatory lock ─────
    const changedEmail = `${run.runId}.newcompany@${firstAllowedDomain}`;
    const updateProfile = await api.updateProfile(refresh1Json.token, { email: changedEmail });
    expect(updateProfile.ok()).toBeTruthy();

    const afterChangeStatus = await api.getVerificationStatus(refresh1Json.token);
    expect(afterChangeStatus.professionalEmailReverifyRequired).toBeFalsy();
    const graceDue = parseDate(afterChangeStatus.professionalEmailReverifyDueAt);
    expect(graceDue).not.toBeNull();
    const graceDays = graceDue ? (graceDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : 0;
    expect(graceDays).toBeGreaterThan(5.5);
    expect(graceDays).toBeLessThan(8.5);

    // ── Overdue reverification blocks app actions (HTTP 428) ───────────────
    if (userA?.phoneNumber) {
      const forceOverdue = await request.put(`${config.apiBaseUrl}/employees`, {
        data: {
          phoneNumber: userA.phoneNumber,
          professionalEmailReverifyDueAt: "2020-01-01T00:00:00",
        },
      });
      expect(forceOverdue.ok()).toBeTruthy();

      const blockedAction = await request.get(`${config.apiBaseUrl}/favorites`, {
        headers: { Authorization: `Bearer ${refresh1Json.token}` },
      });
      expect(blockedAction.status()).toBe(428);

      // Reverify endpoints must remain accessible during lock.
      const stillAccessible = await request.get(`${config.apiBaseUrl}/users/profile/verification-status`, {
        headers: { Authorization: `Bearer ${refresh1Json.token}` },
      });
      expect(stillAccessible.ok()).toBeTruthy();
    }

    // Cleanup created user to keep local DB tidy.
    if (userA?.id) {
      await api.deleteEmployee(userA.id);
    }
  });
});
