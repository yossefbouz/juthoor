'use client';

import { useEffect, useRef } from 'react';

import { logAccessAction } from '@/data/user/accessLog';

/**
 * Best-effort access_log row when a logged-in viewer opens a living person page
 * (or another sensitive person surface). Failures never block the page.
 */
export function PersonAccessLogger({
  personId,
  resourceType = 'person_page',
  enabled = true,
}: {
  readonly personId: string;
  readonly resourceType?:
    | 'person_page'
    | 'person_displacement'
    | 'person_story';
  readonly enabled?: boolean;
}) {
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !personId || loggedRef.current) return;
    loggedRef.current = true;
    void logAccessAction({
      resourceType,
      resourceId: personId,
      action: 'view',
    });
  }, [enabled, personId, resourceType]);

  return null;
}
