import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getThreadMessages } from '@/data/user/messages';
import { ThreadClient } from './ThreadClient';

async function ThreadContainer({ threadId }: { threadId: string }) {
  const { thread, messages } = await getThreadMessages(threadId);
  if (!thread) notFound();
  return <ThreadClient thread={thread} initialMessages={messages} />;
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading thread…
        </div>
      }
    >
      <ThreadContainer threadId={threadId} />
    </Suspense>
  );
}
