import { Suspense } from 'react';
import { listMyMessageThreads } from '@/data/user/messages';
import { MessagesListClient } from './MessagesListClient';

async function MessagesContainer() {
  const threads = await listMyMessageThreads();
  return <MessagesListClient threads={threads} />;
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading messages…
        </div>
      }
    >
      <MessagesContainer />
    </Suspense>
  );
}
