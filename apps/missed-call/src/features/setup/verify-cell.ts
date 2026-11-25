import { appError, err, type Result } from '@speedy/lib/result';

/**
 * The seam for confirming the owner's cell with a one-time code (6 digits, hashed, 10 minutes,
 * 5 attempts, rate-limited sends). The shared helper lands in packages/sms with rain-day R4;
 * until then `unavailableVerifier` is used and `lines.owner_cell_verified` stays false, so replies
 * are saved and listed but not forwarded.
 */
export interface OwnerCellVerifier {
  /** Text a code to the line's owner cell. */
  start(input: { lineId: string }): Promise<Result<{ sent: true }>>;
  /** Check the code; on success the server sets `owner_cell_verified`. */
  confirm(input: { lineId: string; code: string }): Promise<Result<{ verified: true }>>;
}

export const unavailableVerifier: OwnerCellVerifier = {
  async start() {
    return err(appError('verification_unavailable', 'Confirming your cell is not available yet.'));
  },
  async confirm() {
    return err(appError('verification_unavailable', 'Confirming your cell is not available yet.'));
  },
};

/** The verifier the app uses. Swap for the real one when the shared helper is wired in. */
export function getVerifier(): OwnerCellVerifier {
  return unavailableVerifier;
}
