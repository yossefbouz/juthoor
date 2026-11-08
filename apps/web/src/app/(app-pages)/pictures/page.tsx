import { Suspense } from 'react';
import { loadPictureArchive } from '@/data/user/archives';
import { PicturesClient } from './PicturesClient';

async function PicturesContainer() {
  const pictures = await loadPictureArchive();
  return <PicturesClient pictures={pictures} />;
}

export default function PicturesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading pictures…
        </div>
      }
    >
      <PicturesContainer />
    </Suspense>
  );
}
