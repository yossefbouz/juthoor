import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { VerifyClient } from '@/app/(app-pages)/verify/VerifyClient';
import type { IdentityVerification } from '@/data/user/identityVerification';

// Keep the server-only action modules out of jsdom.
vi.mock('@/data/user/identityVerification', () => ({
  getVerificationUploadTarget: vi.fn(),
  submitVerification: vi.fn(),
}));
vi.mock('@/data/user/appeals', () => ({
  submitVerificationAppealAction: vi.fn(),
  getMyOpenAppeal: vi.fn(),
}));

afterEach(() => cleanup());

const base: IdentityVerification = {
  id: 'v1',
  user_id: 'u1',
  tree_id: null,
  id_document_path: 'u1/a.pdf',
  id_document_type: 'passport',
  family_evidence_path: null,
  family_evidence_note: null,
  status: 'pending',
  reviewer_note: null,
  reviewed_at: null,
  created_at: '2026-06-23T00:00:00Z',
};

function renderVerify(v: IdentityVerification | null) {
  return render(
    <LocaleProvider>
      <VerifyClient initialVerification={v} />
    </LocaleProvider>,
  );
}

describe('VerifyClient — identity verification states', () => {
  it('shows the upload form when there is no verification yet', () => {
    renderVerify(null);
    expect(screen.queryByText(/إرسال للمراجعة/)).not.toBeNull(); // "Submit for review"
    expect(screen.queryByText(/نوع الوثيقة/)).not.toBeNull(); // "Document type"
  });

  it('shows a pending state after submission', () => {
    renderVerify({ ...base, status: 'pending' });
    expect(screen.queryByText(/قيد المراجعة/)).not.toBeNull(); // "under review"
    expect(screen.queryByText(/إرسال للمراجعة/)).toBeNull(); // form hidden
  });

  it('shows a verified state when approved', () => {
    renderVerify({ ...base, status: 'approved' });
    expect(screen.queryByText(/تم توثيق هويتك/)).not.toBeNull(); // "Your identity is verified"
  });

  it('shows appeal UI when verification was rejected', () => {
    renderVerify({ ...base, status: 'rejected', reviewer_note: 'unclear scan' });
    expect(screen.getAllByText(/استئناف القرار/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/إرسال الاستئناف/)).not.toBeNull();
  });

  it('renders the optional tree picker when trees are provided', () => {
    render(
      <LocaleProvider>
        <VerifyClient initialVerification={null} trees={[{ id: 't1', name: 'Al-Khalili' }]} />
      </LocaleProvider>,
    );
    expect(screen.queryByText(/أيّ شجرة عائلة/)).not.toBeNull(); // "Which family tree…"
    expect(screen.queryByText(/Al-Khalili/)).not.toBeNull();
  });
});
