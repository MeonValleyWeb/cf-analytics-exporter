import { readFile, writeFile } from 'node:fs/promises';
import { verifyZone } from './lib/verification.js';

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--zone', '--baseline', '--output'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) {
      console.error('Usage: npm run verify:cloudflare -- [--zone ZONE_ID] [--baseline FILE.json] [--output REPORT.json]');
      process.exitCode = 2;
      return;
    }
    options[args[i].slice(2)] = args[i+1];
  }
  const env = Object.fromEntries(['CF_API_TOKEN','EXPORT_API_KEY','CF_ALLOWED_ZONE_IDS'].map(key => [key, process.env[key]]));
  if (Object.values(env).some(value => !value)) {
    console.error('Live verification is pending: configure CF_API_TOKEN, EXPORT_API_KEY and CF_ALLOWED_ZONE_IDS in the ignored .dev.vars file or environment. No Cloudflare request was made.');
    process.exitCode = 2;
    return;
  }
  const zoneId = options.zone ?? env.CF_ALLOWED_ZONE_IDS.split(',')[0].trim().toLowerCase();
  let baseline;
  if (options.baseline) {
    try { baseline = JSON.parse(await readFile(options.baseline, 'utf8')); }
    catch { throw new Error('Could not read a valid JSON baseline file.'); }
  }
  const report = await verifyZone(env, { zoneId, baseline });
  const output = JSON.stringify(report, null, 2) + '\n';
  if (options.output) await writeFile(options.output, output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
  process.exitCode = report.status === 'verified' ? 0 : report.status === 'awaiting-dashboard-comparison' ? 2 : 1;
}

main().catch(error => {
  // Never print request headers, raw upstream payloads, or environment variables.
  const safe = ['Baseline must match', 'Baseline needs', 'Window totals', 'Could not read'].some(prefix => error.message?.startsWith(prefix));
  console.error(safe ? error.message : 'Verification could not complete. Check configuration and report destination.');
  process.exitCode = 1;
});
