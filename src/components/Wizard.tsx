import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../styles/wizard.css';
import { CLOSURES, EFFECTS, ELEMENTS, IMPACTS, PermitRequest, SCALES, SPACE_TYPES } from '../lib/permit/schema';
import {
  attachments, estimateFee, FORMS, formatCop, deadlines, isNaturalArea, needsMobilityPlan, requiredForms, review, shootRange,
  type FormCode,
} from '../lib/permit/derive';
import { longDate } from '../lib/permit/calendar';
import example from '../lib/permit/example.json';
import { buildPackage } from '../lib/permit/generate';
import {
  asRequest, emptyLocation, emptyMobility, emptyNaturalArea, emptySession, emptyState, hydrate, setIn, type WizardState,
} from './state';
import { ConfirmDialog, type Confirmation } from './ConfirmDialog';
import { CheckboxGroup, NumberField, RadioGroup, Switch, TextArea, TextField, YesNo, type Path } from './fields';

const STORAGE_KEY = 'filmincali:request:v2';
/** Drafts saved by the first version, with Spanish keys. Read once and migrated. */
const LEGACY_STORAGE_KEY = 'filmincali:solicitud:v1';

const STEPS = [
  { id: 'project', title: 'Proyecto', forms: ['F004'] },
  { id: 'contacts', title: 'Responsables', forms: ['F004'] },
  { id: 'locations', title: 'Locaciones y jornadas', forms: ['F005', 'F004'] },
  { id: 'mobility', title: 'Movilidad', forms: ['F006'] },
  { id: 'environment', title: 'Riesgos y ambiente', forms: ['F004', 'F007'] },
  { id: 'community', title: 'Comunidad', forms: ['F008'] },
  { id: 'download', title: 'Revisar y descargar', forms: [] },
] as const;

const PROJECT_TYPES = [['film', 'Cine'], ['tv', 'Televisión'], ['advertising', 'Publicidad'], ['web', 'Contenidos web'], ['music_video', 'Videoclip'], ['other', 'Otro']] as const;
const SUBTYPES: Record<string, readonly (readonly [string, string])[]> = {
  film: [['short', 'Cortometraje'], ['medium', 'Mediometraje'], ['feature', 'Largometraje']],
  tv: [['series', 'Serie'], ['telenovela', 'Telenovela'], ['reality', 'Reality'], ['other', 'Otro']],
  advertising: [['spot', 'Spot publicitario'], ['corporate', 'Video corporativo'], ['promotional', 'Video promocional'], ['social', 'Producción para redes'], ['other', 'Otro']],
};
const ID_TYPES = [['cc', 'Cédula de ciudadanía'], ['nit', 'NIT'], ['passport', 'Pasaporte'], ['ce', 'Cédula de extranjería']] as const;

