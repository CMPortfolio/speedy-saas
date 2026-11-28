'use client';

import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@speedy/ui/button';

export interface PickedContact {
  name: string;
  tel: string;
}

/** The Contact Picker API (Chrome on Android, Safari on iOS). Not in lib.dom yet. */
interface ContactsManagerLike {
  select(
    properties: readonly ('name' | 'tel')[],
    options?: { multiple?: boolean },
  ): Promise<{ name?: string[]; tel?: string[] }[]>;
}

export function contactPickerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof window !== 'undefined' &&
    'ContactsManager' in window
  );
}

const noop = () => () => undefined;

export interface ContactsPickerButtonProps {
  /** Called with one entry per contact that had a phone number. */
  onPicked: (contacts: PickedContact[]) => void;
  /** Rendered next to the button, only when the picker is available. */
  aside?: ReactNode;
}

/**
 * "Pick from phone contacts". Renders nothing on browsers without the Contact Picker API, so
 * desktop owners only see the paste box and the file input. Support is read after hydration
 * (server snapshot false) so the server and first client render match.
 */
export function ContactsPickerButton({ onPicked, aside }: ContactsPickerButtonProps) {
  const supported = useSyncExternalStore(noop, contactPickerSupported, () => false);
  const [busy, setBusy] = useState(false);

  if (!supported) return null;

  async function pick() {
    const contacts = (navigator as Navigator & { contacts?: ContactsManagerLike }).contacts;
    if (!contacts) return;
    setBusy(true);
    try {
      const picked = await contacts.select(['name', 'tel'], { multiple: true });
      onPicked(
        picked
          .filter((c) => c.tel?.[0])
          .map((c) => ({ name: c.name?.[0] ?? '', tel: c.tel?.[0] ?? '' })),
      );
    } catch {
      // The owner closed the picker or denied access. Nothing to do.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Button type="button" variant="secondary" loading={busy} onClick={pick}>
        Pick from phone contacts
      </Button>
      {aside}
    </div>
  );
}
