/**
 * lib/llm-budget.ts
 *
 * One place that knows what the LLM provider will actually give us for free,
 * so the per-user limits and the global ceiling are derived from a real
 * number instead of guessed.
 *
 * Measured directly against Groq's free tier (response headers on a live
 * `POST /chat/completions`, both configured models, same key):
 *
 *   x-ratelimit-limit-requests: 1000     reset 1m26.4s  ->  86.4s == 86400/1000
 *   x-ratelimit-limit-tokens:   8000     reset 547ms    ->  per minute
 *
 * Two corrections to what this file used to claim, both verified on
 * 2026-09-06 and both material:
 *
 * 1. THE BUCKETS ARE PER MODEL, NOT SHARED. This file previously said the
 *    budget was "shared across every model, because it is one API key".
 *    Measured: four calls to openai/gpt-oss-20b took its remaining-requests
 *    to 996 while openai/gpt-oss-120b independently sat at 998. So the agent
 *    (120b) does not compete with the chat widget (20b), and the aggregate
 *    across both models is roughly double what the old comment assumed.
 *
 * 2. THERE IS A TOKENS-PER-DAY CEILING AND IT IS THE BINDING ONE.
 *    Groq's published free-tier table gives 200,000 TPD per model. It appears
 *    in NO response header — only RPD and TPM do — which is exactly why a
 *    header-based measurement missed it. At a realistic ~1,900 tokens for a
 *    typical run that is ~105 agent runs per DAY for the whole deployment,
 *    against a roster of 1,839 students. The 1,000-requests/day ceiling is
 *    unreachable long before that and is therefore not the real limit.
 *
 * NOT YET ENFORCED: nothing here counts tokens. The ceilings below are all
 * expressed in REQUESTS, so a run that is unusually token-heavy is invisible
 * to them and the provider's own 429 is what stops it. Enforcing TPD needs
 * per-model token accounting fed by the `usage` field of each response.
 *
 * The agent is the expensive caller: one run can make up to MAX_ITERATIONS
 * provider calls. Per-user limits below are therefore expressed in *runs*
 * while the global ceiling is expressed in *provider calls*, and the agent
 * route reserves its worst case up front — a limit that only charges for
 * calls already made cannot prevent the overspend it exists to prevent.
 */
import { kvGet, kvSet } from './kv';
import { checkRateLimit } from './rate-limit';

/** Provider requests/day, per model. Measured from response headers. */
export const PROVIDER_DAILY_REQUESTS = 1000;
/** Provider tokens/minute, per model. Measured from response headers. */
export const PROVIDER_MINUTE_TOKENS = 8000;
/** Provider requests/minute, per model. From Groq's published table. */
export const PROVIDER_MINUTE_REQUESTS = 30;
/**
 * Provider tokens/DAY, per model. From Groq's published free-tier table; it
 * is absent from every response header, so it cannot be measured the way the
 * two above were. This is the ceiling the deployment actually hits first.
 */
export const PROVIDER_DAILY_TOKENS = 200_000;

/**
 * Global daily ceiling on provider calls. Deliberately below the measured
 * 1,000 so the refresh cron, local development and a manual smoke test
 * cannot be starved by student traffic — and so that hitting our own ceiling
 * produces a clean 429 instead of an opaque provider 429.
 */
const GLOBAL_DAILY_DEFAULT = 800;

/**
 * Global per-minute ceiling, counted in REQUESTS (one unit per request), not
 * in worst-case provider calls. It is a stampede guard against many students
 * asking at once; the token-per-minute limit is the provider's to enforce and
 * a breach there is transient and self-healing.
 *
 * Counting worst-case calls here instead was measured to be wrong: one agent
 * run reserved 4 units, so a student asking two questions in a row was told
 * "the agent is busy" by our own limiter with the provider completely idle.
 */
const GLOBAL_MINUTE_DEFAULT = 30;

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Per-user chat limits: 1 provider call each, so these are calls too. */
export const CHAT_USER_BURST = 10;
export const CHAT_USER_DAILY = 60;

/**
 * Per-user agent limits, in runs. Worst case 4 provider calls per run.
 *
 * Overridable per deployment: a launch day where forty students each try
 * the agent a dozen times needs more headroom than a quiet week, and the
 * right number depends on which provider key is behind LLM_API_KEY.
 */
export const AGENT_USER_BURST = envInt('AGENT_USER_BURST', 6);
export const AGENT_USER_DAILY = envInt('AGENT_USER_DAILY', 40);

const DAY_SECONDS = 24 * 60 * 60;

export function globalDailyBudget(): number {
  return envInt('LLM_DAILY_BUDGET', GLOBAL_DAILY_DEFAULT);
}

export function globalMinuteBudget(): number {
  return envInt('LLM_MINUTE_BUDGET', GLOBAL_MINUTE_DEFAULT);
}

export interface BudgetVerdict {
  allowed: boolean;
  retryAfter: number;
  /** Which ceiling refused, for the log line. */
  scope?: 'minute' | 'day';
}

const DAY_KEY = 'rl:llm:global:day';

/**
 * Reserves budget before any money is spent.
 *
 * This is the ceiling that survives our own bugs: per-user limits assume we
 * identified the user correctly, and the whole reason this module exists is
 * that we once did not. Signing in is free for anyone with N GitHub
 * accounts, so a global cap is the only thing standing between a bored
 * attacker and the day's entire quota.
 *
 * The DAILY counter is charged the worst case up front — a limit that only
 * charges for calls already made cannot prevent the overspend it exists to
 * prevent — and the unused remainder is handed back by
 * refundProviderCalls() once the run reports how many calls it really made.
 * Reserve-then-refund keeps the guarantee while keeping the accounting
 * honest; charging worst case and never refunding would burn roughly half
 * the free tier on calls nobody made.
 */
export async function reserveProviderCalls(worstCaseCalls: number): Promise<BudgetVerdict> {
  const charge = Math.max(1, Math.floor(worstCaseCalls));

  const minute = await checkRateLimit('rl:llm:global:minute', globalMinuteBudget(), 60, 1);
  if (!minute.allowed) {
    return { allowed: false, retryAfter: minute.retryAfter, scope: 'minute' };
  }

  const day = await checkRateLimit(DAY_KEY, globalDailyBudget(), DAY_SECONDS, charge);
  if (!day.allowed) {
    console.error(`[llm-budget] global daily ceiling reached (${globalDailyBudget()} calls)`);
    return { allowed: false, retryAfter: day.retryAfter, scope: 'day' };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Hands back budget reserved but not spent. Best-effort and non-throwing:
 * losing a refund costs a little quota, whereas throwing here would turn a
 * successful answer into a 502.
 */
export async function refundProviderCalls(unused: number): Promise<void> {
  const amount = Math.floor(unused);
  if (amount <= 0) return;
  try {
    const state = await kvGet<{ count: number; resetAt: number }>(DAY_KEY);
    if (!state || typeof state.count !== 'number') return;
    if (Date.now() >= state.resetAt) return; // window already rolled over
    const ttl = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000) + 5);
    await kvSet(DAY_KEY, { count: Math.max(0, state.count - amount), resetAt: state.resetAt }, ttl);
  } catch {
    // ignore
  }
}
