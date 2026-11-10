'use client';

import { useEffect, useRef } from 'react';

/**
 * Diálogo nativo (<dialog>): encierra el foco y se cierra con Escape.
 * En celular sube como hoja desde abajo; desde 640 px aparece centrado.
 * @param {{
 *   open: boolean,
 *   onClose: () => void,           // Escape, clic en el fondo (si dismissible)
 *   labelledBy: string,            // id del título del diálogo
 *   dismissible?: boolean,         // false = el clic en el fondo no lo cierra
 *   className?: string,
 *   children: React.ReactNode,
 * }} props
 */
export default function Modal({ open, onClose, labelledBy, dismissible = true, className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Escape: el padre decide qué pasa (cerrar o, por ejemplo, terminar la compra)
  function handleCancel(e) {
    e.preventDefault();
    onClose?.();
  }

  function handleClick(e) {
    if (dismissible && e.target === ref.current) onClose?.();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClick={handleClick}
      className={
        'mx-auto mt-auto mb-0 w-full max-w-full max-h-full border-0 bg-transparent p-0 text-ink sm:m-auto ' +
        'backdrop:bg-[rgba(6,13,34,.5)] backdrop:backdrop-blur-[4px]'
      }
    >
      <div
        className={
          'mx-auto max-h-[94vh] max-w-[460px] animate-sheet-up overflow-auto rounded-t-[26px] bg-bg ' +
          'px-[18px] pt-[22px] pb-[calc(20px+env(safe-area-inset-bottom))] sm:animate-sheet-in sm:rounded-[26px] ' +
          className
        }
      >
        <div aria-hidden="true" className="mx-auto -mt-2 mb-4 h-1 w-10 rounded bg-line" />
        {children}
      </div>
    </dialog>
  );
}
