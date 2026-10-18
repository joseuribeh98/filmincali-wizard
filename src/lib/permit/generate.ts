/** Fills the official forms and builds the .zip package. Runs in the browser and in Node. */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { PermitRequest, type PermitRequestInput } from './schema';
import { fromLegacy } from './legacy';
import { BLANK, MAPPINGS, TO_BE_DEFINED } from './mapping';
import { attachments, deadlines, estimateFee, FORMS, formatCop, requiredForms, review, shootRange, type FormCode } from './derive';
import { longDate } from './calendar';

export type LoadTemplate = (code: FormCode) => Promise<ArrayBuffer | Uint8Array>;

/** Validates a request, accepting files saved with the first version's Spanish keys. */
export function validate(input: unknown) {
  return PermitRequest.safeParse(fromLegacy(input));
}

/** Internal markers resolved at the end, in the XML of each run. */
const PENDING = '';
const LINE = '';
const CHECKBOXES = new Set(['☒', '☐']);
const underscores = (n: number) => '_'.repeat(Math.max(0, n));

/**
 * Shapes each value according to its tag. `{field|n}` was a line of n underscores in the
 * original form: the value is underlined and the line continues with underscores up to
 * roughly its original length, as on paper. Empty values, bracketed text and
 * "Por definir" are marked as pending so they get highlighted.
 */
function formatValue(v: unknown, length: number): unknown {
  if (typeof v !== 'string' && typeof v !== 'number') return v;
  const t = String(v);
  if (CHECKBOXES.has(t)) return t;
  if (t === BLANK) return length ? LINE + underscores(length) : '';
  if (!t.trim()) return PENDING + LINE + underscores(length || 12);
  const pending = t === TO_BE_DEFINED || /^\[[\s\S]*\]$/.test(t.trim());
  // Leave some margin so the value and its line do not wrap to a second line.
  const rest = length && !t.includes('\n') ? Math.floor((length - t.length * 1.1) * 0.9) - 1 : 0;
  return (pending ? PENDING : '') + t + (rest > 0 ? LINE + underscores(rest) : '');
}

const lengthOf = (tag: string) => Number(tag.split('|')[1] ?? 0) || 0;

// Order of <w:rPr> children in WordprocessingML: the highlight goes before any of these.
const AFTER_HIGHLIGHT = ['u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange'];

function withHighlight(rpr: string): string {
  const inner = rpr.replace(/<w:highlight\b[^>]*\/>/g, '');
  const next = AFTER_HIGHLIGHT.map((n) => inner.search(new RegExp(`<w:${n}[\\s/>]`))).filter((i) => i >= 0);
  const pos = next.length ? Math.min(...next) : inner.length;
  return inner.slice(0, pos) + '<w:highlight w:val="yellow"/>' + inner.slice(pos);
}

const withoutUnderline = (rpr: string) => rpr.replace(/<w:u\b[^>]*\/>/g, '');

