import { useEffect, useRef } from 'preact/hooks';

export type Confirmacion = {
  titulo: string;
  texto: string;
  confirmar: string;
  peligro?: boolean;
  accion: () => void;
};

/** Modal de confirmación de la app, sobre <dialog> nativo: atrapa el foco y cierra con Esc. */
export function Confirmar({ c, cerrar }: { c: Confirmacion | null; cerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (c && !d.open) {
      d.showModal();
      cancelar.current?.focus();
    }
    if (!c && d.open) d.close();
  }, [c]);

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-labelledby="modal-titulo"
      aria-describedby="modal-texto"
      onClose={cerrar}
      onClick={(e) => { if (e.target === ref.current) cerrar(); }}
    >
      {c && (
        <div class="modal-caja">
          <h2 id="modal-titulo" class="modal-titulo">{c.titulo}</h2>
          <p id="modal-texto" class="modal-texto">{c.texto}</p>
          <div class="modal-acciones">
            <button ref={cancelar} type="button" class="boton" onClick={cerrar}>Cancelar</button>
            <button
              type="button"
              class={`boton ${c.peligro ? 'peligro-lleno' : 'principal'}`}
              onClick={() => { c.accion(); cerrar(); }}
            >
              {c.confirmar}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
