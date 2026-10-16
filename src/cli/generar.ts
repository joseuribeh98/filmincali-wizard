/**
 * CLI de la skill: valida una solicitud.json y genera los formatos.
 *
 *   node scripts/generar.mjs solicitud.json [--salida carpeta] [--revisar] [--hoy AAAA-MM-DD]
 *
 * --revisar  solo imprime avisos, plazos, formatos y anexos en JSON (no escribe archivos)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Solicitud } from '../lib/pufa/schema';
import { anexos, estimarRetribucion, formatosRequeridos, plazos, rangoRodaje, revisar } from '../lib/pufa/derivar';
import { generarPaquete } from '../lib/pufa/generar';

const aqui = dirname(fileURLToPath(import.meta.url));
const PLANTILLAS = resolve(aqui, '..', 'plantillas');

function args(argv: string[]) {
  const out: { entrada?: string; salida: string; revisar: boolean; hoy?: string } = { salida: 'permiso-rodaje', revisar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--salida') out.salida = argv[++i];
    else if (a === '--revisar') out.revisar = true;
    else if (a === '--hoy') out.hoy = argv[++i];
    else if (!a.startsWith('--')) out.entrada = a;
  }
  return out;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.entrada) {
    console.error('Uso: node scripts/generar.mjs solicitud.json [--salida carpeta] [--revisar] [--hoy AAAA-MM-DD]');
    process.exit(2);
  }
  const crudo = JSON.parse(await readFile(o.entrada, 'utf8'));
  const parsed = Solicitud.safeParse(crudo);
  if (!parsed.success) {
    console.log(JSON.stringify({ ok: false, errores: parsed.error.issues.map((i) => ({ ruta: i.path.join('.'), mensaje: i.message })) }, null, 2));
    process.exit(1);
  }
  const s = parsed.data;
  const r = rangoRodaje(s);
  const resumen = {
    ok: true,
    formatos: formatosRequeridos(s),
    plazos: r ? plazos(r.inicio, o.hoy) : null,
    retribucionEstimada: estimarRetribucion(s),
    avisos: revisar(s),
    anexos: anexos(s),
  };
  if (o.revisar) {
    console.log(JSON.stringify(resumen, null, 2));
    return;
  }
  const res = await generarPaquete(s, (c) => readFile(join(PLANTILLAS, `${c}.docx`)), o.hoy);
  await mkdir(o.salida, { recursive: true });
  for (const a of res.archivos) await writeFile(join(o.salida, a.nombre), a.bytes);
  await writeFile(join(o.salida, res.nombreZip), res.zip);
  console.log(JSON.stringify({ ...resumen, salida: resolve(o.salida), archivos: [...res.archivos.map((a) => a.nombre), res.nombreZip] }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
