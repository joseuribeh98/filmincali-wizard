import { useEffect, useRef } from 'preact/hooks';

export type Confirmation = {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

/** The app's confirmation dialog, built on the native <dialog>: it traps focus and closes with Esc. */
export function ConfirmDialog({ request, onClose }: { request: Confirmation | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (request && !d.open) {
      d.showModal();
      cancel.current?.focus();
    }
    if (!request && d.open) d.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-labelledby="modal-title"
      aria-describedby="modal-text"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {request && (
        <div class="modal-box">
          <h2 id="modal-title" class="modal-title">{request.title}</h2>
          <p id="modal-text" class="modal-text">{request.text}</p>
          <div class="modal-actions">
            <button ref={cancel} type="button" class="btn" onClick={onClose}>Cancelar</button>
            <button
              type="button"
              class={`btn ${request.danger ? 'danger-solid' : 'primary'}`}
              onClick={() => { request.onConfirm(); onClose(); }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
