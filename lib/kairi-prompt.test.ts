/**
 * Identity. "What model are you?" is one of the first things anyone types
 * into a new assistant; without these rules the answer is whatever the
 * current provider's weights happen to say, and it changes silently the
 * next time LLM_AGENT_MODEL changes.
 */
import { describe, it, expect } from 'vitest';
import { KAIRI_IDENTITY_RULES } from './kairi-prompt';
import { KAIRI_MODEL_ID, KAIRI_NAME, KAIRI_SELF_NAME, KAIRI_VENDOR } from './kairi';

const joined = KAIRI_IDENTITY_RULES.join('\n');

describe('identity rules', () => {
  it('names the product, the vendor and the model id', () => {
    expect(joined).toContain(KAIRI_SELF_NAME);
    expect(joined).toContain(KAIRI_VENDOR);
    expect(joined).toContain(KAIRI_MODEL_ID);
    expect(joined).toContain(KAIRI_NAME);
  });

  it('covers the ways students actually ask', () => {
    for (const phrase of ['what model', 'who made', 'version you are', 'running on']) {
      expect(joined.toLowerCase()).toContain(phrase);
    }
  });

  it('declines to discuss the infrastructure underneath', () => {
    expect(joined.toLowerCase()).toMatch(/provider, weights, parameter count, training data or hosting/);
  });

  it('forbids adopting another company’s model name or persona', () => {
    expect(joined.toLowerCase()).toContain('never claim to be a model made by another company');
  });

  it('states the identity without asserting a false provenance', () => {
    // Branding is a product name; "trained by Meard Labs" would be a claim
    // about provenance that this deployment cannot support.
    expect(joined.toLowerCase()).not.toMatch(/\btrained (by|on)\b/);
  });
});

describe('both system prompts carry the identity', () => {
  it('is present in the agent prompt', async () => {
    process.env.LLM_API_KEY = 'test-key-not-real';
    const { runAgent } = await import('./agent-loop');
    let system = '';
    const fetchImpl = (async (_i: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      system = body.messages?.[0]?.content ?? '';
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hi' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    await runAgent(
      { messages: [{ role: 'user', content: 'what model are you?' }], username: 'octocat', requestId: 'r1' },
      { tools: [], fetchImpl, contextBlock: '<retrieved_data>x</retrieved_data>' },
    );
    expect(system).toContain(KAIRI_SELF_NAME);
    expect(system).toContain(KAIRI_VENDOR);
  });

  it('is present in the chat prompt', async () => {
    const { buildSystemPrompt } = await import('./assistant');
    const prompt = buildSystemPrompt('<retrieved_data>x</retrieved_data>');
    expect(prompt).toContain(KAIRI_SELF_NAME);
    expect(prompt).toContain(KAIRI_MODEL_ID);
  });
});
