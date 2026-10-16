/** Genera los formatos llenos y el paquete .zip. Funciona en el navegador y en Node. */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { Solicitud, type SolicitudInput } from './schema';
import { MAPEOS, POR_DEFINIR, VACIO } from './mapear';
import { anexos, estimarRetribucion, FORMATOS, formatosRequeridos, pesos, plazos, rangoRodaje, revisar, type CodigoFormato } from './derivar';
import { fechaLarga } from './calendario';

export type CargarPlantilla = (codigo: CodigoFormato) => Promise<ArrayBuffer | Uint8Array>;

export function validar(input: unknown) {
  return Solicitud.safeParse(input);
}

/** Marcas internas que se resuelven al final, en el XML de cada run. */
const PENDIENTE = '\ue000';
const LINEA = '\ue001';
const CASILLAS = new Set(['☒', '☐']);
const rayas = (n: number) => '_'.repeat(Math.max(0, n));

/**
 * Da forma a cada valor según su tag. `{campo|n}` era una línea de n guiones en el
 * formato original: el valor queda subrayado y la línea sigue con guiones hasta
 * cerca de su largo, como en el papel. Lo vacío, los textos entre corchetes y
 * "Por definir" se marcan como pendientes para resaltarlos.
 */
function formatear(v: unknown, largo: number): unknown {
  if (typeof v !== 'string' && typeof v !== 'number') return v;
  const t = String(v);
  if (CASILLAS.has(t)) return t;
  if (t === VACIO) return largo ? LINEA + rayas(largo) : '';
  if (!t.trim()) return PENDIENTE + LINEA + rayas(largo || 12);
  const pendiente = t === POR_DEFINIR || /^\[[\s\S]*\]$/.test(t.trim());
  // Se deja un margen para que el valor y la línea no pasen a un segundo renglón.
  const resto = largo && !t.includes('\n') ? Math.floor((largo - t.length * 1.1) * 0.9) - 1 : 0;
  return (pendiente ? PENDIENTE : '') + t + (resto > 0 ? LINEA + rayas(resto) : '');
}

const largoDe = (tag: string) => Number(tag.split('|')[1] ?? 0) || 0;

// Orden de los hijos de <w:rPr> en WordprocessingML: el resaltado va antes de estos.
const DESPUES_DE_RESALTADO = ['u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange'];

function conResaltado(rpr: string): string {
  const dentro = rpr.replace(/<w:highlight\b[^>]*\/>/g, '');
  const sig = DESPUES_DE_RESALTADO.map((n) => dentro.search(new RegExp(`<w:${n}[\\s/>]`))).filter((i) => i >= 0);
  const pos = sig.length ? Math.min(...sig) : dentro.length;
  return dentro.slice(0, pos) + '<w:highlight w:val="yellow"/>' + dentro.slice(pos);
}

const sinSubrayado = (rpr: string) => rpr.replace(/<w:u\b[^>]*\/>/g, '');

function procesarRun(run: string): string {
  const apertura = run.match(/^<w:r(?:\s[^>]*)?>/)![0];
  const rpr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
  const pendiente = run.includes(PENDIENTE);
  const textos = run.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? [];
  const limpiar = (x: string) => x.split(PENDIENTE).join('');
  const armar = (props: string, cuerpo: string) => `${apertura}${props ? `<w:rPr>${props}</w:rPr>` : ''}${cuerpo}</w:r>`;
  const marcar = (props: string) => (pendiente ? conResaltado(props) : props);

  if (!run.includes(LINEA) || textos.length !== 1) {
    const cuerpo = limpiar(run.replace(apertura, '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '').replace(/<\/w:r>$/, '')).split(LINEA).join('');
    return armar(marcar(rpr), cuerpo);
  }
  const contenido = textos[0].replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '');
  const [valor, linea] = limpiar(contenido).split(LINEA);
  const t = (x: string) => `<w:t xml:space="preserve">${x}</w:t>`;
  return (valor ? armar(marcar(rpr), t(valor)) : '') + (linea ? armar(marcar(sinSubrayado(rpr)), t(linea)) : '');
}

/** Resuelve las marcas: separa valor y línea, y resalta en amarillo lo pendiente. */
export function marcarCampos(xml: string): string {
  if (!xml.includes(PENDIENTE) && !xml.includes(LINEA)) return xml;
  return xml.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) =>
    run.includes(PENDIENTE) || run.includes(LINEA) ? procesarRun(run) : run,
  );
}

