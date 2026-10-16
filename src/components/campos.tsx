/** Controles del asistente. Todos escriben en el estado por ruta. */
import type { ComponentChildren } from 'preact';
import { leer } from './estado';

export type Ruta = (string | number)[];
export type Fijar = (ruta: Ruta, valor: unknown) => void;
type Base = { e: unknown; set: Fijar; ruta: Ruta; label: string; ayuda?: ComponentChildren };

const id = (ruta: Ruta) => 'c-' + ruta.join('-');

export function Texto({ e, set, ruta, label, ayuda, tipo = 'text', placeholder, ancho }: Base & { tipo?: string; placeholder?: string; ancho?: 'corto' | 'medio' }) {
  const i = id(ruta);
  return (
    <label class={`campo ${ancho ?? ''}`} for={i}>
      <span>{label}</span>
      <input id={i} type={tipo} value={(leer(e, ruta) as string) ?? ''} placeholder={placeholder}
        onInput={(ev) => set(ruta, (ev.currentTarget as HTMLInputElement).value)} />
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

export function Numero({ e, set, ruta, label, ayuda, sufijo }: Base & { sufijo?: string }) {
  const i = id(ruta);
  return (
    <label class="campo corto" for={i}>
      <span>{label}</span>
      <span class="con-sufijo">
        <input id={i} type="number" min={0} inputMode="numeric" value={String((leer(e, ruta) as number) ?? 0)}
          onInput={(ev) => set(ruta, Math.max(0, Number((ev.currentTarget as HTMLInputElement).value) || 0))} />
        {sufijo && <span>{sufijo}</span>}
      </span>
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

export function Area({ e, set, ruta, label, ayuda, placeholder }: Base & { placeholder?: string }) {
  const i = id(ruta);
  return (
    <label class="campo ancho" for={i}>
      <span>{label}</span>
      {ayuda && <small>{ayuda}</small>}
      <textarea id={i} value={(leer(e, ruta) as string) ?? ''} placeholder={placeholder}
        onInput={(ev) => set(ruta, (ev.currentTarget as HTMLTextAreaElement).value)} />
    </label>
  );
}

export function Opciones({ e, set, ruta, label, opciones, ayuda, enLinea }: Base & { opciones: readonly (readonly [string, string])[]; enLinea?: boolean }) {
  const actual = leer(e, ruta);
  const name = ruta.join('-');
  return (
    <fieldset class={`grupo ${enLinea ? 'en-linea' : ''}`}>
      <legend>{label}</legend>
      {ayuda && <small>{ayuda}</small>}
      <div class="opciones">
        {opciones.map(([v, t]) => (
          <label class="casilla" key={v}>
            <input type="radio" name={name} checked={actual === v} onChange={() => set(ruta, v)} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Casillas({ e, set, ruta, label, opciones, ayuda }: Base & { opciones: readonly (readonly [string, string])[] }) {
  const actual = new Set((leer(e, ruta) as string[]) ?? []);
  return (
    <fieldset class="grupo">
      <legend>{label}</legend>
      {ayuda && <small>{ayuda}</small>}
      <div class="opciones columnas">
        {opciones.map(([v, t]) => (
          <label class="casilla" key={v}>
            <input type="checkbox" checked={actual.has(v)} onChange={(ev) => {
              const s = new Set(actual);
              (ev.currentTarget as HTMLInputElement).checked ? s.add(v) : s.delete(v);
              set(ruta, [...s]);
            }} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SiNo({ e, set, ruta, label, ayuda }: Base) {
  const v = !!leer(e, ruta);
  return (
    <label class="casilla sino">
      <input type="checkbox" checked={v} onChange={(ev) => set(ruta, (ev.currentTarget as HTMLInputElement).checked)} />
      <span><strong>{label}</strong>{ayuda && <small> {ayuda}</small>}</span>
    </label>
  );
}

/** Activa o desactiva un bloque opcional (animales, armas, movilidad…). */
export function Interruptor({ activo, onCambio, label, ayuda }: { activo: boolean; onCambio: (v: boolean) => void; label: string; ayuda?: string }) {
  return (
    <label class="casilla interruptor">
      <input type="checkbox" checked={activo} onChange={(ev) => onCambio((ev.currentTarget as HTMLInputElement).checked)} />
      <span><strong>{label}</strong>{ayuda && <small> {ayuda}</small>}</span>
    </label>
  );
}
