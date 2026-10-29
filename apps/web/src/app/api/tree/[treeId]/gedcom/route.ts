import { NextRequest, NextResponse } from 'next/server';

import { exportTreeToSnapshot } from '@/lib/gedcom/exportPipeline';
import { importGedcomSnapshot } from '@/lib/gedcom/importPipeline';
import { parseGedcom } from '@/lib/gedcom/parse';
import { serializeGedcom } from '@/lib/gedcom/serialize';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB per Step-3 decision

interface Params {
  readonly params: Promise<{ readonly treeId: string }>;
}

// ============================================================================
// GET — download tree as a .ged file
// ============================================================================
export async function GET(_req: NextRequest, { params }: Params) {
  const { treeId } = await params;

  try {
    const supabase = await createJuthoorSupabaseClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: 'Sign in to export a tree' },
        { status: 401 }
      );
    }

    const { data: tree, error: treeError } = await supabase
      .from('trees')
      .select('owner_id')
      .eq('id', treeId)
      .maybeSingle();
    if (treeError) throw new Error(treeError.message);
    if (!tree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
    }

    // Decision D5: only the tree's IFT Administrator exports living
    // people's details; every other reader gets them masked.
    const snapshot = await exportTreeToSnapshot(supabase, treeId, {
      maskLivingPeople: tree.owner_id !== userId,
    });
    const gedcom = serializeGedcom(snapshot);

    return new NextResponse(gedcom, {
      status: 200,
      headers: {
        'Content-Type': 'text/vnd.familysearch.gedcom; charset=utf-8',
        'Content-Disposition': `attachment; filename="juthoor-tree-${treeId.slice(0, 8)}.ged"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// POST — upload a .ged file and import into the tree
// ============================================================================
export async function POST(req: NextRequest, { params }: Params) {
  const { treeId } = await params;

  try {
    const contentType = req.headers.get('content-type') ?? '';
    let rawGedcom: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file uploaded under "file" field' },
          { status: 400 }
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: `File exceeds the 5 MB limit (got ${Math.round(file.size / 1024)} KB)`,
          },
          { status: 413 }
        );
      }
      rawGedcom = await file.text();
    } else {
      const bodyText = await req.text();
      if (bodyText.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: 'Body exceeds the 5 MB limit' },
          { status: 413 }
        );
      }
      rawGedcom = bodyText;
    }

    if (!rawGedcom.trim()) {
      return NextResponse.json(
        { error: 'Uploaded GEDCOM is empty' },
        { status: 400 }
      );
    }

    const snapshot = parseGedcom(rawGedcom);
    const supabase = await createJuthoorSupabaseClient();
    const summary = await importGedcomSnapshot(supabase, treeId, snapshot);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