function nextDay(value: string) {
  if (!value) return '';
  const d = new Date(value + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const sortSessions = <T extends { date: string; start: string }>(list: T[]) =>
  [...list].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.start.localeCompare(b.start));

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Wizard() {
  const [state, setState] = useState<WizardState>(emptyState);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirm = (c: Confirmation) => setConfirmation(c);
  /** True when replacing the request would lose data. */
  const hasData = () => JSON.stringify(state) !== JSON.stringify(emptyState());
  const fileInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLOListElement>(null);

  // On mobile the steps are a horizontal strip: center the current one.
  useEffect(() => {
    const ol = tabs.current;
    const el = ol?.querySelector<HTMLElement>('.tab.current')?.parentElement;
    if (!ol || !el || ol.scrollWidth <= ol.clientWidth) return;
    ol.scrollTo({ left: el.offsetLeft - (ol.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) setState(hydrate(JSON.parse(saved)));
    } catch { /* no storage: work in memory */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch { /* no storage */ }
  }, [state, loaded]);

  const set = (path: Path, value: unknown) => { setNotice(''); setState((prev) => setIn(prev, path, value)); };

  const parsed = useMemo(() => PermitRequest.safeParse(asRequest(state)), [state]);
  const request = parsed.success ? parsed.data : null;
  const forms = request ? requiredForms(request) : (['F004', 'F005', 'F007', 'F008'] as FormCode[]);
  const withMobility = state.locations.map((l) => needsMobilityPlan(l));

  const goTo = (n: number) => {
    setStep(n);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function generate() {
    setError(''); setNotice('');
    if (!parsed.success) {
      setError('Hay datos con formato inválido: ' + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(' › ')}: ${i.message}`).join(' · '));
      return;
    }
    setGenerating(true);
    try {
      const pkg = await buildPackage(parsed.data, async (code) => {
        const res = await fetch(`/templates/${code}.docx`);
        if (!res.ok) throw new Error(`No se pudo cargar la plantilla ${code}`);
        return res.arrayBuffer();
      });
      download(pkg.zipName, pkg.zip as BlobPart, 'application/zip');
      setNotice(`Descargado ${pkg.zipName} con ${pkg.files.length} formatos, LEEME.txt y solicitud.json.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function openFile(f: File) {
    f.text()
      .then((t) => {
        const data = hydrate(JSON.parse(t));
        const apply = () => { setState(data); setNotice(`Abriste ${f.name}.`); };
        if (!hasData()) return apply();
        confirm({
          title: 'Abrir otra solicitud',
          text: `Las respuestas que tienes ahora se reemplazan por las de ${f.name}. Si quieres conservarlas, guárdalas primero como solicitud.json.`,
          confirmLabel: 'Abrir y reemplazar',
          onConfirm: apply,
        });
      })
      .catch(() => setError('Ese archivo no es un solicitud.json válido.'));
  }

  const current = STEPS[step];

  return (
    <div class="wizard" ref={top}>
      <nav class="steps" aria-label="Pasos de la solicitud">
        <ol ref={tabs}>
          {STEPS.map((p, i) => {
            const skipped = p.id === 'mobility' && !withMobility.some(Boolean);
            return (
              <li key={p.id}>
                <button type="button" class={`tab ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => goTo(i)}>
                  <span class="num" aria-hidden="true">{i < step ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg> : i + 1}</span>
                  <span class="tab-name">{p.title}</span>
                  {p.forms.length > 0 && <span class="code-tag">{p.forms.join(' ')}</span>}
                  {skipped && <span class="code-tag">no aplica</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <div class="tools">
          <button type="button" class="btn sm" onClick={() => {
            const apply = () => { setState(hydrate(example)); setNotice('Cargaste un rodaje de ejemplo. Puedes editarlo o empezar de cero.'); };
            if (!hasData()) return apply();
            confirm({ title: 'Cargar el ejemplo', text: 'El rodaje de ejemplo reemplaza las respuestas que tienes ahora.', confirmLabel: 'Cargar ejemplo', onConfirm: apply });
          }}>Cargar ejemplo</button>
          <button type="button" class="btn sm" onClick={() => fileInput.current?.click()}>Abrir solicitud.json</button>
          <button type="button" class="btn sm" onClick={() => confirm({
            title: 'Empezar de cero',
            text: 'Se borran todas las respuestas guardadas en este navegador. Esta acción no se puede deshacer.',
            confirmLabel: 'Borrar respuestas',
            danger: true,
            onConfirm: () => { setState(emptyState()); setStep(0); setNotice(''); },
          })}>Empezar de cero</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(ev) => { const i = ev.currentTarget as HTMLInputElement; const f = i.files?.[0]; if (f) openFile(f); i.value = ''; }} />
        </div>
      </nav>

      <section class="step" aria-labelledby="step-title">
        <header class="step-head">
          <div class="progress" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <span class="step-label">Paso {step + 1} de {STEPS.length}</span>
          <h3 id="step-title" class="step-title">{current.title}</h3>
          {current.forms.length > 0 && (
            <p class="feeds">Llena {current.forms.map((f) => `${f} ${FORMS[f].title.toLowerCase()}`).join(' y ')}.</p>
          )}
        </header>

        {current.id === 'project' && (
          <p class="exception-notice">
            Periodismo de última hora, cámara en mano sin afectar el tránsito, fotografía, proyecciones, eventos culturales y BTL sin comercial no necesitan este permiso.{' '}
            <a href="#excepciones">Ver las excepciones</a>
          </p>
        )}
        {current.id === 'project' && <ProjectStep s={state} set={set} />}
        {current.id === 'contacts' && <ContactsStep s={state} set={set} />}
        {current.id === 'locations' && <LocationsStep s={state} set={set} setState={setState} confirm={confirm} />}
        {current.id === 'mobility' && <MobilityStep s={state} set={set} />}
        {current.id === 'environment' && <EnvironmentStep s={state} set={set} />}
        {current.id === 'community' && <CommunityStep s={state} set={set} />}
        {current.id === 'download' && (
          <DownloadStep s={state} request={request} forms={forms} generate={generate} generating={generating}
            save={() => download('solicitud.json', JSON.stringify(state, null, 2), 'application/json')} goTo={goTo} />
        )}

        {error && <p class="message error" role="alert">{error}</p>}
        {notice && <p class="message ok" role="status">{notice}</p>}

        <footer class="step-footer">
          {step > 0 ? <button type="button" class="btn ghost" onClick={() => goTo(step - 1)}>Volver</button> : <span />}
          {step < STEPS.length - 1 && (
            <button type="button" class="btn primary" onClick={() => goTo(step + 1)}>Continuar: {STEPS[step + 1].title.toLowerCase()}</button>
          )}
        </footer>
      </section>
      <ConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  );
}

type StepProps = { s: WizardState; set: (p: Path, v: unknown) => void };

function ProjectStep({ s, set }: StepProps) {
  const t = s.project.type;
  return (
    <div class="grid">
      <TextField s={s} set={set} path={['project', 'name']} label="Nombre del proyecto" />
      <RadioGroup s={s} set={set} path={['project', 'type']} label="Tipo de proyecto audiovisual" options={PROJECT_TYPES} inline />
      {t === 'other' && <TextField s={s} set={set} path={['project', 'typeOther']} label="¿Cuál?" />}
      {SUBTYPES[t] && <RadioGroup s={s} set={set} path={['project', 'subtype']} label="Caracterización" options={SUBTYPES[t]} inline />}
      {(t === 'tv' || t === 'advertising') && s.project.subtype === 'other' && <TextField s={s} set={set} path={['project', 'subtypeOther']} label="¿Cuál?" />}
      {t === 'advertising' && <TextField s={s} set={set} path={['project', 'campaign']} label="Nombre del producto o campaña" />}
      {t === 'music_video' && (
        <div class="pair">
          <TextField s={s} set={set} path={['project', 'artist']} label="Artista o agrupación" />
          <TextField s={s} set={set} path={['project', 'song']} label="Canción" />
        </div>
      )}
      {t === 'web' && (
        <div class="pair">
          <TextField s={s} set={set} path={['project', 'contentType']} label="Tipo de contenido" placeholder="Serie web, podcast en video…" />
          <TextField s={s} set={set} path={['project', 'contentName']} label="Nombre del contenido" />
        </div>
      )}
      <RadioGroup s={s} set={set} path={['project', 'origin']} label="Naturaleza" inline
        options={[['national', 'Nacional'], ['international', 'Internacional'], ['services', 'Servicios de producción para producto internacional']]} />
      <TextArea s={s} set={set} path={['project', 'synopsis']} label="Sinopsis corta" placeholder="Dos o tres líneas sobre la historia o la pieza." />
      <TextArea s={s} set={set} path={['project', 'scenes']} label="Escenas a filmar en espacio público" hint="Qué pasa frente a cámara en la calle. Menciona acción, persecuciones o tiroteos si los hay." />
      <fieldset class="group">
        <legend>Personas en la filmación</legend>
        <div class="trio">
          <NumberField s={s} set={set} path={['people', 'crew']} label="Equipo, reparto y proveedores" />
          <NumberField s={s} set={set} path={['people', 'extras']} label="Extras y figurantes" />
          <NumberField s={s} set={set} path={['people', 'crowd']} label="Público convocado" hint="Solo si invitas gente (fans, asistentes). Si no, deja 0." />
        </div>
      </fieldset>
      <RadioGroup s={s} set={set} path={['exemption', 'type']} label="¿Aplica exención de pago?" inline
        hint="Los proyectos académicos, comunitarios o financiados con fondos públicos del Distrito no pagan, pero cumplen el mismo trámite."
        options={[['none', 'No'], ['academic', 'Proyecto académico'], ['community', 'Proyecto comunitario'], ['public_funds', 'Fondos públicos del Distrito']]} />
      {s.exemption.type !== 'none' && (
        <TextField s={s} set={set} path={['exemption', 'entity']}
          label={s.exemption.type === 'academic' ? 'Institución educativa' : s.exemption.type === 'community' ? 'Colectivo' : 'Convocatoria o fondo'} />
      )}
    </div>
  );
}

function PersonCard({ s, set, who, title, hint }: StepProps & { who: 'production' | 'location'; title: string; hint: string }) {
  const p: Path = ['contacts', who];
  return (
    <fieldset class="card">
      <legend class="card-title">{title}</legend>
      <small>{hint}</small>
      <div class="grid">
        <RadioGroup s={s} set={set} path={[...p, 'personType']} label="Tipo de responsable" inline options={[['natural', 'Persona natural'], ['legal', 'Persona jurídica']]} />
        <RadioGroup s={s} set={set} path={[...p, 'idType']} label="Tipo de documento" inline options={ID_TYPES} />
        <div class="pair">
          <TextField s={s} set={set} path={[...p, 'idNumber']} label="Número de documento" />
          <TextField s={s} set={set} path={[...p, 'name']} label="Nombre completo" />
        </div>
        <div class="pair">
          <TextField s={s} set={set} path={[...p, 'company']} label="Empresa productora" />
          <TextField s={s} set={set} path={[...p, 'role']} label="Cargo en la producción" />
        </div>
        <div class="pair">
          <TextField s={s} set={set} path={[...p, 'phone']} label="Teléfono" type="tel" />
          <TextField s={s} set={set} path={[...p, 'email']} label="Correo" type="email" />
        </div>
      </div>
    </fieldset>
  );
}

function ContactsStep({ s, set }: StepProps) {
  return (
    <div class="grid">
      <PersonCard s={s} set={set} who="production" title="Responsable de la filmación" hint="Productor ejecutivo, general, en línea o gerente. A estos datos llegan las notificaciones y el valor a pagar." />
      <div class="copy-row">
        <button type="button" class="btn sm" onClick={() => set(['contacts', 'location'], { ...s.contacts.production })}>Usar los mismos datos para el responsable de la locación</button>
        <small>Útil si una sola persona cubre los dos roles. Luego puedes editar lo que cambie.</small>
      </div>
      <PersonCard s={s} set={set} who="location" title="Responsable de la locación y la comunidad" hint="Productor de locaciones o de campo. Uno de los dos debe estar en la locación si hay visita de verificación." />
      <TextField s={s} set={set} path={['applicantAddress']} label="Dirección del solicitante" hint="La pide el concepto ambiental (F007)." />
      <YesNo s={s} set={set} path={['notification', 'consent']} label="Autorizo notificación electrónica" hint="Ley 1437 de 2011. Si no autorizas, te notifican por correo físico." />
      {s.notification.consent && (
        <TextField s={s} set={set} path={['notification', 'email']} label="Correo autorizado para notificaciones" type="email" placeholder={s.contacts.production.email || 'correo@productora.co'} hint="Si lo dejas vacío se usa el del responsable de la filmación." />
      )}
    </div>
  );
}

function LocationsStep({ s, set, setState, confirm }: StepProps & { setState: (fn: (prev: WizardState) => WizardState) => void; confirm: (c: Confirmation) => void }) {
  const add = () => setState((prev) => ({ ...prev, locations: [...prev.locations, emptyLocation()] }));
  const remove = (i: number) => setState((prev) => ({ ...prev, locations: prev.locations.filter((_, k) => k !== i) }));
  const duplicate = (i: number) => setState((prev) => {
    const copy = structuredClone(prev.locations[i]);
    copy.name = copy.name ? `${copy.name} (copia)` : '';
    const locations = [...prev.locations];
    locations.splice(i + 1, 0, copy);
    return { ...prev, locations };
  });
  return (
    <div class="grid">
      <p class="note">Una locación es cada espacio público que ocupas: el set y, si está en otro lugar, la base de producción. Cada una lleva sus propias jornadas.</p>
      {s.locations.map((l, i) => {
        const p: Path = ['locations', i];
        return (
          <fieldset class="card location" key={i}>
            <legend class="card-title">Locación {i + 1}{l.name ? `: ${l.name}` : ''}</legend>
            <div class="grid">
              <div class="pair">
                <TextField s={s} set={set} path={[...p, 'name']} label="Nombre del lugar" placeholder="Bulevar del Río" />
                <TextField s={s} set={set} path={[...p, 'neighborhood']} label="Barrio o corregimiento" />
              </div>
              <div class="pair">
                <TextField s={s} set={set} path={[...p, 'address']} label="Dirección" />
                <TextField s={s} set={set} path={[...p, 'mapsUrl']} label="Link de Google Maps" type="url" />
              </div>
              <RadioGroup s={s} set={set} path={[...p, 'use']} label="Uso" inline options={[['set', 'Set de filmación'], ['base', 'Base de producción']]} />
              <RadioGroup s={s} set={set} path={[...p, 'zone']} label="Zona" inline options={[['urban', 'Casco urbano'], ['rural', 'Zona rural']]} />
              <RadioGroup s={s} set={set} path={[...p, 'scale']} label="Escala del espacio público" inline
                hint="Se usa para estimar el valor. En parques y plazas depende del tamaño que les asigna el POT; en vías, de la jerarquía vial (local, colectora, arteria secundaria o principal). Los andenes tienen su propio peso."
                options={SCALES.map(([k, t]) => [k, t] as const)} />
              <CheckboxGroup s={s} set={set} path={[...p, 'spaceTypes']} label="Tipo de espacio público" options={SPACE_TYPES}
                hint="Corredor vial, andenes o ciclorrutas activan el plan de movilidad. Espacio natural activa la sección de áreas naturales del concepto ambiental." />
              <NumberField s={s} set={set} path={[...p, 'areaM2']} label="Área ocupada" suffix="m²" hint="Set, base, equipos y zona de trabajo." />

              <fieldset class="group">
                <legend>Jornadas en esta locación</legend>
                <small>Una fila por bloque de montaje, filmación o desmontaje. Así se liquida el valor a pagar.</small>
                <div class="sessions" role="table" aria-label={`Jornadas de la locación ${i + 1}`}>
                  <div class="row head" role="row"><span role="columnheader">Fecha</span><span role="columnheader">Actividad</span><span role="columnheader">Inicio</span><span role="columnheader">Fin</span><span role="columnheader"><span class="sr-only">Acciones</span></span></div>
                  {l.sessions.map((j, k) => {
                    const pj: Path = [...p, 'sessions', k];
                    return (
                      <div class="row" role="row" key={k}>
                        <span role="cell" class="cell" data-label="Fecha"><input aria-label={`Fecha, jornada ${k + 1}`} type="date" value={j.date} onInput={(ev) => set([...pj, 'date'], (ev.currentTarget as HTMLInputElement).value)} /></span>
                        <span role="cell" class="cell" data-label="Actividad"><select aria-label={`Actividad, jornada ${k + 1}`} value={j.activity} onChange={(ev) => set([...pj, 'activity'], (ev.currentTarget as HTMLSelectElement).value)}>
                          <option value="setup">Montaje</option>
                          <option value="shoot">Filmación</option>
                          <option value="teardown">Desmontaje</option>
                        </select></span>
                        <span role="cell" class="cell" data-label="Inicio"><input aria-label={`Hora inicial, jornada ${k + 1}`} type="time" value={j.start} onInput={(ev) => set([...pj, 'start'], (ev.currentTarget as HTMLInputElement).value)} /></span>
                        <span role="cell" class="cell" data-label="Fin"><input aria-label={`Hora final, jornada ${k + 1}`} type="time" value={j.end} onInput={(ev) => set([...pj, 'end'], (ev.currentTarget as HTMLInputElement).value)} /></span>
                        <span class="row-actions" role="cell">
                          <button type="button" class="icon-btn" title="Duplicar para el día siguiente" aria-label={`Duplicar jornada ${k + 1} para el día siguiente`}
                            onClick={() => { const list = [...l.sessions]; list.splice(k + 1, 0, { ...j, date: nextDay(j.date) }); set([...p, 'sessions'], sortSessions(list)); }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>
                          </button>
                          <button type="button" class="remove" aria-label={`Quitar jornada ${k + 1}`} disabled={l.sessions.length === 1}
                            onClick={() => set([...p, 'sessions'], l.sessions.filter((_, x) => x !== k))}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div class="card-actions">
                  <button type="button" class="btn sm" onClick={() => set([...p, 'sessions'], [...l.sessions, emptySession(l.sessions.at(-1)?.date ?? '')])}>Agregar jornada</button>
                  <button type="button" class="btn sm" disabled={!l.sessions.some((j) => j.date)}
                    onClick={() => {
                      const dates = [...new Set(l.sessions.map((j) => j.date).filter(Boolean))].sort();
                      const last = dates.at(-1)!;
                      const sameDay = l.sessions.filter((j) => j.date === last).map((j) => ({ ...j, date: nextDay(last) }));
                      set([...p, 'sessions'], sortSessions([...l.sessions, ...sameDay]));
                    }}>Repetir el último día</button>
                </div>
              </fieldset>

              <fieldset class="group">
                <legend>Elementos que ocupan el espacio</legend>
                <small>Deja en 0 lo que no uses.</small>
                <div class="elements">
                  {ELEMENTS.map(([k, t]) => (
                    <label class={`element ${(l.elements[k] ?? 0) > 0 ? 'used' : ''}`} key={k}>
                      <input type="number" min={0} inputMode="numeric" value={String(l.elements[k] ?? 0)}
                        onInput={(ev) => set([...p, 'elements', k], Math.max(0, Number((ev.currentTarget as HTMLInputElement).value) || 0))} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {(l.elements.scenery ?? 0) > 0 && <TextField s={s} set={set} path={[...p, 'sceneryNotes']} label="Describe la escenografía" />}
              <TextField s={s} set={set} path={[...p, 'otherElements']} label="Otros elementos" placeholder="Ninguno" />
              <div class="card-actions">
                <button type="button" class="btn sm" onClick={() => duplicate(i)}>Duplicar locación</button>
                {s.locations.length > 1 && <button type="button" class="btn sm ghost danger" onClick={() => confirm({
                  title: `Quitar la locación ${i + 1}`,
                  text: `Se borran ${l.name ? `los datos de ${l.name}` : 'los datos de esta locación'}, con ${l.sessions.length === 1 ? 'su jornada' : `sus ${l.sessions.length} jornadas`} y sus elementos.`,
                  confirmLabel: 'Quitar locación',
                  danger: true,
                  onConfirm: () => remove(i),
                })}>Quitar locación {i + 1}</button>}
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" class="btn" onClick={add}>Agregar otra locación</button>
    </div>
  );
}

function MobilityStep({ s, set }: StepProps) {
  const affected = s.locations.map((l, i) => ({ l, i })).filter(({ l }) => needsMobilityPlan(l));
  if (!affected.length)
    return <p class="note lg">Ninguna locación ocupa corredor vial, andenes o ciclorrutas, así que no necesitas el plan de movilidad (F006). Si vas a cerrar una calle o un andén, márcalo en el tipo de espacio de la locación.</p>;
  return (
    <div class="grid">
      <p class="note">Todos los dispositivos de señalización deben estar certificados según el Manual de Señalización Vial (Resolución 20243040045005 de 2024). La Secretaría de Movilidad emite el concepto.</p>
      {affected.map(({ l, i }) => {
        const p: Path = ['locations', i, 'mobility'];
        const m = l.mobility ?? emptyMobility();
        // Until the first edit the location has no mobility object: read from an empty one and create it on write.
        const view = { ...s, locations: s.locations.map((x, k) => (k === i ? { ...x, mobility: m } : x)) };
        const setMobility = (path: Path, v: unknown) => {
          if (!l.mobility) set(p, { ...emptyMobility(), [path[path.length - 1]]: v });
          else set(path, v);
        };
        return (
          <fieldset class="card" key={i}>
            <legend class="card-title">Locación {i + 1}{l.name ? `: ${l.name}` : ''}</legend>
            <div class="grid">
              <CheckboxGroup s={view} set={setMobility} path={[...p, 'closures']} label="Afectaciones" options={CLOSURES} />
              <div class="pair">
                <TextField s={view} set={setMobility} path={[...p, 'direction']} label="Sentido de la vía" placeholder="norte-sur" />
                <TextField s={view} set={setMobility} path={[...p, 'side']} label="Costado" placeholder="costado derecho" />
              </div>
              <div class="toggles">
                <YesNo s={view} set={setMobility} path={[...p, 'affectsMio']} label="Afecta el MIO" hint="Necesitas autorización de Metro Cali S.A." />
                <YesNo s={view} set={setMobility} path={[...p, 'pedestrianDetour']} label="Desvía senderos peatonales" />
                <YesNo s={view} set={setMobility} path={[...p, 'transitDetour']} label="Desvía rutas de transporte público" />
                <YesNo s={view} set={setMobility} path={[...p, 'notifyTransitCompanies']} label="Socializa con empresas de transporte" />
                <YesNo s={view} set={setMobility} path={[...p, 'privateTrafficDetour']} label="Desvía transporte particular" />
                <YesNo s={view} set={setMobility} path={[...p, 'trafficLights']} label="Modifica intersecciones semaforizadas" />
              </div>
              {m.trafficLights && <TextArea s={view} set={setMobility} path={[...p, 'trafficLightsDetail']} label="Qué intersecciones y cómo" />}
              <TextArea s={view} set={setMobility} path={[...p, 'implementation']} label="Cómo implementarás el plan en campo" placeholder="Kit de señalización, bandereros, auxiliares de tránsito, tiempos de cierre…" />
              <TextArea s={view} set={setMobility} path={[...p, 'signage']} label="Inventario de señalización" placeholder="6 conos reflectivos, 2 vallas, 2 paletas pare/siga" />
              <div class="pair">
                <TextArea s={view} set={setMobility} path={[...p, 'loadingArea']} label="Zona de cargue y descargue" />
                <TextArea s={view} set={setMobility} path={[...p, 'parking']} label="Zona de parqueo de vehículos" />
              </div>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function EnvironmentStep({ s, set }: StepProps) {
  const natural = s.locations.map((l, i) => ({ l, i })).filter(({ l }) => isNaturalArea(l));
  return (
    <div class="grid">
      <CheckboxGroup s={s} set={set} path={['risks', 'effects']} label="Efectos especiales en escena" options={EFFECTS} hint="Si marcas alguno, la Comisión pide un plan de emergencias." />
      {s.risks.effects.includes('other') && <TextField s={s} set={set} path={['risks', 'effectOther']} label="¿Cuál efecto?" />}
      {s.risks.effects.length > 0 && <TextArea s={s} set={set} path={['risks', 'effectsDescription']} label="Describe la escena con efectos" />}

      <Switch label="Hay animales en escena" on={!!s.risks.animals}
        onChange={(v) => set(['risks', 'animals'], v ? { type: '', count: 1, actions: '', handling: '' } : null)} />
      {s.risks.animals && (
        <div class="sub grid">
          <div class="pair">
            <TextField s={s} set={set} path={['risks', 'animals', 'type']} label="Tipo o raza" />
            <NumberField s={s} set={set} path={['risks', 'animals', 'count']} label="Cantidad" />
          </div>
          <TextArea s={s} set={set} path={['risks', 'animals', 'actions']} label="Acciones con los animales" />
          <TextArea s={s} set={set} path={['risks', 'animals', 'handling']} label="Manejo y personal especializado" hint="Según la Política Pública de Ética Interespecie y Protección Animal." />
        </div>
      )}
      <Switch label="Hay armamento en escena" on={!!s.risks.weapons}
        onChange={(v) => set(['risks', 'weapons'], v ? { types: '', count: 1, actions: '' } : null)} />
      {s.risks.weapons && (
        <div class="sub grid">
          <div class="pair">
            <TextField s={s} set={set} path={['risks', 'weapons', 'types']} label="Tipos de armas" />
            <NumberField s={s} set={set} path={['risks', 'weapons', 'count']} label="Cantidad" />
          </div>
          <TextArea s={s} set={set} path={['risks', 'weapons', 'actions']} label="Acciones con las armas" hint="Bajo supervisión de profesionales expertos." />
        </div>
      )}

      <h3 class="divider">Residuos y ruido (F007)</h3>
      <TextArea s={s} set={set} path={['environment', 'wasteTypes']} label="Qué residuos generará el rodaje y cuántos" placeholder="Aprovechables del catering, orgánicos, cartón… en cantidad aproximada." />
      <TextArea s={s} set={set} path={['environment', 'wasteStrategy']} label="Cómo los vas a manejar" placeholder="Puntos de separación, retiro al cierre, entrega a recicladores." />
      <div class="trio">
        <NumberField s={s} set={set} path={['environment', 'amplification', 'count']} label="Equipos de amplificación" />
        <NumberField s={s} set={set} path={['environment', 'generators', 'count']} label="Plantas eléctricas" />
        <NumberField s={s} set={set} path={['environment', 'vehicles', 'count']} label="Vehículos o maquinaria" />
      </div>
      <div class="trio">
        <TextField s={s} set={set} path={['environment', 'amplification', 'type']} label="Tipo o marca" />
        <TextField s={s} set={set} path={['environment', 'generators', 'type']} label="Tipo o marca" />
        <TextField s={s} set={set} path={['environment', 'vehicles', 'type']} label="Tipo o marca" />
      </div>
      <TextField s={s} set={set} path={['environment', 'noiseMitigation']} label="Acciones de mitigación del ruido" />
      <TextArea s={s} set={set} path={['environment', 'sensitiveSites']} label="Instituciones sensibles cercanas" placeholder="Hospitales, hogares geriátricos, colegios, zonas residenciales de bajo ruido." />
      <TextArea s={s} set={set} path={['environment', 'acousticMeasures']} label="Medidas de manejo acústico" placeholder="Equipos insonorizados, ubicación lejos de zonas sensibles, sin alto impacto en la noche…" />

      {natural.length > 0 && <h3 class="divider">Áreas naturales</h3>}
      {natural.map(({ l, i }) => {
        const p: Path = ['locations', i, 'naturalArea'];
        const n = l.naturalArea ?? emptyNaturalArea();
        const view = { ...s, locations: s.locations.map((x, k) => (k === i ? { ...x, naturalArea: n } : x)) };
        const setNatural = (path: Path, v: unknown) => (l.naturalArea ? set(path, v) : set(p, { ...emptyNaturalArea(), [path[path.length - 1]]: v }));
        return (
          <fieldset class="card" key={i}>
            <legend class="card-title">Locación {i + 1}{l.name ? `: ${l.name}` : ''}</legend>
            <div class="grid">
              <TextField s={view} set={setNatural} path={[...p, 'areaName']} label="Nombre del área natural" placeholder="Ecoparque Pance Mágico" />
              <TextArea s={view} set={setNatural} path={[...p, 'activities']} label="Actividades y escenas en el área" />
              <CheckboxGroup s={view} set={setNatural} path={[...p, 'impacts']} label="Impactos posibles" options={IMPACTS} />
              {n.impacts.length > 0 && <TextArea s={view} set={setNatural} path={[...p, 'impactDetail']} label="Describe los impactos" />}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function CommunityStep({ s, set }: StepProps) {
  return (
    <div class="grid">
      <TextArea s={s} set={set} path={['outreach', 'strategies']} label="Cómo vas a informar a la comunidad"
        hint="Reuniones con la Junta de Acción Comunal, volanteo, visitas puerta a puerta, encuentros con colectivos." />
      <TextArea s={s} set={set} path={['outreach', 'positiveImpact']} label="Impacto positivo para el barrio" placeholder="Contratación local, un agradecimiento en créditos, una proyección…" />
      <p class="note">Las evidencias (actas, listados de asistencia, fotos) se pegan en el formato F008 después de descargarlo.</p>
    </div>
  );
}

function DownloadStep({ s, request, forms, generate, generating, save, goTo }: {
  s: WizardState; request: PermitRequest | null; forms: FormCode[]; generate: () => void; generating: boolean; save: () => void; goTo: (n: number) => void;
}) {
  const range = request ? shootRange(request) : null;
  const d = range && range.start ? deadlines(range.start) : null;
  const issues = request ? review(request) : [];
  const toAttach = request ? attachments(request) : [];
  const errors = issues.filter((a) => a.level === 'error');
  const fee = request ? estimateFee(request) : null;
  return (
    <div class="grid">
      {d ? (
        <div class={`deadline-box status-${d.status}`}>
          <p>Primer día en calle: <strong>{longDate(d.firstDay)}</strong></p>
          <p>Radica entre el <strong>{longDate(d.opensOn)}</strong> y el <strong>{longDate(d.deadline)}</strong>.</p>
          <p class="status">
            {d.status === 'late' && 'Ya pasó el plazo mínimo de 20 días hábiles. Escribe a la Comisión Fílmica antes de radicar.'}
            {d.status === 'tight' && `Quedan ${d.businessDaysLeft} días hábiles para radicar.`}
            {d.status === 'on-time' && `Vas a tiempo: quedan ${d.businessDaysLeft} días hábiles.`}
            {d.status === 'early' && 'Todavía no puedes radicar: falta más de 3 meses para el rodaje.'}
          </p>
          <p class="deadline-tip">Radica lo antes posible. La SEPOU tiene hasta 15 días hábiles para revisar y, si devuelve la solicitud por documentos, el tiempo que tardes en completarla corre en tu contra.</p>
        </div>
      ) : (
        <p class="callout">Agrega las fechas de las jornadas en <button type="button" class="link-btn" onClick={() => goTo(2)}>locaciones</button> para calcular el plazo.</p>
      )}

      {fee && (
        <div class="estimate">
          <h4 class="block-title">Valor estimado de la retribución</h4>
          <p class="estimate-value">{fee.exempt ? '$ 0' : formatCop(fee.amount)}</p>
          <p class="hint">
            {fee.exempt
              ? 'Marcaste una exención de pago. Igual debes radicar y adjuntar el soporte.'
              : `(${fee.squareMeterDays} m² por día × ${String(fee.scale.weight).replace('.', ',')} escala ${fee.scale.label.toLowerCase()} × UVT ${fee.uvtYear} de ${formatCop(fee.uvt)}) ÷ 12. Es una aproximación; el valor oficial lo notifica la Alcaldía.`}
          </p>
        </div>
      )}

      <h4 class="block-title">Documentos que vas a descargar</h4>
      <ul class="form-list">
        {forms.map((c) => <li key={c}><strong>{c}</strong> {FORMS[c].title}</li>)}
      </ul>

      {issues.length > 0 && (
        <div class="issue-summary" role="region" aria-labelledby="issues-title">
          <h4 id="issues-title" class="block-title">{errors.length ? `Faltan ${errors.length} ${errors.length === 1 ? 'dato' : 'datos'}` : 'Revisa antes de radicar'}</h4>
          <ul>{issues.map((a, i) => <li key={i} class={a.level}>{a.text}</li>)}</ul>
          <p class="hint">Puedes descargar igual. Lo que falte queda en blanco para completarlo en Word.</p>
        </div>
      )}

      <div class="actions">
        <button type="button" class="btn accent lg" onClick={generate} disabled={generating}>
          {generating ? 'Preparando los formatos…' : `Descargar ${forms.length} formatos (.zip)`}
        </button>
        <button type="button" class="btn" onClick={save}>Guardar respuestas (solicitud.json)</button>
      </div>

      <div class="attachments">
        <h4 class="block-title">Lo que debes pegar o adjuntar</h4>
        <ul>{toAttach.map((a, i) => <li key={i}>{a.text}{a.form && <span class="code-tag">{a.form}</span>}{!a.required && <em> (opcional)</em>}</li>)}</ul>
      </div>

      <h4 class="block-title">Después de descargar</h4>
      <ol class="next-steps">
        <li>Abre cada formato y completa lo que está <mark>resaltado en amarillo</mark>: datos que faltan, fotos y planos por pegar y la firma. Luego quita el resaltado.</li>
        <li>Radica todo en la <a href="https://archivo.cali.gov.co/participacion/publicaciones/161718/radicacion-de-peticiones-quejas-y-reclamos/">plataforma PQRS de la Alcaldía</a>, dirigido a la Subdirección de Espacio Público y Ordenamiento Urbanístico (SEPOU).</li>
        <li>Envía el número de radicado a filmincali@cali.gov.co y aprovechamientoep@cali.gov.co.</li>
        <li>Si falta algún documento, te devuelven la solicitud y tienes 30 días para completarla. Con la documentación completa, la SEPOU tiene 15 días hábiles para revisarla.</li>
        <li>Si es viable, te notifican el valor y la póliza. Tienes 2 días hábiles para pagar y enviar el comprobante y la póliza a aprovechamientoep@cali.gov.co.</li>
        <li>Recibes el acto administrativo de autorización. Mantén visible el aviso oficial durante el rodaje.</li>
      </ol>
      <p class="note">Estima el valor con la <a href="https://www.cali.gov.co/planeacion/publicaciones/183378/tramite-de-aeep/" rel="noopener">calculadora de aprovechamiento económico</a> de la Alcaldía.</p>
      {s.project.name === '' && <span class="sr-only">Sin nombre de proyecto</span>}
    </div>
  );
}
