import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('dist/server/wrangler.json')) throw new Error('Build the app first to generate the local D1 configuration.');
mkdirSync('.wrangler', { recursive: true });
const ledgerPath = '.wrangler/live-migrations.json';
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
for (const file of readdirSync('drizzle').filter((file) => file.endsWith('.sql')).sort()) {
  const digest = createHash('sha256').update(readFileSync(`drizzle/${file}`)).digest('hex');
  if (ledger[file]) { if (ledger[file] !== digest) throw new Error(`Applied local migration changed: ${file}`); continue; }
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--file', `drizzle/${file}`], { stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false' } });
  if (result.status !== 0) process.exit(result.status ?? 1);
  ledger[file] = digest; writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}
console.log('Local D1 migrations are current. No hosted database was accessed.');
