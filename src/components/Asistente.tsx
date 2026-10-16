import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../styles/asistente.css';
import { AFECTACIONES, EFECTOS, ELEMENTOS, ESCALAS, IMPACTOS, Solicitud, TIPOS_ESPACIO } from '../lib/pufa/schema';
import {
  anexos, esNatural, estimarRetribucion, FORMATOS, formatosRequeridos, necesitaMovilidad, pesos, plazos, rangoRodaje, revisar,
  type CodigoFormato,
} from '../lib/pufa/derivar';
import { fechaLarga } from '../lib/pufa/calendario';
import ejemplo from '../lib/pufa/ejemplo.json';
import { generarPaquete } from '../lib/pufa/generar';
import {
  asignar, comoSolicitud, estadoVacio, hidratar, jornadaVacia, locacionVacia, movilidadVacia, naturalVacio, type Estado,
} from './estado';
import { Confirmar, type Confirmacion } from './Confirmar';
import { Area, Casillas, Interruptor, Numero, Opciones, SiNo, Texto, type Ruta } from './campos';

const CLAVE = 'filmincali:solicitud:v1';

/** Cada pliego lleva el color de revisión del formato que alimenta. */
const PLIEGOS = [
  { id: 'produccion', titulo: 'Proyecto', color: 'blanco', formatos: ['F004'] },
  { id: 'responsables', titulo: 'Responsables', color: 'blanco', formatos: ['F004'] },
  { id: 'locaciones', titulo: 'Locaciones y jornadas', color: 'azul', formatos: ['F005', 'F004'] },
  { id: 'movilidad', titulo: 'Movilidad', color: 'rosa', formatos: ['F006'] },
  { id: 'ambiente', titulo: 'Riesgos y ambiente', color: 'amarillo', formatos: ['F004', 'F007'] },
  { id: 'comunidad', titulo: 'Comunidad', color: 'verde', formatos: ['F008'] },
  { id: 'descargar', titulo: 'Revisar y descargar', color: 'papel', formatos: [] },
] as const;


const TIPOS = [['cine', 'Cine'], ['tv', 'Televisión'], ['publicidad', 'Publicidad'], ['web', 'Contenidos web'], ['videoclip', 'Videoclip'], ['otro', 'Otro']] as const;
const SUBTIPOS: Record<string, readonly (readonly [string, string])[]> = {
  cine: [['corto', 'Cortometraje'], ['medio', 'Mediometraje'], ['largo', 'Largometraje']],
  tv: [['serie', 'Serie'], ['telenovela', 'Telenovela'], ['reality', 'Reality'], ['otro', 'Otro']],
  publicidad: [['spot', 'Spot publicitario'], ['corporativo', 'Video corporativo'], ['promocional', 'Video promocional'], ['redes', 'Producción para redes'], ['otro', 'Otro']],
};
const DOCS = [['cc', 'Cédula de ciudadanía'], ['nit', 'NIT'], ['pasaporte', 'Pasaporte'], ['ce', 'Cédula de extranjería']] as const;

