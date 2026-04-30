import { chromium } from 'playwright';
import { performance } from 'node:perf_hooks';

const apiBase =
  process.env.CORPX_API_BASE_URL ||
  'https://corpx-backend-atui3rufcq-el.a.run.app/api/v1';
const baseUrl =
  process.env.CORPX_BASE_URL ||
  'https://corpx-flutter-atui3rufcq-el.a.run.app';
const fixedOtp = process.env.CORPX_FIXED_OTP || '000000';

function average(values) {
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function summarize(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: average(values),
  };
}

async function timedJson(url, options) {
  const startedAt = performance.now();
  const response = await fetch(url, options);
  const bodyText = await response.text();
  return {
    status: response.status,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    bytes: Buffer.byteLength(bodyText),
    json: bodyText ? JSON.parse(bodyText) : null,
  };
}

async function timedBytes(url, options) {
  const startedAt = performance.now();
  const response = await fetch(url, options);
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    bytes: body.length,
  };
}

async function signInForUi() {
  const orgs = await timedJson(`${apiBase}/auth/allowed-organizations`);
  const firstAllowed = Array.isArray(orgs.json) ? orgs.json[0] : null;
  if (!firstAllowed?.domain || !firstAllowed?.companyName) {
    throw new Error('No allow-listed organization found for perf sign-in.');
  }

  const email = `perf.${Date.now()}@${firstAllowed.domain}`;
  await timedJson(`${apiBase}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const auth = await timedJson(`${apiBase}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      otpCode: fixedOtp,
      firstName: 'Perf',
      lastName: 'Cloud',
      phone: '9876543210',
      organizationId: firstAllowed.companyName,
      city: 'Bangalore',
    }),
  });

  const token = auth.json?.token;
  const user = auth.json?.user;
  if (!token || !user) {
    throw new Error('Cloud perf sign-in failed.');
  }

  return { token, user };
}

async function measureDashboardApis() {
  const oldPathRuns = [];
  const newPathRuns = [];

  for (let index = 0; index < 8; index += 1) {
    const recent = await timedJson(`${apiBase}/recent-listings?limit=12`);
    const stats = await timedJson(`${apiBase}/aggregates/dashboard-stats`);
    oldPathRuns.push({
      durationMs: Number((recent.durationMs + stats.durationMs).toFixed(2)),
      bytes: recent.bytes + stats.bytes,
    });

    const feed = await timedJson(`${apiBase}/aggregates/dashboard-feed?limit=12`);
    newPathRuns.push({ durationMs: feed.durationMs, bytes: feed.bytes });
  }

  return {
    oldPath: {
      ...summarize(oldPathRuns.map((run) => run.durationMs)),
      avgBytes: Math.round(average(oldPathRuns.map((run) => run.bytes))),
    },
    newPath: {
      ...summarize(newPathRuns.map((run) => run.durationMs)),
      avgBytes: Math.round(average(newPathRuns.map((run) => run.bytes))),
    },
  };
}

async function measureAggregatePayloads() {
  const defaultRuns = [];
  for (let index = 0; index < 6; index += 1) {
    const aggregate = await timedJson(
      `${apiBase}/aggregates/view-posts?mine=false&myOrg=false`,
    );
    defaultRuns.push({
      durationMs: aggregate.durationMs,
      bytes: aggregate.bytes,
    });
  }

  return {
    viewPostsAggregate: {
      ...summarize(defaultRuns.map((run) => run.durationMs)),
      avgBytes: Math.round(average(defaultRuns.map((run) => run.bytes))),
    },
  };
}

async function measureImageDelivery() {
  const feed = await timedJson(
    `${apiBase}/aggregates/dashboard-feed?limit=8`,
  );
  const listings = Array.isArray(feed.json?.recentListings)
    ? feed.json.recentListings
    : [];
  const firstImage = listings
    .map((entry) => String(entry?.imageUrl || '').trim())
    .find((value) => value.length > 0);

  if (!firstImage) {
    return { imageUrl: null, status: 'no-image-found' };
  }

  const resolvedImageUrl = new URL(firstImage, `${apiBase}/`).toString();
  const runs = [];
  for (let index = 0; index < 5; index += 1) {
    runs.push(await timedBytes(resolvedImageUrl));
  }

  return {
    imageUrl: resolvedImageUrl,
    status: 'ok',
    responseMs: summarize(runs.map((run) => run.durationMs)),
    avgBytes: Math.round(average(runs.map((run) => run.bytes))),
  };
}

async function measureAuthenticatedRoutes() {
  let session = null;
  try {
    session = await signInForUi();
  } catch (error) {
    return {
      status: 'auth-blocked',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const browser = await chromium.launch({ headless: true });

  async function singleRun(pathname, readyText) {
    const page = await browser.newPage();
    await page.addInitScript(
      ({ authToken, storedUser }) => {
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('user', JSON.stringify(storedUser));
      },
      { authToken: session.token, storedUser: session.user },
    );

    const startedAt = performance.now();
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
    await page
      .getByText(readyText, { exact: false })
      .first()
      .waitFor({ timeout: 60000 });
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    await page.close();
    return durationMs;
  }

  const indexRuns = [];
  const viewPostsRuns = [];

  for (let index = 0; index < 4; index += 1) {
    indexRuns.push(await singleRun('/index', 'Recent Listings'));
  }
  for (let index = 0; index < 4; index += 1) {
    viewPostsRuns.push(await singleRun('/view-posts', 'View Posts'));
  }

  await browser.close();

  return {
    status: 'ok',
    index: summarize(indexRuns),
    viewPosts: summarize(viewPostsRuns),
  };
}

async function main() {
  const [dashboardApis, aggregatePayloads, imageDelivery, authenticatedRoutes] =
    await Promise.all([
      measureDashboardApis(),
      measureAggregatePayloads(),
      measureImageDelivery(),
      measureAuthenticatedRoutes(),
    ]);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        apiBase,
        dashboardApis,
        aggregatePayloads,
        imageDelivery,
        authenticatedRoutes,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
