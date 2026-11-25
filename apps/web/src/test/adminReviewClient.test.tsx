import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { AdminReviewClient } from '@/app/(app-pages)/admin/review/AdminReviewClient';
import { getHiddenReviewCount, listReviewQueue, type ReviewCard } from '@/data/admin/review';

// Keep the server-only action module and the Next router out of jsdom.
vi.mock('@/data/admin/review', () => ({
  getHiddenReviewCount: vi.fn(),
  listReviewQueue: vi.fn(),
  rescoreMatch: vi.fn(),
  resolveMatchAction: vi.fn(),
}));
vi.mock('@/components/admin/AdminStaffNav', () => ({ AdminStaffNav: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function card(matchId: string, score: number, belowFloor: boolean, living = false): ReviewCard {
  const person = (id: string, name: string, isLiving: boolean) => ({
    id,
    displayNameAr: name,
    displayNameEn: name,
    treeName: 'شجرة',
    isLiving,
  });
  return {
    matchId,
    score,
    scorePct: score / 100,
    status: 'pending',
    decision: 'review',
    livingInvolved: living,
    vetoes: [],
    personA: person(`${matchId}-a`, `${matchId} أ`, false),
    personB: person(`${matchId}-b`, `${matchId} ب`, living),
    fields: [],
    createdAt: '2026-11-25T00:00:00Z',
    perfectMatchBlocked: false,
    belowFloor,
  };
}

function renderReview(cards: ReviewCard[], hidden: { count: number; floor: number | null }) {
  return render(
    <LocaleProvider>
      <AdminReviewClient initialCards={cards} initialHidden={hidden} />
    </LocaleProvider>,
  );
}

const SHOW_HIDDEN = /عرض المطابقات المخفية/; // "Show hidden pairs"
const BACK_TO_QUEUE = /العودة إلى الطابور/; // "Back to the queue"
const DEFER = /تأجيل للمالكَين/; // "Defer to owners"
const LOAD_MORE = /تحميل المزيد/; // "Load more"

describe('AdminReviewClient — pairs hidden by the review floor', () => {
  it('says how many pairs are hidden and what the floor is', () => {
    renderReview([card('m-high', 60, false)], { count: 3, floor: 30 });
    const banner = screen.getByText(/أقل من حد المراجعة/);
    expect(banner.textContent).toContain('3');
    expect(banner.textContent).toContain('30');
    expect(screen.queryByRole('button', { name: SHOW_HIDDEN })).not.toBeNull();
  });

  it('shows no banner when nothing is hidden', () => {
    renderReview([card('m-high', 60, false)], { count: 0, floor: 30 });
    expect(screen.queryByText(/أقل من حد المراجعة/)).toBeNull();
    expect(screen.queryByRole('button', { name: SHOW_HIDDEN })).toBeNull();
  });

  it('lists the hidden pairs on request and does not offer to send them to owners', async () => {
    vi.mocked(listReviewQueue).mockResolvedValue([
      card('m-low', 20, true),
      card('m-low-living', 15, true, true),
    ]);
    vi.mocked(getHiddenReviewCount).mockResolvedValue({ count: 2, floor: 30 });

    renderReview([card('m-high', 60, false)], { count: 2, floor: 30 });
    // In the queue the pair can be deferred to its owners.
    expect((screen.getByRole('button', { name: DEFER }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: SHOW_HIDDEN }));
    await waitFor(() => expect(screen.queryByText('m-low أ')).not.toBeNull());

    expect(listReviewQueue).toHaveBeenCalledWith({ hidden: true });
    expect(screen.queryByText('m-high أ')).toBeNull();
    expect(screen.queryByRole('button', { name: BACK_TO_QUEUE })).not.toBeNull();

    const deferButtons = screen.getAllByRole('button', { name: DEFER }) as HTMLButtonElement[];
    expect(deferButtons.map((b) => b.disabled)).toEqual([true, true]);
    // Approving a pair with a living person would also go to the owners.
    const approveLiving = screen.getByRole('button', { name: /اعتماد/ }) as HTMLButtonElement;
    expect(approveLiving.disabled).toBe(true);
    // A deceased pair below the floor can still be merged or rejected by the admin.
    expect((screen.getByRole('button', { name: /دمج/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getAllByRole('button', { name: /رفض/ }) as HTMLButtonElement[]).every((b) => !b.disabled),
    ).toBe(true);
  });

  it('says how many hidden pairs are on screen and loads the rest on request', async () => {
    const page = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => card(`m-${from + i}`, 20, true));
    vi.mocked(listReviewQueue).mockResolvedValueOnce(page(0, 25));
    vi.mocked(listReviewQueue).mockResolvedValueOnce(page(25, 30));
    vi.mocked(getHiddenReviewCount).mockResolvedValue({ count: 30, floor: 30 });

    renderReview([card('m-high', 60, false)], { count: 30, floor: 30 });
    expect(screen.queryByRole('button', { name: LOAD_MORE })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: SHOW_HIDDEN }));
    await waitFor(() => expect(screen.queryByText('m-24 أ')).not.toBeNull());
    // 25 of the 30 hidden pairs are on screen, and the line says so.
    expect(screen.getByText(/أقل من حد المراجعة/).textContent).toContain('25 من 30');
    expect(screen.queryByText('m-25 أ')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: LOAD_MORE }));
    await waitFor(() => expect(screen.queryByText('m-29 أ')).not.toBeNull());
    expect(listReviewQueue).toHaveBeenLastCalledWith({ hidden: true, offset: 25 });
    expect(screen.getByText(/أقل من حد المراجعة/).textContent).toContain('30 من 30');
    expect(screen.queryByText('m-0 أ')).not.toBeNull();
    // Everything is loaded: nothing more to offer.
    expect(screen.queryByRole('button', { name: LOAD_MORE })).toBeNull();
  });

  it('goes back to the queue', async () => {
    vi.mocked(listReviewQueue).mockResolvedValueOnce([card('m-low', 20, true)]);
    vi.mocked(listReviewQueue).mockResolvedValueOnce([card('m-high', 60, false)]);
    vi.mocked(getHiddenReviewCount).mockResolvedValue({ count: 1, floor: 30 });

    renderReview([card('m-high', 60, false)], { count: 1, floor: 30 });
    fireEvent.click(screen.getByRole('button', { name: SHOW_HIDDEN }));
    await waitFor(() => expect(screen.queryByText('m-low أ')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: BACK_TO_QUEUE }));
    await waitFor(() => expect(screen.queryByText('m-high أ')).not.toBeNull());
    expect(listReviewQueue).toHaveBeenLastCalledWith({ hidden: false });
    expect(screen.queryByText('m-low أ')).toBeNull();
  });
});
