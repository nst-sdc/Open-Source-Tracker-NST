/**
 * lib/kairi.ts
 *
 * Everything about the agent's public identity in one place. The name is
 * expected to change, so Nav, the page, the widget, metadata and the OAuth
 * return-path allowlist all read it from here — renaming is an edit to this
 * file plus a folder rename, not a hunt through the app.
 */

/** Product name, as students see it. */
export const KAIRI_NAME = 'Meard Kairi';
/** Short form, for the nav tab where horizontal space is tight. */
export const KAIRI_SHORT_NAME = 'Kairi';
/** URL. Changing this also means renaming app/kairi/ and updating
 *  RETURN_ALLOWLIST in lib/oauth-state.ts. */
export const KAIRI_PATH = '/kairi';

/**
 * The model identity reported to students and in the API response.
 *
 * This is a product name for the assistant as a whole, not a claim about
 * which weights are running: the underlying provider and model stay in
 * server-side config (LLM_BASE_URL / LLM_AGENT_MODEL) and in the audit log,
 * so debugging a bad answer is still possible.
 */
export const KAIRI_MODEL_ID = 'meardlabs/kairi-v1';

/** Who students should understand the assistant to be made by. */
export const KAIRI_VENDOR = 'Meard Labs';
/** Released version, as students see it. */
export const KAIRI_VERSION = 'v1';
/** How the assistant names itself when asked. */
export const KAIRI_SELF_NAME = `Kairi ${KAIRI_VERSION}`;


export const KAIRI_TAGLINE = 'Your open-source guide. Ask anything — no question is too basic.';

/**
 * Pre-written openers. A blank text box is the single biggest failure mode
 * for a student who has never contributed to open source: they do not yet
 * know what is askable. Each card sends a complete message, so nobody has to
 * phrase a question to get started.
 */
export const KAIRI_DOORS: { title: string; blurb: string; message: string }[] = [
  {
    title: "I don't know what any of this means",
    blurb: 'Start from zero — what open source is, and why this site exists.',
    message:
      "I'm completely new to open source. I don't know what a pull request is, what a repository is, or what any of this means. Explain it to me from the very beginning, in plain language, and tell me what this leaderboard site is for.",
  },
  {
    title: 'Find me something small I could actually fix',
    blurb: 'Real beginner-friendly issues, not a wall of intimidating ones.',
    message:
      "I want to make my first open-source contribution but I don't know where to look. Find me a few genuinely beginner-friendly issues I could realistically work on, and explain what I'd actually have to do for one of them.",
  },
  {
    title: "I'm stuck on something",
    blurb: 'A PR that got flagged, a command that failed, a step that broke.',
    message:
      "I'm stuck. Ask me what I'm trying to do and where it went wrong, then walk me through it one step at a time. Assume I might not know the basics.",
  },
];

/** Quieter follow-ups, in the words a beginner would actually use. */
export const KAIRI_CHIPS: string[] = [
  'What is a pull request?',
  'How do I get on this leaderboard?',
  'Does the work I already did count?',
  'What does it mean when a PR is flagged?',
  'How do I find a project worth contributing to?',
];

/**
 * Said plainly, on the page, before a student asks it to do something it
 * cannot. The OAuth scope is `read:user`, so writes are not merely
 * disallowed by prompt — they are impossible.
 */
export const KAIRI_LIMITS: string[] = [
  'I can look things up and explain them.',
  "I can't write code for you or open a pull request for you.",
  "I can't change your score, approve anything, or un-flag a PR.",
  'I can be wrong — check anything important against the docs I link to.',
];
