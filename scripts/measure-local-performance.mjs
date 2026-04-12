import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const apiBase = process.env.CORPX_API_BASE_URL || 'http://127.0.0.1:8081/api/v1';
const baseUrl = process.env.CORPX_BASE_URL || 'http://127.0.0.1:4173';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');

function average(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
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

async function measureDashboardApis() {
  const oldPathRuns = [];
  const newPathRuns = [];

  for (let index = 0; index < 12; index += 1) {
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

async function measureMarketplaceNavigation() {
  async function singleRun(prefetchFirst) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    if (prefetchFirst) {
      await page.goto(`${baseUrl}/index`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
    }
    const startedAt = performance.now();
    await page.goto(`${baseUrl}/view-posts`, { waitUntil: 'networkidle' });
    await page.waitForSelector('role=tab[name="Market Place"]');
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    await browser.close();
    return durationMs;
  }

  const coldRuns = [];
  const prefetchedRuns = [];

  for (let index = 0; index < 5; index += 1) {
    coldRuns.push(await singleRun(false));
  }
  for (let index = 0; index < 5; index += 1) {
    prefetchedRuns.push(await singleRun(true));
  }

  return {
    cold: summarize(coldRuns),
    prefetched: summarize(prefetchedRuns),
  };
}

async function resolveStoredUploadPath(relativePath) {
  const uploadRootCandidates = [
    process.env.CORPX_UPLOAD_DIR,
    path.join(workspaceRoot, '..', 'uploads'),
    path.join(workspaceRoot, '..', 'corpx-backend', 'uploads'),
  ].filter(Boolean);

  for (const uploadRoot of uploadRootCandidates) {
    const candidate = path.join(uploadRoot, relativePath);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Stored upload not found for ${relativePath}`);
}

async function measureMarketplaceImagePath() {
  const organizations = await timedJson(`${apiBase}/auth/allowed-organizations`);
  const firstAllowed = Array.isArray(organizations.json) ? organizations.json[0] : null;
  if (!firstAllowed?.domain || !firstAllowed?.companyName) {
    throw new Error('No allowed organization is available for the image upload benchmark.');
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
      otpCode: '000000',
      firstName: 'Perf',
      lastName: 'User',
      phone: '9876543210',
      organizationId: firstAllowed.companyName,
      city: 'Bangalore',
    }),
  });

  const token = auth.json?.token;
  if (!token) {
    throw new Error('Failed to obtain auth token for image upload benchmark.');
  }

  const fixturePath = path.join(workspaceRoot, 'tests', 'fixtures', 'sample-image.png');
  const fixtureBytes = await fs.readFile(fixturePath);
  const form = new FormData();
  form.append('images', new Blob([fixtureBytes], { type: 'image/png' }), 'sample-image.png');

  const uploadStartedAt = performance.now();
  const uploadResponse = await fetch(`${apiBase}/upload/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadPayload = await uploadResponse.json();
  const uploadDurationMs = Number((performance.now() - uploadStartedAt).toFixed(2));
  const imageUrl = uploadPayload?.urls?.[0];
  if (!imageUrl) {
    throw new Error('Image upload did not return a URL.');
  }

  const relativePath = imageUrl.replace('/api/v1/uploads/', '');
  const storedPath = await resolveStoredUploadPath(relativePath);
  const storedStat = await fs.stat(storedPath);
  const served = await timedBytes(`http://127.0.0.1:8081${imageUrl}`);

  return {
    uploadDurationMs,
    originalBytes: fixtureBytes.length,
    storedBytes: storedStat.size,
    servedBytes: served.bytes,
    imageUrl,
  };
}

async function main() {
  const [dashboardApis, marketplaceNavigation, marketplaceImagePath] = await Promise.all([
    measureDashboardApis(),
    measureMarketplaceNavigation(),
    measureMarketplaceImagePath(),
  ]);

  console.log(JSON.stringify({
    dashboardApis,
    marketplaceNavigation,
    marketplaceImagePath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});