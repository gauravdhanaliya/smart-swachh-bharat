// Vercel entry point: the EcoSetu API (server/) as one serverless function.
// vercel.json rewrites every /api/* request here; the static app is served
// from dist/ by Vercel's CDN. Same origin, so no CORS and the refresh cookie
// stays SameSite=Strict.
//
// Seeding is not done here (it would run on every cold start); run
// `npm run seed` against the production database once instead.

import { lazyApp } from "../server/src/serverless.js";
import { startApi } from "../server/src/start.js";

export default lazyApp(async () => (await startApi()).app);
