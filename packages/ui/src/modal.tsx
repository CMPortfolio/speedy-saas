'use client';

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode, SyntheticEvent } from 'react';

import { Button } from './button';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  /** Called when the owner presses Escape, taps the close button or taps the backdrop. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons for the bottom of the dialog. */
  footer?: ReactNode;
  className?: string;
}

/**
 * A native `<dialog>` opened with `showModal()`, so the browser handles the focus trap,
 * Escape and the backdrop. Labelled by its title for screen readers.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Escape: keep the dialog in sync with `open` instead of letting it close on its own.
    event.preventDefault();
    onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-screen-sm rounded-brand border border-border',
        'bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/50',
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </Button>
        </div>
        {children}
        {footer && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
