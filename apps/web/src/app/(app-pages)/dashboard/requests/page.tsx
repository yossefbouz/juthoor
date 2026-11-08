import { Suspense } from 'react';
import { listIncomingRequests } from '@/data/user/access';
import { listMyContactRelays } from '@/data/user/contactRelay';
import { RequestsClient } from './RequestsClient';

async function RequestsShell() {
  const [requests, relays] = await Promise.all([
    listIncomingRequests().catch(() => []),
    listMyContactRelays().catch(() => ({ outgoing: [], incoming: [] })),
  ]);
  return (
    <RequestsClient
      initialRequests={requests}
      contactOutgoing={relays.outgoing}
      contactIncoming={relays.incoming}
    />
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <RequestsClient initialRequests={[]} contactOutgoing={[]} contactIncoming={[]} />
      }
    >
      <RequestsShell />
    </Suspense>
  );
}
