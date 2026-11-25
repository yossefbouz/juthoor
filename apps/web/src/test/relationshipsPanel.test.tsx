import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { RelationshipsPanel } from '@/components/person/RelationshipsPanel';
import { openOrCreateMessageThread } from '@/data/user/messages';
import {
  raiseRelationshipDisputeAction,
  resolveRelationshipDisputeAction,
} from '@/data/user/relationshipDisputes';
import type { RelationshipItem } from '@/lib/tree/relationshipFlags';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Keep the server-only action modules out of jsdom.
vi.mock('@/data/user/relationshipDisputes', () => ({
  raiseRelationshipDisputeAction: vi.fn(),
  resolveRelationshipDisputeAction: vi.fn(async () => ({})),
  validateRelationshipAction: vi.fn(async () => ({})),
}));
vi.mock('@/data/user/messages', () => ({
  openOrCreateMessageThread: vi.fn(async () => 'thread-9'),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const item = (overrides: Partial<RelationshipItem>): RelationshipItem => ({
  role: 'father',
  personId: 'p-father',
  nameAr: 'أحمد',
  nameEn: 'Ahmad',
  relationType: 'parent',
  validated: false,
  openDisputes: [],
  ...overrides,
});

function renderPanel(items: RelationshipItem[], canResolve = false) {
  return render(
    <LocaleProvider>
      <RelationshipsPanel treeId="t1" focusPersonId="p-focus" items={items} canResolve={canResolve} />
    </LocaleProvider>,
  );
}

describe('RelationshipsPanel — Validate / Dispute per relationship', () => {
  it('renders nothing when the person has no relationships', () => {
    const { container } = renderPanel([]);
    expect(container.textContent).toBe('');
  });

  it('offers Validate and Dispute for each parent, spouse and child, with a Validated badge per link', () => {
    renderPanel([
      item({ validated: true }),
      item({ role: 'spouse', personId: 'p-wife', nameAr: 'مريم', relationType: 'spouse' }),
      item({ role: 'child', personId: 'p-son', nameAr: 'يوسف' }),
    ]);
    expect(screen.queryByText('أحمد')).not.toBeNull();
    expect(screen.queryByText('مريم')).not.toBeNull();
    expect(screen.queryByText('يوسف')).not.toBeNull();
    // one link is already Validated; the other two can still be validated
    expect(screen.getAllByText('تم توثيق الصلة')).toHaveLength(1);
    expect(screen.getAllByText('توثيق الصلة')).toHaveLength(2);
    expect(screen.getAllByText('اعترض على الصلة')).toHaveLength(3);
  });

  it('raises a dispute on the chosen relationship and goes to the message thread', async () => {
    vi.mocked(raiseRelationshipDisputeAction).mockResolvedValue({
      dispute: {} as never,
      threadId: 'thread-1',
    });
    renderPanel([item({ role: 'spouse', personId: 'p-wife', relationType: 'spouse' })]);

    fireEvent.click(screen.getByText('اعترض على الصلة'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' not married ' } });
    fireEvent.click(screen.getByText('إرسال'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/messages/thread-1'));
    expect(raiseRelationshipDisputeAction).toHaveBeenCalledWith({
      treeId: 't1',
      personA: 'p-focus',
      personB: 'p-wife',
      relationType: 'spouse',
      note: 'not married',
    });
  });

  it('stays on the page when there is no thread (the tree owner disputing their own tree)', async () => {
    vi.mocked(raiseRelationshipDisputeAction).mockResolvedValue({
      dispute: {} as never,
      threadId: null,
    });
    renderPanel([item({})]);

    fireEvent.click(screen.getByText('اعترض على الصلة'));
    fireEvent.click(screen.getByText('إرسال'));

    await waitFor(() => expect(screen.queryByText('تم تسجيل الاعتراض.')).not.toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a tree writer the open dispute with its note, and resolving it removes it', async () => {
    renderPanel(
      [
        item({
          openDisputes: [{ id: 'd-1', note: 'Wrong father', mine: false, canMessage: true }],
        }),
        item({ role: 'mother', personId: 'p-mother', nameAr: 'فاطمة' }),
      ],
      true,
    );
    expect(screen.getAllByText('نزاع مفتوح')).toHaveLength(1);
    expect(screen.queryByText('Wrong father')).not.toBeNull();

    fireEvent.click(screen.getByText('تمت المعالجة'));

    await waitFor(() => expect(screen.queryByText('نزاع مفتوح')).toBeNull());
    expect(resolveRelationshipDisputeAction).toHaveBeenCalledWith({
      disputeId: 'd-1',
      status: 'resolved',
      treeId: 't1',
      personId: 'p-focus',
    });
  });

  it('dismisses a dispute', async () => {
    renderPanel(
      [item({ openDisputes: [{ id: 'd-2', note: null, mine: false, canMessage: false }] })],
      true,
    );
    fireEvent.click(screen.getByText('رفض الاعتراض'));
    await waitFor(() =>
      expect(resolveRelationshipDisputeAction).toHaveBeenCalledWith(
        expect.objectContaining({ disputeId: 'd-2', status: 'dismissed' }),
      ),
    );
    // not a party to the thread (a collaborator): no conversation button
    expect(screen.queryByText('فتح المحادثة')).toBeNull();
  });

  it('gives the person who raised a dispute its thread, but no resolve buttons and no second dispute', async () => {
    renderPanel([
      item({ openDisputes: [{ id: 'd-3', note: 'mine', mine: true, canMessage: true }] }),
    ]);
    expect(screen.queryByText('نزاع مفتوح')).not.toBeNull();
    expect(screen.queryByText('تمت المعالجة')).toBeNull();
    expect(screen.queryByText('رفض الاعتراض')).toBeNull();
    expect(screen.queryByText('اعترض على الصلة')).toBeNull();

    fireEvent.click(screen.getByText('فتح المحادثة'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/messages/thread-9'));
    expect(openOrCreateMessageThread).toHaveBeenCalledWith({
      contextType: 'relationship_dispute',
      contextId: 'd-3',
    });
  });

  it('shows the error when the dispute cannot be closed', async () => {
    vi.mocked(resolveRelationshipDisputeAction).mockRejectedValueOnce(
      new Error('Dispute not found or not permitted'),
    );
    renderPanel(
      [item({ openDisputes: [{ id: 'd-4', note: null, mine: false, canMessage: false }] })],
      true,
    );
    fireEvent.click(screen.getByText('تمت المعالجة'));
    await waitFor(() =>
      expect(screen.queryByText('Dispute not found or not permitted')).not.toBeNull(),
    );
    expect(screen.queryByText('نزاع مفتوح')).not.toBeNull();
  });
});