function diaSiguiente(f: string) {
  if (!f) return '';
  const d = new Date(f + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const ordenar = <T extends { fecha: string; horaInicio: string }>(js: T[]) =>
  [...js].sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || a.horaInicio.localeCompare(b.horaInicio));

function descargar(nombre: string, datos: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Asistente() {
  const [e, setE] = useState<Estado>(estadoVacio);
  const [paso, setPaso] = useState(0);
  const [cargado, setCargado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const pedir = (c: Confirmacion) => setConfirmacion(c);
  /** Hay datos que se perderían si se reemplaza la solicitud. */
  const tieneDatos = () => JSON.stringify(e) !== JSON.stringify(estadoVacio());
  const archivo = useRef<HTMLInputElement>(null);
  const cima = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado) setE(hidratar(JSON.parse(guardado)));
    } catch { /* sin almacenamiento: se trabaja en memoria */ }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* sin almacenamiento */ }
  }, [e, cargado]);

  const set = (ruta: Ruta, valor: unknown) => { setListo(''); setE((prev) => asignar(prev, ruta, valor)); };

  const parsed = useMemo(() => Solicitud.safeParse(comoSolicitud(e)), [e]);
  const s = parsed.success ? parsed.data : null;
  const requeridos = s ? formatosRequeridos(s) : (['F004', 'F005', 'F007', 'F008'] as CodigoFormato[]);
  const conMovilidad = e.locaciones.map((l) => necesitaMovilidad(l));

  const ir = (n: number) => {
    setPaso(n);
    cima.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function generar() {
    setError(''); setListo('');
    if (!parsed.success) {
      setError('Hay datos con formato inválido: ' + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(' › ')}: ${i.message}`).join(' · '));
      return;
    }
    setGenerando(true);
    try {
      const r = await generarPaquete(parsed.data, async (c) => {
        const res = await fetch(`/plantillas/${c}.docx`);
        if (!res.ok) throw new Error(`No se pudo cargar la plantilla ${c}`);
        return res.arrayBuffer();
      });
      descargar(r.nombreZip, r.zip as BlobPart, 'application/zip');
      setListo(`Descargado ${r.nombreZip} con ${r.archivos.length} formatos, LEEME.txt y solicitud.json.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerando(false);
    }
  }

  function cargarArchivo(f: File) {
    f.text()
      .then((t) => {
        const datos = hidratar(JSON.parse(t));
        const aplicar = () => { setE(datos); setListo(`Abriste ${f.name}.`); };
        if (!tieneDatos()) return aplicar();
        pedir({
          titulo: 'Abrir otra solicitud',
          texto: `Las respuestas que tienes ahora se reemplazan por las de ${f.name}. Si quieres conservarlas, guárdalas primero como solicitud.json.`,
          confirmar: 'Abrir y reemplazar',
          accion: aplicar,
        });
      })
      .catch(() => setError('Ese archivo no es un solicitud.json válido.'));
  }

  const pliego = PLIEGOS[paso];

  return (
    <div class="asistente" ref={cima}>
      <nav class="indice" aria-label="Pasos de la solicitud">
        <ol>
          {PLIEGOS.map((p, i) => {
            const omitido = p.id === 'movilidad' && !conMovilidad.some(Boolean);
            return (
              <li key={p.id}>
                <button type="button" class={`pestaña ${i === paso ? 'actual' : ''} ${i < paso ? 'hecho' : ''}`} aria-current={i === paso ? 'step' : undefined} onClick={() => ir(i)}>
                  <span class="num" aria-hidden="true">{i < paso ? '✓' : i + 1}</span>
                  <span class="nom">{p.titulo}</span>
                  {p.formatos.length > 0 && <span class="cod">{p.formatos.join(' ')}</span>}
                  {omitido && <span class="cod">no aplica</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <div class="herramientas">
          <button type="button" class="boton chico" onClick={() => {
            const aplicar = () => { setE(hidratar(ejemplo)); setListo('Cargaste un rodaje de ejemplo. Puedes editarlo o empezar de cero.'); };
            if (!tieneDatos()) return aplicar();
            pedir({ titulo: 'Cargar el ejemplo', texto: 'El rodaje de ejemplo reemplaza las respuestas que tienes ahora.', confirmar: 'Cargar ejemplo', accion: aplicar });
          }}>Cargar ejemplo</button>
          <button type="button" class="boton chico" onClick={() => archivo.current?.click()}>Abrir solicitud.json</button>
          <button type="button" class="boton chico" onClick={() => pedir({
            titulo: 'Empezar de cero',
            texto: 'Se borran todas las respuestas guardadas en este navegador. Esta acción no se puede deshacer.',
            confirmar: 'Borrar respuestas',
            peligro: true,
            accion: () => { setE(estadoVacio()); setPaso(0); setListo(''); },
          })}>Empezar de cero</button>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={(ev) => { const i = ev.currentTarget as HTMLInputElement; const f = i.files?.[0]; if (f) cargarArchivo(f); i.value = ''; }} />
        </div>
      </nav>

      <section class="pliego" aria-labelledby="pliego-titulo">
        <header class="pliego-cab">
          <div class="progreso" aria-hidden="true"><span style={{ width: `${((paso + 1) / PLIEGOS.length) * 100}%` }} /></div>
          <span class="paso-etq">Paso {paso + 1} de {PLIEGOS.length}</span>
          <h3 id="pliego-titulo" class="pliego-titulo">{pliego.titulo}</h3>
          {pliego.formatos.length > 0 && (
            <p class="alimenta">Llena {pliego.formatos.map((f) => `${f} ${FORMATOS[f].titulo.toLowerCase()}`).join(' y ')}.</p>
          )}
        </header>

        {pliego.id === 'produccion' && (
          <p class="aviso-excepcion">
            Periodismo de última hora, cámara en mano sin afectar el tránsito, fotografía, proyecciones, eventos culturales y BTL sin comercial no necesitan este permiso.{' '}
            <a href="#excepciones">Ver las excepciones</a>
          </p>
        )}
        {pliego.id === 'produccion' && <Produccion e={e} set={set} />}
        {pliego.id === 'responsables' && <Responsables e={e} set={set} />}
        {pliego.id === 'locaciones' && <Locaciones e={e} set={set} setE={setE} pedir={pedir} />}
        {pliego.id === 'movilidad' && <MovilidadPliego e={e} set={set} />}
        {pliego.id === 'ambiente' && <Ambiente e={e} set={set} />}
        {pliego.id === 'comunidad' && <Comunidad e={e} set={set} />}
        {pliego.id === 'descargar' && (
          <Descargar e={e} s={s} requeridos={requeridos} generar={generar} generando={generando}
            guardar={() => descargar('solicitud.json', JSON.stringify(e, null, 2), 'application/json')} irA={ir} />
        )}

        {error && <p class="mensaje error" role="alert">{error}</p>}
        {listo && <p class="mensaje ok" role="status">{listo}</p>}

        <footer class="pliego-pie">
          {paso > 0 ? <button type="button" class="boton fantasma" onClick={() => ir(paso - 1)}>Volver</button> : <span />}
          {paso < PLIEGOS.length - 1 && (
            <button type="button" class="boton principal" onClick={() => ir(paso + 1)}>Continuar: {PLIEGOS[paso + 1].titulo.toLowerCase()}</button>
          )}
        </footer>
      </section>
      <Confirmar c={confirmacion} cerrar={() => setConfirmacion(null)} />
    </div>
  );
}

type P = { e: Estado; set: (r: Ruta, v: unknown) => void };

function Produccion({ e, set }: P) {
  const t = e.proyecto.tipo;
  return (
    <div class="rejilla">
      <Texto e={e} set={set} ruta={['proyecto', 'nombre']} label="Nombre del proyecto" />
      <Opciones e={e} set={set} ruta={['proyecto', 'tipo']} label="Tipo de proyecto audiovisual" opciones={TIPOS} enLinea />
      {t === 'otro' && <Texto e={e} set={set} ruta={['proyecto', 'tipoOtro']} label="¿Cuál?" />}
      {SUBTIPOS[t] && <Opciones e={e} set={set} ruta={['proyecto', 'subtipo']} label="Caracterización" opciones={SUBTIPOS[t]} enLinea />}
      {(t === 'tv' || t === 'publicidad') && e.proyecto.subtipo === 'otro' && <Texto e={e} set={set} ruta={['proyecto', 'subtipoOtro']} label="¿Cuál?" />}
      {t === 'publicidad' && <Texto e={e} set={set} ruta={['proyecto', 'campana']} label="Nombre del producto o campaña" />}
      {t === 'videoclip' && (
        <div class="par">
          <Texto e={e} set={set} ruta={['proyecto', 'artista']} label="Artista o agrupación" />
          <Texto e={e} set={set} ruta={['proyecto', 'cancion']} label="Canción" />
        </div>
      )}
      {t === 'web' && (
        <div class="par">
          <Texto e={e} set={set} ruta={['proyecto', 'contenidoTipo']} label="Tipo de contenido" placeholder="Serie web, podcast en video…" />
          <Texto e={e} set={set} ruta={['proyecto', 'contenidoNombre']} label="Nombre del contenido" />
        </div>
      )}
      <Opciones e={e} set={set} ruta={['proyecto', 'naturaleza']} label="Naturaleza" enLinea
        opciones={[['nacional', 'Nacional'], ['internacional', 'Internacional'], ['servicios', 'Servicios de producción para producto internacional']]} />
      <Area e={e} set={set} ruta={['proyecto', 'sinopsis']} label="Sinopsis corta" placeholder="Dos o tres líneas sobre la historia o la pieza." />
      <Area e={e} set={set} ruta={['proyecto', 'escenas']} label="Escenas a filmar en espacio público" ayuda="Qué pasa frente a cámara en la calle. Menciona acción, persecuciones o tiroteos si los hay." />
      <fieldset class="grupo">
        <legend>Personas en la filmación</legend>
        <div class="trio">
          <Numero e={e} set={set} ruta={['personas', 'equipo']} label="Equipo, reparto y proveedores" />
          <Numero e={e} set={set} ruta={['personas', 'extras']} label="Extras y figurantes" />
          <Numero e={e} set={set} ruta={['personas', 'aglomeracion']} label="Público convocado" ayuda="Solo si invitas gente (fans, asistentes). Si no, deja 0." />
        </div>
      </fieldset>
      <Opciones e={e} set={set} ruta={['exencion', 'tipo']} label="¿Aplica exención de pago?" enLinea
        ayuda="Los proyectos académicos, comunitarios o financiados con fondos públicos del Distrito no pagan, pero cumplen el mismo trámite."
        opciones={[['ninguna', 'No'], ['academico', 'Proyecto académico'], ['comunitario', 'Proyecto comunitario'], ['fondos', 'Fondos públicos del Distrito']]} />
      {e.exencion.tipo !== 'ninguna' && (
        <Texto e={e} set={set} ruta={['exencion', 'entidad']}
          label={e.exencion.tipo === 'academico' ? 'Institución educativa' : e.exencion.tipo === 'comunitario' ? 'Colectivo' : 'Convocatoria o fondo'} />
      )}
    </div>
  );
}

function PersonaForm({ e, set, quien, titulo, ayuda }: P & { quien: 'filmacion' | 'locacion'; titulo: string; ayuda: string }) {
  const r: Ruta = ['responsables', quien];
  return (
    <fieldset class="ficha">
      <legend class="ficha-titulo">{titulo}</legend>
      <small>{ayuda}</small>
      <div class="rejilla">
        <Opciones e={e} set={set} ruta={[...r, 'tipoPersona']} label="Tipo de responsable" enLinea opciones={[['natural', 'Persona natural'], ['juridica', 'Persona jurídica']]} />
        <Opciones e={e} set={set} ruta={[...r, 'tipoDocumento']} label="Tipo de documento" enLinea opciones={DOCS} />
        <div class="par">
          <Texto e={e} set={set} ruta={[...r, 'documento']} label="Número de documento" />
          <Texto e={e} set={set} ruta={[...r, 'nombre']} label="Nombre completo" />
        </div>
        <div class="par">
          <Texto e={e} set={set} ruta={[...r, 'empresa']} label="Empresa productora" />
          <Texto e={e} set={set} ruta={[...r, 'cargo']} label="Cargo en la producción" />
        </div>
        <div class="par">
          <Texto e={e} set={set} ruta={[...r, 'telefono']} label="Teléfono" tipo="tel" />
          <Texto e={e} set={set} ruta={[...r, 'correo']} label="Correo" tipo="email" />
        </div>
      </div>
    </fieldset>
  );
}

function Responsables({ e, set }: P) {
  return (
    <div class="rejilla">
      <PersonaForm e={e} set={set} quien="filmacion" titulo="Responsable de la filmación" ayuda="Productor ejecutivo, general, en línea o gerente. A estos datos llegan las notificaciones y el valor a pagar." />
      <div class="copiar">
        <button type="button" class="boton chico" onClick={() => set(['responsables', 'locacion'], { ...e.responsables.filmacion })}>Usar los mismos datos para el responsable de la locación</button>
        <small>Útil si una sola persona cubre los dos roles. Luego puedes editar lo que cambie.</small>
      </div>
      <PersonaForm e={e} set={set} quien="locacion" titulo="Responsable de la locación y la comunidad" ayuda="Productor de locaciones o de campo. Uno de los dos debe estar en la locación si hay visita de verificación." />
      <Texto e={e} set={set} ruta={['solicitanteDireccion']} label="Dirección del solicitante" ayuda="La pide el concepto ambiental (F007)." />
      <SiNo e={e} set={set} ruta={['notificacion', 'autoriza']} label="Autorizo notificación electrónica" ayuda="Ley 1437 de 2011. Si no autorizas, te notifican por correo físico." />
      {e.notificacion.autoriza && (
        <Texto e={e} set={set} ruta={['notificacion', 'correo']} label="Correo autorizado para notificaciones" tipo="email" placeholder={e.responsables.filmacion.correo || 'correo@productora.co'} ayuda="Si lo dejas vacío se usa el del responsable de la filmación." />
      )}
    </div>
  );
}

function Locaciones({ e, set, setE, pedir }: P & { setE: (fn: (prev: Estado) => Estado) => void; pedir: (c: Confirmacion) => void }) {
  const agregar = () => setE((prev) => ({ ...prev, locaciones: [...prev.locaciones, locacionVacia()] }));
  const quitar = (i: number) => setE((prev) => ({ ...prev, locaciones: prev.locaciones.filter((_, k) => k !== i) }));
  const duplicar = (i: number) => setE((prev) => {
    const copia = structuredClone(prev.locaciones[i]);
    copia.nombre = copia.nombre ? `${copia.nombre} (copia)` : '';
    const locaciones = [...prev.locaciones];
    locaciones.splice(i + 1, 0, copia);
    return { ...prev, locaciones };
  });
  return (
    <div class="rejilla">
      <p class="nota">Una locación es cada espacio público que ocupas: el set y, si está en otro lugar, la base de producción. Cada una lleva sus propias jornadas.</p>
      {e.locaciones.map((l, i) => {
        const r: Ruta = ['locaciones', i];
        return (
          <fieldset class="ficha locacion" key={i}>
            <legend class="ficha-titulo">Locación {i + 1}{l.nombre ? `: ${l.nombre}` : ''}</legend>
            <div class="rejilla">
              <div class="par">
                <Texto e={e} set={set} ruta={[...r, 'nombre']} label="Nombre del lugar" placeholder="Bulevar del Río" />
                <Texto e={e} set={set} ruta={[...r, 'barrio']} label="Barrio o corregimiento" />
              </div>
              <div class="par">
                <Texto e={e} set={set} ruta={[...r, 'direccion']} label="Dirección" />
                <Texto e={e} set={set} ruta={[...r, 'mapsUrl']} label="Link de Google Maps" tipo="url" />
              </div>
              <Opciones e={e} set={set} ruta={[...r, 'uso']} label="Uso" enLinea opciones={[['set', 'Set de filmación'], ['base', 'Base de producción']]} />
              <Opciones e={e} set={set} ruta={[...r, 'zona']} label="Zona" enLinea opciones={[['urbano', 'Casco urbano'], ['rural', 'Zona rural']]} />
              <Opciones e={e} set={set} ruta={[...r, 'escala']} label="Escala del espacio público" enLinea
                ayuda="Se usa para estimar el valor. En parques y plazas depende del tamaño que les asigna el POT; en vías, de la jerarquía vial (local, colectora, arteria secundaria o principal). Los andenes tienen su propio peso."
                opciones={ESCALAS.map(([k, t]) => [k, t] as const)} />
              <Casillas e={e} set={set} ruta={[...r, 'tiposEspacio']} label="Tipo de espacio público" opciones={TIPOS_ESPACIO}
                ayuda="Corredor vial, andenes o ciclorrutas activan el plan de movilidad. Espacio natural activa la sección de áreas naturales del concepto ambiental." />
              <Numero e={e} set={set} ruta={[...r, 'areaM2']} label="Área ocupada" sufijo="m²" ayuda="Set, base, equipos y zona de trabajo." />

              <fieldset class="grupo">
                <legend>Jornadas en esta locación</legend>
                <small>Una fila por bloque de montaje, filmación o desmontaje. Así se liquida el valor a pagar.</small>
                <div class="jornadas" role="table" aria-label={`Jornadas de la locación ${i + 1}`}>
                  <div class="fila cab" role="row"><span role="columnheader">Fecha</span><span role="columnheader">Actividad</span><span role="columnheader">Inicio</span><span role="columnheader">Fin</span><span /></div>
                  {l.jornadas.map((j, k) => {
                    const rj: Ruta = [...r, 'jornadas', k];
                    return (
                      <div class="fila" role="row" key={k}>
                        <input aria-label="Fecha" type="date" value={j.fecha} onInput={(ev) => set([...rj, 'fecha'], (ev.currentTarget as HTMLInputElement).value)} />
                        <select aria-label="Actividad" value={j.actividad} onChange={(ev) => set([...rj, 'actividad'], (ev.currentTarget as HTMLSelectElement).value)}>
                          <option value="montaje">Montaje</option>
                          <option value="filmacion">Filmación</option>
                          <option value="desmontaje">Desmontaje</option>
                        </select>
                        <input aria-label="Hora inicial" type="time" value={j.horaInicio} onInput={(ev) => set([...rj, 'horaInicio'], (ev.currentTarget as HTMLInputElement).value)} />
                        <input aria-label="Hora final" type="time" value={j.horaFin} onInput={(ev) => set([...rj, 'horaFin'], (ev.currentTarget as HTMLInputElement).value)} />
                        <span class="fila-acciones">
                          <button type="button" class="icono" title="Duplicar para el día siguiente" aria-label={`Duplicar jornada ${k + 1} para el día siguiente`}
                            onClick={() => { const js = [...l.jornadas]; js.splice(k + 1, 0, { ...j, fecha: diaSiguiente(j.fecha) }); set([...r, 'jornadas'], ordenar(js)); }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>
                          </button>
                          <button type="button" class="quitar" aria-label={`Quitar jornada ${k + 1}`} disabled={l.jornadas.length === 1}
                            onClick={() => set([...r, 'jornadas'], l.jornadas.filter((_, x) => x !== k))}>×</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div class="acciones-ficha">
                  <button type="button" class="boton chico" onClick={() => set([...r, 'jornadas'], [...l.jornadas, jornadaVacia(l.jornadas.at(-1)?.fecha ?? '')])}>Agregar jornada</button>
                  <button type="button" class="boton chico" disabled={!l.jornadas.some((j) => j.fecha)}
                    onClick={() => {
                      const fechas = [...new Set(l.jornadas.map((j) => j.fecha).filter(Boolean))].sort();
                      const ultimo = fechas.at(-1)!;
                      const delDia = l.jornadas.filter((j) => j.fecha === ultimo).map((j) => ({ ...j, fecha: diaSiguiente(ultimo) }));
                      set([...r, 'jornadas'], ordenar([...l.jornadas, ...delDia]));
                    }}>Repetir el último día</button>
                </div>
              </fieldset>

              <fieldset class="grupo">
                <legend>Elementos que ocupan el espacio</legend>
                <small>Deja en 0 lo que no uses.</small>
                <div class="elementos">
                  {ELEMENTOS.map(([k, t]) => (
                    <label class={`elemento ${(l.elementos[k] ?? 0) > 0 ? 'usado' : ''}`} key={k}>
                      <input type="number" min={0} inputMode="numeric" value={String(l.elementos[k] ?? 0)}
                        onInput={(ev) => set([...r, 'elementos', k], Math.max(0, Number((ev.currentTarget as HTMLInputElement).value) || 0))} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {(l.elementos.escenografia ?? 0) > 0 && <Texto e={e} set={set} ruta={[...r, 'escenografiaDesc']} label="Describe la escenografía" />}
              <Texto e={e} set={set} ruta={[...r, 'otrosElementos']} label="Otros elementos" placeholder="Ninguno" />
              <div class="acciones-ficha">
                <button type="button" class="boton chico" onClick={() => duplicar(i)}>Duplicar locación</button>
                {e.locaciones.length > 1 && <button type="button" class="boton chico fantasma peligro" onClick={() => pedir({
                  titulo: `Quitar la locación ${i + 1}`,
                  texto: `Se borran ${l.nombre ? `los datos de ${l.nombre}` : 'los datos de esta locación'}, con ${l.jornadas.length === 1 ? 'su jornada' : `sus ${l.jornadas.length} jornadas`} y sus elementos.`,
                  confirmar: 'Quitar locación',
                  peligro: true,
                  accion: () => quitar(i),
                })}>Quitar locación {i + 1}</button>}
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" class="boton" onClick={agregar}>Agregar otra locación</button>
    </div>
  );
}

function MovilidadPliego({ e, set }: P) {
  const idx = e.locaciones.map((l, i) => ({ l, i })).filter(({ l }) => necesitaMovilidad(l));
  if (!idx.length)
    return <p class="nota grande">Ninguna locación ocupa corredor vial, andenes o ciclorrutas, así que no necesitas el plan de movilidad (F006). Si vas a cerrar una calle o un andén, márcalo en el tipo de espacio de la locación.</p>;
  return (
    <div class="rejilla">
      <p class="nota">Todos los dispositivos de señalización deben estar certificados según el Manual de Señalización Vial (Resolución 20243040045005 de 2024). La Secretaría de Movilidad emite el concepto.</p>
      {idx.map(({ l, i }) => {
        const r: Ruta = ['locaciones', i, 'movilidad'];
        const m = l.movilidad ?? movilidadVacia();
        const em = { ...e, locaciones: e.locaciones.map((x, k) => (k === i ? { ...x, movilidad: m } : x)) };
        const sm = (ruta: Ruta, v: unknown) => {
          if (!l.movilidad) set(r, { ...movilidadVacia(), [ruta[ruta.length - 1]]: v });
          else set(ruta, v);
        };
        return (
          <fieldset class="ficha" key={i}>
            <legend class="ficha-titulo">Locación {i + 1}{l.nombre ? `: ${l.nombre}` : ''}</legend>
            <div class="rejilla">
              <Casillas e={em} set={sm} ruta={[...r, 'afectaciones']} label="Afectaciones" opciones={AFECTACIONES} />
              <div class="par">
                <Texto e={em} set={sm} ruta={[...r, 'sentido']} label="Sentido de la vía" placeholder="norte-sur" />
                <Texto e={em} set={sm} ruta={[...r, 'costado']} label="Costado" placeholder="costado derecho" />
              </div>
              <div class="sinos">
                <SiNo e={em} set={sm} ruta={[...r, 'afectaMio']} label="Afecta el MIO" ayuda="Necesitas autorización de Metro Cali S.A." />
                <SiNo e={em} set={sm} ruta={[...r, 'desvioPeatonal']} label="Desvía senderos peatonales" />
                <SiNo e={em} set={sm} ruta={[...r, 'desvioPublico']} label="Desvía rutas de transporte público" />
                <SiNo e={em} set={sm} ruta={[...r, 'socializarEmpresas']} label="Socializa con empresas de transporte" />
                <SiNo e={em} set={sm} ruta={[...r, 'desvioParticular']} label="Desvía transporte particular" />
                <SiNo e={em} set={sm} ruta={[...r, 'semaforos']} label="Modifica intersecciones semaforizadas" />
              </div>
              {m.semaforos && <Area e={em} set={sm} ruta={[...r, 'semaforosDetalle']} label="Qué intersecciones y cómo" />}
              <Area e={em} set={sm} ruta={[...r, 'implementacion']} label="Cómo implementarás el plan en campo" placeholder="Kit de señalización, bandereros, auxiliares de tránsito, tiempos de cierre…" />
              <Area e={em} set={sm} ruta={[...r, 'senalizacion']} label="Inventario de señalización" placeholder="6 conos reflectivos, 2 vallas, 2 paletas pare/siga" />
              <div class="par">
                <Area e={em} set={sm} ruta={[...r, 'cargueDescargue']} label="Zona de cargue y descargue" />
                <Area e={em} set={sm} ruta={[...r, 'parqueo']} label="Zona de parqueo de vehículos" />
              </div>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function Ambiente({ e, set }: P) {
  const nat = e.locaciones.map((l, i) => ({ l, i })).filter(({ l }) => esNatural(l));
  return (
    <div class="rejilla">
      <Casillas e={e} set={set} ruta={['riesgos', 'efectos']} label="Efectos especiales en escena" opciones={EFECTOS} ayuda="Si marcas alguno, la Comisión pide un plan de emergencias." />
      {e.riesgos.efectos.includes('otro') && <Texto e={e} set={set} ruta={['riesgos', 'efectoOtro']} label="¿Cuál efecto?" />}
      {e.riesgos.efectos.length > 0 && <Area e={e} set={set} ruta={['riesgos', 'efectosEscena']} label="Describe la escena con efectos" />}

      <Interruptor label="Hay animales en escena" activo={!!e.riesgos.animales}
        onCambio={(v) => set(['riesgos', 'animales'], v ? { tipo: '', cantidad: 1, acciones: '', manejo: '' } : null)} />
      {e.riesgos.animales && (
        <div class="sub rejilla">
          <div class="par">
            <Texto e={e} set={set} ruta={['riesgos', 'animales', 'tipo']} label="Tipo o raza" />
            <Numero e={e} set={set} ruta={['riesgos', 'animales', 'cantidad']} label="Cantidad" />
          </div>
          <Area e={e} set={set} ruta={['riesgos', 'animales', 'acciones']} label="Acciones con los animales" />
          <Area e={e} set={set} ruta={['riesgos', 'animales', 'manejo']} label="Manejo y personal especializado" ayuda="Según la Política Pública de Ética Interespecie y Protección Animal." />
        </div>
      )}
      <Interruptor label="Hay armamento en escena" activo={!!e.riesgos.armas}
        onCambio={(v) => set(['riesgos', 'armas'], v ? { tipos: '', cantidad: 1, acciones: '' } : null)} />
      {e.riesgos.armas && (
        <div class="sub rejilla">
          <div class="par">
            <Texto e={e} set={set} ruta={['riesgos', 'armas', 'tipos']} label="Tipos de armas" />
            <Numero e={e} set={set} ruta={['riesgos', 'armas', 'cantidad']} label="Cantidad" />
          </div>
          <Area e={e} set={set} ruta={['riesgos', 'armas', 'acciones']} label="Acciones con las armas" ayuda="Bajo supervisión de profesionales expertos." />
        </div>
      )}

      <h3 class="separador">Residuos y ruido (F007)</h3>
      <Area e={e} set={set} ruta={['ambiental', 'residuosTipos']} label="Qué residuos generará el rodaje y cuántos" placeholder="Aprovechables del catering, orgánicos, cartón… en cantidad aproximada." />
      <Area e={e} set={set} ruta={['ambiental', 'residuosEstrategia']} label="Cómo los vas a manejar" placeholder="Puntos de separación, retiro al cierre, entrega a recicladores." />
      <div class="trio">
        <Numero e={e} set={set} ruta={['ambiental', 'ruidoAmplificacion', 'cantidad']} label="Equipos de amplificación" />
        <Numero e={e} set={set} ruta={['ambiental', 'ruidoPlantas', 'cantidad']} label="Plantas eléctricas" />
        <Numero e={e} set={set} ruta={['ambiental', 'ruidoVehiculos', 'cantidad']} label="Vehículos o maquinaria" />
      </div>
      <div class="trio">
        <Texto e={e} set={set} ruta={['ambiental', 'ruidoAmplificacion', 'tipo']} label="Tipo o marca" />
        <Texto e={e} set={set} ruta={['ambiental', 'ruidoPlantas', 'tipo']} label="Tipo o marca" />
        <Texto e={e} set={set} ruta={['ambiental', 'ruidoVehiculos', 'tipo']} label="Tipo o marca" />
      </div>
      <Texto e={e} set={set} ruta={['ambiental', 'ruidoMitigacion']} label="Acciones de mitigación del ruido" />
      <Area e={e} set={set} ruta={['ambiental', 'sensibles']} label="Instituciones sensibles cercanas" placeholder="Hospitales, hogares geriátricos, colegios, zonas residenciales de bajo ruido." />
      <Area e={e} set={set} ruta={['ambiental', 'medidasAcusticas']} label="Medidas de manejo acústico" placeholder="Equipos insonorizados, ubicación lejos de zonas sensibles, sin alto impacto en la noche…" />

      {nat.length > 0 && <h3 class="separador">Áreas naturales</h3>}
      {nat.map(({ l, i }) => {
        const r: Ruta = ['locaciones', i, 'natural'];
        const n = l.natural ?? naturalVacio();
        const en = { ...e, locaciones: e.locaciones.map((x, k) => (k === i ? { ...x, natural: n } : x)) };
        const sn = (ruta: Ruta, v: unknown) => (l.natural ? set(ruta, v) : set(r, { ...naturalVacio(), [ruta[ruta.length - 1]]: v }));
        return (
          <fieldset class="ficha" key={i}>
            <legend class="ficha-titulo">Locación {i + 1}{l.nombre ? `: ${l.nombre}` : ''}</legend>
            <div class="rejilla">
              <Texto e={en} set={sn} ruta={[...r, 'nombreArea']} label="Nombre del área natural" placeholder="Ecoparque Pance Mágico" />
              <Area e={en} set={sn} ruta={[...r, 'actividades']} label="Actividades y escenas en el área" />
              <Casillas e={en} set={sn} ruta={[...r, 'impactos']} label="Impactos posibles" opciones={IMPACTOS} />
              {n.impactos.length > 0 && <Area e={en} set={sn} ruta={[...r, 'impactoDetalle']} label="Describe los impactos" />}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function Comunidad({ e, set }: P) {
  return (
    <div class="rejilla">
      <Area e={e} set={set} ruta={['socializacion', 'estrategias']} label="Cómo vas a informar a la comunidad"
        ayuda="Reuniones con la Junta de Acción Comunal, volanteo, visitas puerta a puerta, encuentros con colectivos." />
      <Area e={e} set={set} ruta={['socializacion', 'impactoPositivo']} label="Impacto positivo para el barrio" placeholder="Contratación local, un agradecimiento en créditos, una proyección…" />
      <p class="nota">Las evidencias (actas, listados de asistencia, fotos) se pegan en el formato F008 después de descargarlo.</p>
    </div>
  );
}

function Descargar({ e, s, requeridos, generar, generando, guardar, irA }: {
  e: Estado; s: Solicitud | null; requeridos: CodigoFormato[]; generar: () => void; generando: boolean; guardar: () => void; irA: (n: number) => void;
}) {
  const r = s ? rangoRodaje(s) : null;
  const p = r && r.inicio ? plazos(r.inicio) : null;
  const avisos = s ? revisar(s) : [];
  const lista = s ? anexos(s) : [];
  const errores = avisos.filter((a) => a.nivel === 'error');
  const est = s ? estimarRetribucion(s) : null;
  return (
    <div class="rejilla">
      {p ? (
        <div class={`plazo-caja estado-${p.estado}`}>
          <p>Primer día en calle: <strong>{fechaLarga(p.primerDia)}</strong></p>
          <p>Radica entre el <strong>{fechaLarga(p.apertura)}</strong> y el <strong>{fechaLarga(p.limite)}</strong>.</p>
          <p class="estado">
            {p.estado === 'tarde' && 'Ya pasó el plazo mínimo de 20 días hábiles. Escribe a la Comisión Fílmica antes de radicar.'}
            {p.estado === 'justo' && `Quedan ${p.habilesRestantes} días hábiles para radicar.`}
            {p.estado === 'a-tiempo' && `Vas a tiempo: quedan ${p.habilesRestantes} días hábiles.`}
            {p.estado === 'temprano' && 'Todavía no puedes radicar: falta más de 3 meses para el rodaje.'}
          </p>
          <p class="plazo-consejo">Radica lo antes posible. La SEPOU tiene hasta 15 días hábiles para revisar y, si devuelve la solicitud por documentos, el tiempo que tardes en completarla corre en tu contra.</p>
        </div>
      ) : (
        <p class="destacado">Agrega las fechas de las jornadas en <button type="button" class="enlace" onClick={() => irA(2)}>locaciones</button> para calcular el plazo.</p>
      )}

      {est && (
        <div class="estimado">
          <h4 class="bloque-titulo">Valor estimado de la retribución</h4>
          {est.exento ? (
            <p class="estimado-valor">$ 0</p>
          ) : (
            <p class="estimado-valor">{pesos(est.valor)}</p>
          )}
          <p class="ayuda">
            {est.exento
              ? 'Marcaste una exención de pago. Igual debes radicar y adjuntar el soporte.'
              : `(${est.metrosDia} m² por día × ${String(est.escala.peso).replace('.', ',')} escala ${est.escala.nombre.toLowerCase()} × UVT ${est.anioUvt} de ${pesos(est.uvt)}) ÷ 12. Es una aproximación; el valor oficial lo notifica la Alcaldía.`}
          </p>
        </div>
      )}

      <h4 class="bloque-titulo">Documentos que vas a descargar</h4>
      <ul class="lista-formatos">
        {requeridos.map((c) => <li key={c}><strong>{c}</strong> {FORMATOS[c].titulo}</li>)}
      </ul>

      {avisos.length > 0 && (
        <div class="resumen-errores" role="region" aria-labelledby="avisos-titulo">
          <h4 id="avisos-titulo" class="bloque-titulo">{errores.length ? `Faltan ${errores.length} ${errores.length === 1 ? 'dato' : 'datos'}` : 'Revisa antes de radicar'}</h4>
          <ul>{avisos.map((a, i) => <li key={i} class={a.nivel}>{a.texto}</li>)}</ul>
          <p class="ayuda">Puedes descargar igual. Lo que falte queda en blanco para completarlo en Word.</p>
        </div>
      )}

      <div class="acciones">
        <button type="button" class="boton acento grande" onClick={generar} disabled={generando}>
          {generando ? 'Preparando los formatos…' : `Descargar ${requeridos.length} formatos (.zip)`}
        </button>
        <button type="button" class="boton" onClick={guardar}>Guardar respuestas (solicitud.json)</button>
      </div>

      <div class="anexos">
        <h4 class="bloque-titulo">Lo que debes pegar o adjuntar</h4>
        <ul>{lista.map((a, i) => <li key={i}>{a.texto}{a.formato && <span class="cod">{a.formato}</span>}{!a.obligatorio && <em> (opcional)</em>}</li>)}</ul>
      </div>

      <h4 class="bloque-titulo">Después de descargar</h4>
      <ol class="pasos">
        <li>Abre cada formato, pega fotos y planos donde lo indica y firma el formulario de solicitud.</li>
        <li>Radica todo en la <a href="https://archivo.cali.gov.co/participacion/publicaciones/161718/radicacion-de-peticiones-quejas-y-reclamos/">plataforma PQRS de la Alcaldía</a>, dirigido a la Subdirección de Espacio Público y Ordenamiento Urbanístico (SEPOU).</li>
        <li>Envía el número de radicado a filmincali@cali.gov.co y aprovechamientoep@cali.gov.co.</li>
        <li>Si falta algún documento, te devuelven la solicitud y tienes 30 días para completarla. Con la documentación completa, la SEPOU tiene 15 días hábiles para revisarla.</li>
        <li>Si es viable, te notifican el valor y la póliza. Tienes 2 días hábiles para pagar y enviar el comprobante y la póliza a aprovechamientoep@cali.gov.co.</li>
        <li>Recibes el acto administrativo de autorización. Mantén visible el aviso oficial durante el rodaje.</li>
      </ol>
      <p class="nota">Estima el valor con la <a href="https://www.cali.gov.co/planeacion/publicaciones/183378/tramite-de-aeep/" rel="noopener">calculadora de aprovechamiento económico</a> de la Alcaldía.</p>
      {e.proyecto.nombre === '' && <span class="sr-only">Sin nombre de proyecto</span>}
    </div>
  );
}
