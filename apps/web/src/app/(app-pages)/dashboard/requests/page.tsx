import { Suspense } from 'react';
import { listIncomingRequests } from '@/data/user/access';
import { listMyContactRelays } from '@/data/user/contactRelay';
import { listIncomingPersonClaims } from '@/data/user/personLink';
import { RequestsClient } from './RequestsClient';

async function RequestsShell() {
  const [requests, relays, personClaims] = await Promise.all([
    listIncomingRequests().catch(() => []),
    listMyContactRelays().catch(() => ({ outgoing: [], incoming: [] })),
    listIncomingPersonClaims().catch(() => []),
  ]);
  return (
    <RequestsClient
      initialRequests={requests}
      contactOutgoing={relays.outgoing}
      contactIncoming={relays.incoming}
      personClaims={personClaims}
    />
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <RequestsClient
          initialRequests={[]}
          contactOutgoing={[]}
          contactIncoming={[]}
          personClaims={[]}
        />
      }
    >
      <RequestsShell />
    </Suspense>
  );
}
