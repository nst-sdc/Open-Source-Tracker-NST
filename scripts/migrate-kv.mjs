#!/usr/bin/env node
/**
 * Copy every key from one Upstash-REST-compatible store to another,
 * preserving TTLs. Used once to move from hosted Upstash to the in-cluster
 * Valkey behind kv-rest (k8s/08-kv-rest.yaml); kept because it is also the
 * way back, and the way to seed a staging copy.
 *
 *   SRC_URL=https://xxx.upstash.io SRC_TOKEN=... \
 *   DST_URL=http://kv-rest.opensource-tracker.svc.cluster.local DST_TOKEN=... \
 *   node scripts/migrate-kv.mjs            # add DRY_RUN=1 to only list
 *
 * Plain Node 20 with fetch, no dependencies, so it runs anywhere — including
 * as the Job in deploy/jobs/migrate-kv.yaml inside the cluster, which is
 * where it has to run to reach the kv-rest Service.
 *
 * Every value this app stores is a string (JSON), set with SET [EX]. The
 * script refuses non-string types rather than guessing, and prints them.
 */
const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`missing ${n}`);
    process.exit(2);
  }
  return v.replace(/\/$/, '');
};
const SRC = { url: need('SRC_URL'), token: need('SRC_TOKEN') };
const DST = { url: need('DST_URL'), token: need('DST_TOKEN') };
const DRY = process.env.DRY_RUN === '1';

async function cmd(store, command) {
  const res = await fetch(store.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`${command[0]} ${command[1] ?? ''} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`${command[0]} ${command[1] ?? ''} → ${data.error}`);
  return data.result;
}

// Sanity: both ends answer.
console.log(`source ${SRC.url} → ${await cmd(SRC, ['PING'])}`);
console.log(`target ${DST.url} → ${await cmd(DST, ['PING'])}${DRY ? '   (dry run)' : ''}`);

let cursor = '0';
const keys = [];
do {
  const [next, batch] = await cmd(SRC, ['SCAN', cursor, 'COUNT', '500']);
  cursor = String(next);
  keys.push(...batch);
} while (cursor !== '0');
console.log(`${keys.length} keys to copy`);

let copied = 0;
let skipped = 0;
let bytes = 0;
const skippedKeys = [];
for (const key of keys) {
  const type = await cmd(SRC, ['TYPE', key]);
  if (type !== 'string') {
    skipped++;
    skippedKeys.push(`${key} (${type})`);
    continue;
  }
  const [value, pttl] = await Promise.all([cmd(SRC, ['GET', key]), cmd(SRC, ['PTTL', key])]);
  if (value === null) {
    skipped++;
    continue; // expired between SCAN and GET
  }
  bytes += value.length;
  if (!DRY) {
    const command = ['SET', key, value];
    if (typeof pttl === 'number' && pttl > 0) command.push('PX', String(pttl));
    await cmd(DST, command);
  }
  copied++;
  if (copied % 100 === 0) console.log(`  ${copied}/${keys.length}…`);
}

console.log(`\n${DRY ? 'would copy' : 'copied'} ${copied} keys (${(bytes / 1024 / 1024).toFixed(1)} MB of values); skipped ${skipped}`);
if (skippedKeys.length) console.log('non-string keys (not copied):\n  ' + skippedKeys.join('\n  '));

if (!DRY) {
  // Verify the keys the app cannot live without.
  for (const key of ['students_list', 'flagged_prs', 'join_requests', 'achievers_list', 'events_list', 'summary_cache:all']) {
    const [a, b] = await Promise.all([cmd(SRC, ['STRLEN', key]), cmd(DST, ['STRLEN', key])]);
    console.log(`  verify ${key.padEnd(18)} source ${String(a).padStart(8)} B   target ${String(b).padStart(8)} B   ${a === b ? 'ok' : a === 0 ? '(absent at source)' : 'MISMATCH'}`);
  }
}
