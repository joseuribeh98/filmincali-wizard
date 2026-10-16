import { useEffect, useState } from 'preact/hooks';
import { plazos } from '../lib/pufa/derivar';
import { fechaLarga, hoyIso, restarMeses } from '../lib/pufa/calendario';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const partes = (f: string) => {
  const d = new Date(f + 'T00:00:00Z');
  return { dia: d.getUTCDate(), mes: MES[d.getUTCMonth()], semana: DIA[d.getUTCDay()] };
};

/** Por defecto, el plazo más largo: un rodaje dentro de 3 meses, que se puede radicar desde hoy. */
const sugerido = () => restarMeses(hoyIso(), -3);

export default function Plazo() {
  const [dia, setDia] = useState(sugerido);
  // En el sitio estático el HTML se genera con la fecha del build; al cargar se recalcula con la de hoy.
  useEffect(() => setDia(sugerido()), []);
  const p = dia ? plazos(dia) : null;
  const l = p ? partes(p.limite) : null;
  const total = 20;
  const progreso = p ? Math.max(0, Math.min(1, p.habilesRestantes / 60)) : 0;
  return (
    <div class={`plazo estado-${p?.estado ?? 'a-tiempo'}`}>
      <div class="plazo-cab">
        <span>Calcula tu fecha límite</span>
        {p && <span class="plazo-estado">{p.estado === 'tarde' ? 'Fuera de plazo' : p.estado === 'justo' ? 'Urgente' : p.estado === 'temprano' ? 'Muy pronto para radicar' : 'A tiempo'}</span>}
      </div>
      <label class="plazo-dia" for="plazo-dia">
        <span>Primer día de rodaje</span>
        <input id="plazo-dia" type="date" value={dia} onInput={(e) => setDia((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="plazo-limite" aria-live="polite">
        <span class="plazo-etq">Radica a más tardar el</span>
        {l ? (
          <div class="plazo-fecha">
            <strong>{l.dia}</strong>
            <span>{l.mes}<br /><em>{l.semana}</em></span>
          </div>
        ) : (
          <div class="plazo-fecha"><span>Elige la fecha del rodaje</span></div>
        )}
        {p && <span class="sr-only">{fechaLarga(p.limite)}</span>}
      </div>
      {p && (
        <div class="plazo-barra" aria-hidden="true"><span style={{ width: `${progreso * 100}%` }} /></div>
      )}
      <p class="plazo-nota">
        {p?.estado === 'tarde' && `Ya no alcanzas los ${total} días hábiles de anticipación. Escribe a la Comisión Fílmica antes de radicar.`}
        {p?.estado === 'justo' && `Quedan ${p.habilesRestantes} días hábiles para radicar.`}
        {p?.estado === 'a-tiempo' && `Quedan ${p.habilesRestantes} días hábiles. ${p.apertura <= hoyIso() ? 'Ya puedes radicar.' : `Puedes radicar desde el ${fechaLarga(p.apertura)}.`}`}
        {p?.estado === 'temprano' && `Podrás radicar desde el ${fechaLarga(p.apertura)}.`}
        {!p && 'Elige una fecha.'}
      </p>
    </div>
  );
}