function processRun(run: string): string {
  const open = run.match(/^<w:r(?:\s[^>]*)?>/)![0];
  const rpr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
  const pending = run.includes(PENDING);
  const texts = run.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? [];
  const clean = (x: string) => x.split(PENDING).join('');
  const build = (props: string, body: string) => `${open}${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
  const mark = (props: string) => (pending ? withHighlight(props) : props);

  if (!run.includes(LINE) || texts.length !== 1) {
    const body = clean(run.replace(open, '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '').replace(/<\/w:r>$/, '')).split(LINE).join('');
    return build(mark(rpr), body);
  }
  const content = texts[0].replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '');
  const [value, line] = clean(content).split(LINE);
  const t = (x: string) => `<w:t xml:space="preserve">${x}</w:t>`;
  return (value ? build(mark(rpr), t(value)) : '') + (line ? build(mark(withoutUnderline(rpr)), t(line)) : '');
}

/** Resolves the markers: splits value and line, and highlights pending runs in yellow. */
export function markFields(xml: string): string {
  if (!xml.includes(PENDING) && !xml.includes(LINE)) return xml;
  return xml.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) =>
    run.includes(PENDING) || run.includes(LINE) ? processRun(run) : run,
  );
}

export function render(template: ArrayBuffer | Uint8Array, data: Record<string, unknown>): Uint8Array {
  const doc = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag: string) => {
      const [name] = tag.split('|');
      const length = lengthOf(tag);
      return {
        get(scope: unknown) {
          if (name === '.') return scope;
          const v = scope && typeof scope === 'object' ? (scope as Record<string, unknown>)[name] : undefined;
          return v === undefined || v === null ? undefined : formatValue(v, length);
        },
      };
    },
    // A tag with no data at any level is also pending; loops and conditions are not.
    nullGetter: (part: { module?: string; value?: string }) => (part.module ? '' : (formatValue('', lengthOf(part.value ?? '')) as string)),
  });
  doc.render(data);
  const zip = doc.getZip();
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    zip.file(name, markFields(zip.file(name)!.asText()));
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

/** The LEEME.txt that goes in the package. It is for the applicant, so it is in Spanish. */
export function readme(s: PermitRequest, today?: string): string {
  const r = shootRange(s);
  const d = r ? deadlines(r.start, today) : null;
  const forms = requiredForms(s);
  const L: string[] = [];
  L.push(`PERMISO DE RODAJE EN ESPACIO PÚBLICO DE CALI: ${s.project.name || 'sin nombre'}`);
  L.push('Preparado con filmincali.joseuribe.dev, una herramienta independiente.');
  L.push('No es un sitio de la Alcaldía ni de la Comisión Fílmica. Revisa todo antes de radicar.');
  L.push('');
  if (d) {
    L.push('FECHAS');
    L.push(`- Primer día en calle: ${longDate(d.firstDay)}`);
    L.push(`- Puedes radicar desde: ${longDate(d.opensOn)} (máximo 3 meses antes)`);
    L.push(`- Último día para radicar: ${longDate(d.deadline)} (mínimo 20 días hábiles antes)`);
    if (d.status === 'late') L.push('- ATENCIÓN: ya pasó el plazo mínimo. Escribe a la Comisión Fílmica antes de radicar.');
    L.push('');
  }
  const fee = estimateFee(s);
  if (fee) {
    L.push('VALOR ESTIMADO DE LA RETRIBUCIÓN');
    if (fee.exempt) L.push('- Exento de pago por ser un proyecto académico, comunitario o con fondos públicos del Distrito (debe verificarse).');
    else {
      L.push(`- Aproximadamente ${formatCop(fee.amount)}`);
      L.push(`- Fórmula: (área × días × escala × UVT) / 12 = (${fee.squareMeterDays} m²·día × ${fee.scale.weight} × ${formatCop(fee.uvt)}) / 12`);
      L.push(`- Escala usada: ${fee.scale.label} (la de mayor peso entre tus locaciones). UVT ${fee.uvtYear}${fee.uvtAssumed ? ', la última publicada' : ''}.`);
    }
    L.push('- Es una estimación. El valor oficial lo notifica la Subdirección de Espacio Público.');
    L.push('');
  }
  L.push('FORMATOS INCLUIDOS');
  for (const c of forms) L.push(`- ${FORMS[c].file}: ${FORMS[c].title}`);
  L.push('');
  L.push('LO RESALTADO EN AMARILLO');
  L.push('- En los formatos, lo resaltado en amarillo está pendiente: datos que faltan, fotos o planos por pegar y la firma. Complétalo y quita el resaltado antes de radicar.');
  L.push('');
  L.push('ANTES DE RADICAR, ADJUNTA O PEGA EN LOS FORMATOS');
  for (const a of attachments(s)) L.push(`[ ] ${a.text}${a.form ? ` (${a.form})` : ''}${a.required ? '' : ' (opcional)'}`);
  L.push('');
  L.push('PASOS');
  L.push('1. Abre cada formato, pega las fotos y planos donde lo indica y firma el formulario de solicitud.');
  L.push('2. Radica todo en la plataforma PQRS de la Alcaldía de Cali, dirigido a la Subdirección de Espacio Público y Ordenamiento Urbanístico (SEPOU):');
  L.push('   https://archivo.cali.gov.co/participacion/publicaciones/161718/radicacion-de-peticiones-quejas-y-reclamos/');
  L.push('3. Envía el número de radicado a filmincali@cali.gov.co y aprovechamientoep@cali.gov.co.');
  L.push('   Si falta algún documento te devuelven la solicitud y tienes 30 días para completarla. Con todo completo, la SEPOU tiene 15 días hábiles para revisarla.');
  L.push('4. Si es viable, te notifican el valor a pagar y los requisitos de la póliza. Tienes 2 días hábiles para pagar.');
  L.push('5. Envía comprobante de pago y póliza a aprovechamientoep@cali.gov.co.');
  L.push('6. Recibes el acto administrativo de autorización. Mantén visible el aviso oficial durante el rodaje.');
  L.push('');
  L.push('Calculadora del valor: https://www.cali.gov.co/planeacion/publicaciones/183378/tramite-de-aeep/');
  L.push('Proceso oficial: https://www.filmincali.com.co/permiso/');
  L.push('');
  L.push('solicitud.json guarda tus respuestas. Cárgalo en el sitio o pásaselo a un agente para editar y regenerar.');
  return L.join('\r\n');
}

export type Package = {
  zip: Uint8Array;
  zipName: string;
  files: { code: FormCode; name: string; bytes: Uint8Array }[];
  issues: ReturnType<typeof review>;
};

export async function buildPackage(input: PermitRequestInput | PermitRequest | unknown, loadTemplate: LoadTemplate, today?: string): Promise<Package> {
  const s = PermitRequest.parse(fromLegacy(input));
  const files: Package['files'] = [];
  for (const code of requiredForms(s)) {
    const bytes = render(await loadTemplate(code), MAPPINGS[code](s));
    files.push({ code, name: FORMS[code].file, bytes });
  }
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.bytes);
  zip.file('LEEME.txt', readme(s, today));
  zip.file('solicitud.json', JSON.stringify(s, null, 2));
  const slug = (s.project.name || 'rodaje')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rodaje';
  return {
    zip: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    zipName: `permiso-rodaje-${slug}.zip`,
    files,
    issues: review(s),
  };
}
