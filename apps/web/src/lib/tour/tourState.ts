/**
 * Whether a member has finished (or skipped) the first-run tour.
 *
 * The flag lives in the Supabase auth user metadata so it follows the member
 * across devices without a database migration, with localStorage as the
 * fallback when that write does not go through. user_metadata is editable by
 * the member, which is fine here: it only decides whether a tour opens, never
 * what anyone may read or write.
 */
export const TOUR_DONE_METADATA_KEY = 'juthoor_tour_done';

/** The replay link ("Take the tour" in the user menu). */
export const TOUR_REPLAY_PARAM = 'tour';
export const TOUR_REPLAY_HREF = `/dashboard?${TOUR_REPLAY_PARAM}=1`;

const storageKey = (userId: string) => `juthoor.tourDone.${userId}`;

export function isTourDoneInMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[TOUR_DONE_METADATA_KEY] === true;
}

export function readLocalTourDone(userId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function writeLocalTourDone(userId: string): void {
  try {
    window.localStorage.setItem(storageKey(userId), '1');
  } catch {
    // ignore quota / private mode
  }
}

/** The tour opens by itself only when neither store says it is done. */
export function shouldShowTour({
  metadataDone,
  localDone,
}: {
  metadataDone: boolean;
  localDone: boolean;
}): boolean {
  return !metadataDone && !localDone;
}
