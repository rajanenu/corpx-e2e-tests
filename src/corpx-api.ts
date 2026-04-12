import { APIRequestContext, expect } from "@playwright/test";
import { config } from "./config";
import type { TestUser } from "./test-data";

export interface EmployeeRecord {
  id: number;
  email: string;
  fullName: string;
  phoneNumber?: string;
  organizationName?: string;
  location?: string;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  user: EmployeeRecord;
}

export interface VerificationStatus {
  professionalEmailVerifiedAt?: string | null;
  professionalEmailReverifyDueAt?: string | null;
  professionalEmailReverifyRequired?: boolean;
}

export interface FavoriteRecord {
  id: number;
  itemId?: number;
  jobId?: number;
  eventId?: number;
}

const buildHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

export class CorpXApi {
  constructor(private readonly request: APIRequestContext) {}

  async sendOtp(email: string): Promise<void> {
    const response = await this.request.post(`${config.apiBaseUrl}/auth/send-otp`, {
      headers: buildHeaders(),
      data: { email },
    });
    expect(response.ok()).toBeTruthy();
  }

  async verifyOtp(user: TestUser): Promise<AuthSession> {
    const response = await this.request.post(`${config.apiBaseUrl}/auth/verify-otp`, {
      headers: buildHeaders(),
      data: {
        email: user.email,
        otpCode: config.fixedOtp,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        organizationId: user.organization,
        city: user.city,
      },
    });

    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async sendPhoneOtp(phone: string) {
    return this.request.post(`${config.apiBaseUrl}/auth/phone/send-otp`, {
      headers: buildHeaders(),
      data: { phone },
    });
  }

  async verifyPhoneOtp(phone: string, otpCode: string, deviceId = `e2e-${Date.now()}`): Promise<AuthSession> {
    const response = await this.request.post(`${config.apiBaseUrl}/auth/phone/verify-otp`, {
      headers: buildHeaders(),
      data: { phone, otpCode, deviceId, deviceHint: "playwright-e2e" },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async refreshAccessToken(refreshToken: string, deviceId = `e2e-${Date.now()}`) {
    return this.request.post(`${config.apiBaseUrl}/auth/refresh`, {
      headers: buildHeaders(),
      data: { refreshToken, deviceId },
    });
  }

  async getVerificationStatus(token: string): Promise<VerificationStatus> {
    const response = await this.request.get(`${config.apiBaseUrl}/users/profile/verification-status`, {
      headers: buildHeaders(token),
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async updateProfile(token: string, data: Record<string, unknown>) {
    return this.request.put(`${config.apiBaseUrl}/users/profile`, {
      headers: buildHeaders(token),
      data,
    });
  }

  async getEmployeeByEmail(email: string): Promise<EmployeeRecord | null> {
    const response = await this.request.get(`${config.apiBaseUrl}/employees/email/${encodeURIComponent(email)}`);
    if (response.status() === 404) {
      return null;
    }
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async deleteEmployee(id: number): Promise<void> {
    const response = await this.request.delete(`${config.apiBaseUrl}/employees/${id}`);
    expect([204, 404]).toContain(response.status());
  }

  async getItemsBySeller(sellerId: number): Promise<any[]> {
    const response = await this.request.get(`${config.apiBaseUrl}/items/seller/${sellerId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async deleteItem(id: number): Promise<void> {
    const response = await this.request.delete(`${config.apiBaseUrl}/items/${id}`);
    expect([204, 404]).toContain(response.status());
  }

  async getJobsByPoster(userId: number): Promise<any[]> {
    const response = await this.request.get(`${config.apiBaseUrl}/jobs/poster/${userId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async deleteJob(id: number): Promise<void> {
    const response = await this.request.delete(`${config.apiBaseUrl}/jobs/${id}`);
    expect([204, 404]).toContain(response.status());
  }

  async getEventsByOrganizer(userId: number): Promise<any[]> {
    const response = await this.request.get(`${config.apiBaseUrl}/events/organizer/${userId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async deleteEvent(id: number): Promise<void> {
    const response = await this.request.delete(`${config.apiBaseUrl}/events/${id}`);
    expect([204, 404]).toContain(response.status());
  }

  async getFavorites(token: string): Promise<FavoriteRecord[]> {
    const response = await this.request.get(`${config.apiBaseUrl}/favorites`, {
      headers: buildHeaders(token),
    });
    if (response.status() === 401) {
      return [];
    }
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async deleteFavorite(id: number, token: string): Promise<void> {
    const response = await this.request.delete(`${config.apiBaseUrl}/favorites/${id}`, {
      headers: buildHeaders(token),
    });
    expect([204, 404]).toContain(response.status());
  }

  async leaveEvent(eventId: number, userId: number, token: string): Promise<void> {
    const response = await this.request.post(`${config.apiBaseUrl}/events/${eventId}/leave`, {
      headers: buildHeaders(token),
      data: { userId },
    });
    expect([200, 400]).toContain(response.status());
  }

  async getInterestStatus(eventId: number, userId: number): Promise<any> {
    const response = await this.request.get(`${config.apiBaseUrl}/events/${eventId}/interest-status?userId=${userId}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
}
