'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  readonly treeId: string;
}

/**
 * Plain anchor disguised as a button. The server route streams the
 * GEDCOM 7.0 .ged file with the correct `Content-Disposition` so the
 * browser downloads it without us touching Blob APIs.
 */
export function ExportGedcomButton({ treeId }: Props) {
  return (
    <Button asChild variant="outline">
      <a
        href={`/api/tree/${treeId}/gedcom`}
        download
        title="Export GEDCOM 7.0"
        className="inline-flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        تصدير GEDCOM 7
      </a>
    </Button>
  );
}
