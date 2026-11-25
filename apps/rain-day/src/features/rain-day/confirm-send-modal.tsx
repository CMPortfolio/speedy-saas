'use client';

import { Button } from '@speedy/ui/button';
import { Modal } from '@speedy/ui/modal';

export function texts(n: number): string {
  return `${n} ${n === 1 ? 'text' : 'texts'}`;
}

export interface ConfirmSendModalProps {
  open: boolean;
  sending: boolean;
  count: number;
  skipped: number;
  newDay: string;
  /** Practice mode: nothing is texted, the messages show on the practice phone. */
  practice?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** One last look before texts go out: they cannot be taken back. */
export function ConfirmSendModal(props: ConfirmSendModalProps) {
  const { open, sending, count, skipped, newDay, practice = false, onCancel, onConfirm } = props;
  return (
    <Modal
      open={open}
      onClose={() => !sending && onCancel()}
      title={practice ? `Send ${texts(count)} as practice?` : `Send ${texts(count)}?`}
      description={
        practice
          ? `Nothing is texted to anyone. Each customer's message moving them to ${newDay} shows on the practice phone.${
              skipped > 0 ? ` ${skipped} who opted out will be skipped.` : ''
            }`
          : `Each customer gets their own message moving them to ${newDay}.${
              skipped > 0 ? ` ${skipped} who opted out will be skipped.` : ''
            } You can't take a text back.`
      }
      footer={
        <>
          <Button variant="secondary" disabled={sending} onClick={onCancel}>
            Not yet
          </Button>
          <Button loading={sending} onClick={onConfirm}>
            {practice ? 'Send as practice' : 'Send now'}
          </Button>
        </>
      }
    />
  );
}
