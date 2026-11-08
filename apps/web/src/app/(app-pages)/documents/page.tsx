import { Suspense } from 'react';
import { loadDocumentArchive } from '@/data/user/archives';
import { DocumentsClient } from './DocumentsClient';

async function DocumentsContainer() {
  const documents = await loadDocumentArchive();
  return <DocumentsClient documents={documents} />;
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading documents…
        </div>
      }
    >
      <DocumentsContainer />
    </Suspense>
  );
}
