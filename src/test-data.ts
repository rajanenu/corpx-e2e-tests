import { config } from "./config";

export interface TestUser {
  key: "userA" | "userB";
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  organization: string;
  city: string;
}

export interface TestRunData {
  runId: string;
  userA: TestUser;
  userB: TestUser;
  itemTitle: string;
  jobTitle: string;
  eventTitle: string;
}

const buildPhone = (seed: number) => `9${String(seed).slice(-9)}`;

export const createTestRunData = (): TestRunData => {
  const now = Date.now();
  const runId = `e2e-${now}`;

  return {
    runId,
    userA: {
      key: "userA",
      email: `${runId}.seller@tesco.com`,
      firstName: "Seller",
      lastName: "User",
      phone: buildPhone(now),
      organization: config.defaultOrganization,
      city: config.defaultCity,
    },
    userB: {
      key: "userB",
      email: `${runId}.buyer@tesco.com`,
      firstName: "Buyer",
      lastName: "User",
      phone: buildPhone(now + 111111),
      organization: config.defaultOrganization,
      city: config.defaultCity,
    },
    itemTitle: `CorpX Playwright Laptop ${runId}`,
    jobTitle: `CorpX Playwright Engineer ${runId}`,
    eventTitle: `CorpX Playwright Meetup ${runId}`,
  };
};
