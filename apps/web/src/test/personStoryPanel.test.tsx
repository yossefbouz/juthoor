import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { PersonStoryPanel } from '@/components/person/PersonStoryPanel';
import type { PersonProfile } from '@/data/user/personProfiles';

// Mock the server action module so its server-only import chain is not pulled
// into jsdom — we only exercise the component's render/edit logic here.
vi.mock('@/data/user/personProfiles', () => ({
  savePersonProfile: vi.fn(async () => ({})),
}));

afterEach(() => cleanup());

const PROFILE: PersonProfile = {
  person_id: 'p1',
  contact_consent: false,
  contact_email: null,
  contact_phone: null,
  current_country: null,
  current_city: null,
  current_address: null,
  preferred_contact_method: null,
  contribution_consent: true,
  achievements_ar: 'قائد في المجتمع المحلي',
  achievements_en: null,
  contribution_ar: 'خدمة قريته وأهلها',
  contribution_en: null,
};

function renderPanel(profile: PersonProfile | null, canManage: boolean) {
  return render(
    <LocaleProvider>
      <PersonStoryPanel personId="p1" initialProfile={profile} canManage={canManage} />
    </LocaleProvider>,
  );
}

describe('PersonStoryPanel — 360° narrative (achievements + contribution)', () => {
  it('shows recorded achievements & contribution (read-only viewer)', () => {
    renderPanel(PROFILE, false);
    expect(screen.queryByText(/قائد في المجتمع المحلي/)).not.toBeNull();
    expect(screen.queryByText(/خدمة قريته وأهلها/)).not.toBeNull();
    // a read-only viewer gets no edit affordance
    expect(screen.queryByText(/تعديل|إضافة/)).toBeNull();
  });

  it('renders nothing when empty and the viewer cannot manage', () => {
    const { container } = renderPanel(null, false);
    expect(container.textContent).toBe('');
  });

  it('offers an Add affordance + empty hints when the viewer can manage', () => {
    renderPanel(null, true);
    // panel heading is present
    expect(screen.queryByText(/السيرة والإسهام/)).not.toBeNull();
    // Add button (no content yet) + empty-state hints
    expect(screen.queryByText(/إضافة/)).not.toBeNull();
    expect(screen.queryByText(/لم تُسجَّل إنجازات بعد/)).not.toBeNull();
  });
});
