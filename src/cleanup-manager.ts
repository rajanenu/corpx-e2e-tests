import { CorpXApi } from "./corpx-api";

interface CleanupUser {
  employeeId: number;
  token: string;
}

export class CleanupManager {
  private readonly users = new Map<string, CleanupUser>();
  private readonly itemIds = new Set<number>();
  private readonly jobIds = new Set<number>();
  private readonly eventIds = new Set<number>();
  private readonly eventParticipants: Array<{ eventId: number; userKey: string }> = [];

  registerUser(userKey: string, employeeId: number, token: string) {
    this.users.set(userKey, { employeeId, token });
  }

  registerItem(id: number) {
    this.itemIds.add(id);
  }

  registerJob(id: number) {
    this.jobIds.add(id);
  }

  registerEvent(id: number) {
    this.eventIds.add(id);
  }

  registerEventParticipant(eventId: number, userKey: string) {
    this.eventParticipants.push({ eventId, userKey });
  }

  async run(api: CorpXApi) {
    for (const participant of this.eventParticipants.reverse()) {
      const user = this.users.get(participant.userKey);
      if (!user) {
        continue;
      }
      await api.leaveEvent(participant.eventId, user.employeeId, user.token);
    }

    for (const user of this.users.values()) {
      const favorites = await api.getFavorites(user.token);
      for (const favorite of favorites) {
        await api.deleteFavorite(favorite.id, user.token);
      }
    }

    for (const eventId of Array.from(this.eventIds).reverse()) {
      await api.deleteEvent(eventId);
    }

    for (const jobId of Array.from(this.jobIds).reverse()) {
      await api.deleteJob(jobId);
    }

    for (const itemId of Array.from(this.itemIds).reverse()) {
      await api.deleteItem(itemId);
    }

    for (const user of Array.from(this.users.values()).reverse()) {
      await api.deleteEmployee(user.employeeId);
    }
  }
}
