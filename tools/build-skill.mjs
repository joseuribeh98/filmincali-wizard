// Empaqueta la skill para agentes y la deja descargable en public/skill/.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const NOMBRE = 'permiso-rodaje-cali';
const DIST = join('skill-dist', NOMBRE);

await mkdir(join(DIST, 'scripts'), { recursive: true });
await mkdir(join(DIST, 'references'), { recursive: true });

await build({
  entryPoints: ['src/cli/generar.ts'],
  outfile: join(DIST, 'scripts', 'generar.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: false,
  legalComments: 'none',
  banner: { js: '// Generado desde https://filmincali.joseuribe.dev. No editar a mano.\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: 'warning',
});

// Esquema JSON derivado del mismo modelo que usa la web.
// Se compila junto con zod en un solo archivo temporal para usar la misma instancia.
const temporal = join(tmpdir(), `pufa-schema-${process.pid}.mjs`);
await build({
  stdin: { contents: "export { Solicitud } from './src/lib/pufa/schema.ts'; export { z } from 'zod';", resolveDir: process.cwd(), loader: 'ts' },
  outfile: temporal, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
});
const { Solicitud, z } = await import(pathToFileURL(temporal).href);
const esquema = z.toJSONSchema(Solicitud, { io: 'input', unrepresentable: 'any' });
esquema.title = 'Solicitud de permiso de rodaje en espacio público de Cali';
await writeFile(join(DIST, 'references', 'esquema.json'), JSON.stringify(esquema, null, 2));
await rm(temporal, { force: true });

await cp('tools/skill/SKILL.md', join(DIST, 'SKILL.md'));
await cp('tools/skill/tramite.md', join(DIST, 'references', 'tramite.md'));
await cp('src/lib/pufa/ejemplo.json', join(DIST, 'references', 'ejemplo.json'));
await cp('public/plantillas', join(DIST, 'plantillas'), { recursive: true });

// .zip con la carpeta de la skill en la raíz.
const zip = new JSZip();
async function agregar(dir, prefijo) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) await agregar(ruta, `${prefijo}${e.name}/`);
    else zip.file(`${prefijo}${e.name}`, await readFile(ruta));
  }
}
await agregar(DIST, `${NOMBRE}/`);
await mkdir('public/skill', { recursive: true });
await writeFile(join('public', 'skill', `${NOMBRE}.zip`), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
await cp('tools/skill/SKILL.md', join('public', 'skill', 'SKILL.md'));
console.log(`skill lista en public/skill/${NOMBRE}.zip`);
