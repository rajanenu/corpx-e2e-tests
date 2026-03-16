# CorpX E2E Tests

This repository contains a standalone Playwright regression suite for CorpX. It is designed to validate the most important flows with two independent users against a deployed environment and then automatically clean up all dummy data created during the run.

## What it covers

- User A sign-in through the OTP UI flow
- User B sign-in through the OTP UI flow
- Profile update flow
- Marketplace item creation by User A
- Favorite action from Recent Listings by User B
- Item details WhatsApp contact flow from User B to User A
- Job post creation by User A
- Job discovery and details view by User B
- Event publish flow by User A
- Event interest flow by User B
- Event WhatsApp contact flow from User B to User A
- Automatic cleanup of favorites, created item/job/event records, and both dummy employees

## Assumptions

- The target environment is reachable through the configured frontend URL.
- The backend API is reachable through the configured API base URL.
- OTP verification is currently fixed to `000000` in the backend for testing/development.
- The event UI in the target deployment should match the current codebase, including the WhatsApp-based interest flow.

## Setup

1. Copy `.env.example` to `.env` and adjust the URLs if needed.
2. Install dependencies:

```bash
npm install
npx playwright install chromium
```

3. Run the suite:

```bash
npm test
```

4. Open the HTML report when needed:

```bash
npm run test:report
```

## CI

A GitHub Actions workflow is included at `.github/workflows/e2e.yml`.

Configure these repository secrets before using it:

- `CORPX_BASE_URL`
- `CORPX_API_BASE_URL`
- `CORPX_DEFAULT_ORGANIZATION`
- `CORPX_DEFAULT_CITY`
- `CORPX_FIXED_OTP`

## Notes

- The suite uses unique emails, phones, and listing titles for every run.
- Cleanup runs in a `finally` block, so even failed runs attempt to remove the test data.
- If the application UI changes significantly, update the selectors in `src/ui-flows.ts`.
