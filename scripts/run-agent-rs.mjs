/**
 * Runs the agent-rs sidecar with the same .env.local the Next.js app uses,
 * so LLM_API_KEY / AGENT_SHARED_SECRET / model config stay in one place.
 * Usage: npm run agent   (needs a Rust toolchain: https://rustup.rs)
 */
import { spawn } from 'child_process';
import { config } from 'dotenv';

config({ path: '.env.local' });

const child = spawn(
  'cargo',
  ['run', '--release', '--manifest-path', 'agent-rs/Cargo.toml'],
  {
    stdio: 'inherit',
    env: { ...process.env, REPO_ROOT: process.cwd() },
  },
);

child.on('error', (err) => {
  console.error('[agent-rs] failed to start cargo (is Rust installed?):', err.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
