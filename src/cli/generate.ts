/**
 * Skill CLI: validates a solicitud.json and fills the forms.
 *
 *   node scripts/generate.mjs solicitud.json [--out folder] [--check] [--today YYYY-MM-DD]
 *
 * --check  only prints forms, deadlines, fee estimate, issues and attachments as JSON (writes nothing)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachments, deadlines, estimateFee, requiredForms, review, shootRange } from '../lib/permit/derive';
import { buildPackage, validate } from '../lib/permit/generate';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(here, '..', 'templates');

function parseArgs(argv: string[]) {
  const out: { input?: string; out: string; check: boolean; today?: string } = { out: 'permiso-rodaje', check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--check') out.check = true;
    else if (a === '--today') out.today = argv[++i];
    else if (!a.startsWith('--')) out.input = a;
  }
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.input) {
    console.error('Usage: node scripts/generate.mjs solicitud.json [--out folder] [--check] [--today YYYY-MM-DD]');
    process.exit(2);
  }
  const raw = JSON.parse(await readFile(o.input, 'utf8'));
  const parsed = validate(raw);
  if (!parsed.success) {
    console.log(JSON.stringify({ ok: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, null, 2));
    process.exit(1);
  }
  const s = parsed.data;
  const r = shootRange(s);
  const summary = {
    ok: true,
    forms: requiredForms(s),
    deadlines: r ? deadlines(r.start, o.today) : null,
    estimatedFee: estimateFee(s),
    issues: review(s),
    attachments: attachments(s),
  };
  if (o.check) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const pkg = await buildPackage(s, (c) => readFile(join(TEMPLATES, `${c}.docx`)), o.today);
  await mkdir(o.out, { recursive: true });
  for (const f of pkg.files) await writeFile(join(o.out, f.name), f.bytes);
  await writeFile(join(o.out, pkg.zipName), pkg.zip);
  console.log(JSON.stringify({ ...summary, out: resolve(o.out), files: [...pkg.files.map((f) => f.name), pkg.zipName] }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
