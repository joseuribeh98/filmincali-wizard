// Bundles the agent skill and publishes it as a download in public/skill/.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const NAME = 'permiso-rodaje-cali';
const DIST = join('skill-dist', NAME);

await rm(DIST, { recursive: true, force: true }).catch(() => {});
await mkdir(join(DIST, 'scripts'), { recursive: true });
await mkdir(join(DIST, 'references'), { recursive: true });

await build({
  entryPoints: ['src/cli/generate.ts'],
  outfile: join(DIST, 'scripts', 'generate.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: false,
  legalComments: 'none',
  banner: { js: '// Built from https://github.com/joseuribeh98/filmincali-wizard. Do not edit by hand.\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: 'warning',
});

// JSON Schema derived from the same model the website uses.
// Bundled together with zod in one temporary file so both share the same instance.
const tempFile = join(tmpdir(), `permit-schema-${process.pid}.mjs`);
await build({
  stdin: { contents: "export { PermitRequest } from './src/lib/permit/schema.ts'; export { z } from 'zod';", resolveDir: process.cwd(), loader: 'ts' },
  outfile: tempFile, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
});
const { PermitRequest, z } = await import(pathToFileURL(tempFile).href);
const schema = z.toJSONSchema(PermitRequest, { io: 'input', unrepresentable: 'any' });
schema.title = 'Solicitud de permiso de rodaje en espacio público de Cali';
await writeFile(join(DIST, 'references', 'schema.json'), JSON.stringify(schema, null, 2));
await rm(tempFile, { force: true });

await cp('tools/skill/SKILL.md', join(DIST, 'SKILL.md'));
await cp('tools/skill/process.md', join(DIST, 'references', 'process.md'));
await cp('src/lib/permit/example.json', join(DIST, 'references', 'example.json'));
await cp('public/templates', join(DIST, 'templates'), { recursive: true });

// .zip with the skill folder at the root.
const zip = new JSZip();
async function addDir(dir, prefix) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) await addDir(path, `${prefix}${e.name}/`);
    else zip.file(`${prefix}${e.name}`, await readFile(path));
  }
}
await addDir(DIST, `${NAME}/`);
await mkdir('public/skill', { recursive: true });
await writeFile(join('public', 'skill', `${NAME}.zip`), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
await cp('tools/skill/SKILL.md', join('public', 'skill', 'SKILL.md'));
console.log(`skill ready at public/skill/${NAME}.zip`);
