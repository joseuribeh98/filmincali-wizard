/** Genera los formatos llenos y el paquete .zip. Funciona en el navegador y en Node. */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import JSZip from 'jszip';
import { Solicitud, type SolicitudInput } from './schema';
import { MAPEOS } from './mapear';
import { anexos, estimarRetribucion, FORMATOS, formatosRequeridos, pesos, plazos, rangoRodaje, revisar, type CodigoFormato } from './derivar';
import { fechaLarga } from './calendario';

export type CargarPlantilla = (codigo: CodigoFormato) => Promise<ArrayBuffer | Uint8Array>;

export function validar(input: unknown) {
  return Solicitud.safeParse(input);
}

export function renderizar(plantilla: ArrayBuffer | Uint8Array, datos: Record<string, unknown>): Uint8Array {
  const doc = new Docxtemplater(new PizZip(plantilla), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(datos);
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
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