export function renderizar(plantilla: ArrayBuffer | Uint8Array, datos: Record<string, unknown>): Uint8Array {
  const doc = new Docxtemplater(new PizZip(plantilla), {
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag: string) => {
      const [nombre] = tag.split('|');
      const largo = largoDe(tag);
      return {
        get(scope: unknown) {
          if (nombre === '.') return scope;
          const v = scope && typeof scope === 'object' ? (scope as Record<string, unknown>)[nombre] : undefined;
          return v === undefined || v === null ? undefined : formatear(v, largo);
        },
      };
    },
    // Un tag sin dato en ningún nivel también queda pendiente; los bucles y condiciones no.
    nullGetter: (part: { module?: string; value?: string }) => (part.module ? '' : (formatear('', largoDe(part.value ?? '')) as string)),
  });
  doc.render(datos);
  const zip = doc.getZip();
  for (const nombre of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    zip.file(nombre, marcarCampos(zip.file(nombre)!.asText()));
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

export function instrucciones(s: Solicitud, hoy?: string): string {
  const r = rangoRodaje(s);
  const p = r ? plazos(r.inicio, hoy) : null;
  const req = formatosRequeridos(s);
  const L: string[] = [];
  L.push(`PERMISO DE RODAJE EN ESPACIO PÚBLICO DE CALI: ${s.proyecto.nombre || 'sin nombre'}`);
  L.push('Preparado con filmincali.joseuribe.dev, una herramienta independiente.');
  L.push('No es un sitio de la Alcaldía ni de la Comisión Fílmica. Revisa todo antes de radicar.');
  L.push('');
  if (p) {
    L.push('FECHAS');
    L.push(`- Primer día en calle: ${fechaLarga(p.primerDia)}`);
    L.push(`- Puedes radicar desde: ${fechaLarga(p.apertura)} (máximo 3 meses antes)`);
    L.push(`- Último día para radicar: ${fechaLarga(p.limite)} (mínimo 20 días hábiles antes)`);
    if (p.estado === 'tarde') L.push('- ATENCIÓN: ya pasó el plazo mínimo. Escribe a la Comisión Fílmica antes de radicar.');
    L.push('');
  }
  const est = estimarRetribucion(s);
  if (est) {
    L.push('VALOR ESTIMADO DE LA RETRIBUCIÓN');
    if (est.exento) L.push('- Exento de pago por ser un proyecto académico, comunitario o con fondos públicos del Distrito (debe verificarse).');
    else {
      L.push(`- Aproximadamente ${pesos(est.valor)}`);
      L.push(`- Fórmula: (área × días × escala × UVT) / 12 = (${est.metrosDia} m²·día × ${est.escala.peso} × ${pesos(est.uvt)}) / 12`);
      L.push(`- Escala usada: ${est.escala.nombre} (la de mayor peso entre tus locaciones). UVT ${est.anioUvt}${est.uvtSupuesta ? ', la última publicada' : ''}.`);
    }
    L.push('- Es una estimación. El valor oficial lo notifica la Subdirección de Espacio Público.');
    L.push('');
  }
  L.push('FORMATOS INCLUIDOS');
  for (const c of req) L.push(`- ${FORMATOS[c].archivo}: ${FORMATOS[c].titulo}`);
  L.push('');
  L.push('LO RESALTADO EN AMARILLO');
  L.push('- En los formatos, lo resaltado en amarillo está pendiente: datos que faltan, fotos o planos por pegar y la firma. Complétalo y quita el resaltado antes de radicar.');
  L.push('');
  L.push('ANTES DE RADICAR, ADJUNTA O PEGA EN LOS FORMATOS');
  for (const a of anexos(s)) L.push(`[ ] ${a.texto}${a.formato ? ` (${a.formato})` : ''}${a.obligatorio ? '' : ' (opcional)'}`);
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

export type Resultado = {
  zip: Uint8Array;
  nombreZip: string;
  archivos: { codigo: CodigoFormato; nombre: string; bytes: Uint8Array }[];
  avisos: ReturnType<typeof revisar>;
};

export async function generarPaquete(input: SolicitudInput | Solicitud, cargar: CargarPlantilla, hoy?: string): Promise<Resultado> {
  const s = Solicitud.parse(input);
  const archivos: Resultado['archivos'] = [];
  for (const codigo of formatosRequeridos(s)) {
    const bytes = renderizar(await cargar(codigo), MAPEOS[codigo](s));
    archivos.push({ codigo, nombre: FORMATOS[codigo].archivo, bytes });
  }
  const zip = new JSZip();
  for (const a of archivos) zip.file(a.nombre, a.bytes);
  zip.file('LEEME.txt', instrucciones(s, hoy));
  zip.file('solicitud.json', JSON.stringify(s, null, 2));
  const slug = (s.proyecto.nombre || 'rodaje')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rodaje';
  return {
    zip: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    nombreZip: `permiso-rodaje-${slug}.zip`,
    archivos,
    avisos: revisar(s),
  };
}
