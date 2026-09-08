import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Until this file existed there was no vitest config at all, which meant
 * `@/lib/...` did not resolve and therefore no Route Handler could be
 * imported by a test. That is the mechanical reason the assistant auth
 * bypass shipped unnoticed: the bug lived in a route, and no route was
 * reachable from the test suite.
 *
 * The env pins are load-bearing, not cosmetic:
 *  - GITHUB_TOKEN: `lib/github.ts` evaluates `process.env.GITHUB_TOKEN ||
 *    getGitHubToken()` at module load, and getGitHubToken() shells out to
 *    `gh auth token`. Without a non-empty pin, importing anything that
 *    reaches lib/github.ts spawns a subprocess and injects the developer's
 *    real GitHub token into the test run. '' is falsy and still shells out.
 *  - LLM_API_KEY: routes 503 before doing anything interesting when the
 *    provider is unconfigured, so auth tests could never reach the auth gate.
 */
export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['{lib,app,scripts}/**/*.test.ts'],
    env: {
      GITHUB_TOKEN: 'test-not-a-real-token',
      LLM_API_KEY: 'test-key-not-real',
    },
  },
});
