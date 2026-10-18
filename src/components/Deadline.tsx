import { useEffect, useState } from 'preact/hooks';
import { deadlines } from '../lib/permit/derive';
import { longDate, subtractMonths, todayIso } from '../lib/permit/calendar';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const parts = (value: string) => {
  const d = new Date(value + 'T00:00:00Z');
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], weekday: WEEKDAYS[d.getUTCDay()] };
};

/** Defaults to the longest window: a shoot 3 months from now, which can be filed today. */
const suggested = () => subtractMonths(todayIso(), -3);

const STATUS_LABEL = { late: 'Fuera de plazo', tight: 'Urgente', early: 'Muy pronto para radicar', 'on-time': 'A tiempo' } as const;

export default function Deadline() {
  const [day, setDay] = useState(suggested);
  // The static HTML is built with the build date; on load it is recomputed with today's date.
  useEffect(() => setDay(suggested()), []);
  const d = day ? deadlines(day) : null;
  const limit = d ? parts(d.deadline) : null;
  const minimum = 20;
  const progress = d ? Math.max(0, Math.min(1, d.businessDaysLeft / 60)) : 0;
  return (
    <div class={`deadline status-${d?.status ?? 'on-time'}`}>
      <div class="deadline-head">
        <span>Calcula tu fecha límite</span>
        {d && <span class="deadline-status">{STATUS_LABEL[d.status]}</span>}
      </div>
      <label class="deadline-day" for="deadline-day">
        <span>Primer día de rodaje</span>
        <input id="deadline-day" type="date" value={day} onInput={(e) => setDay((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="deadline-limit" aria-live="polite">
        <span class="deadline-label">Radica a más tardar el</span>
        {limit ? (
          <div class="deadline-date">
            <strong>{limit.day}</strong>
            <span>{limit.month}<br /><em>{limit.weekday}</em></span>
          </div>
        ) : (
          <div class="deadline-date"><span>Elige la fecha del rodaje</span></div>
        )}
        {d && <span class="sr-only">{longDate(d.deadline)}</span>}
      </div>
      {d && (
        <div class="deadline-bar" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
      )}
      <p class="deadline-note">
        {d?.status === 'late' && `Ya no alcanzas los ${minimum} días hábiles de anticipación. Escribe a la Comisión Fílmica antes de radicar.`}
        {d?.status === 'tight' && `Quedan ${d.businessDaysLeft} días hábiles para radicar.`}
        {d?.status === 'on-time' && `Quedan ${d.businessDaysLeft} días hábiles. ${d.opensOn <= todayIso() ? 'Ya puedes radicar.' : `Puedes radicar desde el ${longDate(d.opensOn)}.`}`}
        {d?.status === 'early' && `Podrás radicar desde el ${longDate(d.opensOn)}.`}
        {!d && 'Elige una fecha.'}
      </p>
    </div>
  );
}
