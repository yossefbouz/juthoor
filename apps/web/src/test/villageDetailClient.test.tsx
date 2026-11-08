import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { VillageDetailClient } from '@/app/(app-pages)/villages/[placeId]/VillageDetailClient';
import type {
  PlaceDetail,
  PlacePerson,
  PlaceProfile,
} from '@/data/user/places';

// next/link needs no Next runtime in jsdom — render a plain anchor.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

afterEach(() => cleanup());

const AL_TIRA: PlaceDetail = {
  id: 'place-al-tira',
  name_ar: 'الطيرة',
  name_en: 'Al-Tira',
  place_type: 'village',
  district_ar: 'حيفا',
  district_en: 'Haifa',
  depopulated_year: 1948,
  is_depopulated: true,
  latitude: 32.4,
  longitude: 34.9,
};

const AL_TIRA_PROFILE: PlaceProfile = {
  place_id: 'place-al-tira',
  historical_overview_ar: 'كانت الطيرة قرية فلسطينية عربية كبيرة جنوب حيفا.',
  historical_overview_en: 'Al-Tira was a large Palestinian Arab village south of Haifa.',
  what_remains_ar: 'الموقع الأصلي للقرية مغطى إلى حد كبير بالبناء.',
  what_remains_en: 'The original village site is largely built over.',
  population_year: 1945,
  population_count: 5280,
  source_attribution_ar: 'مُجمَّع من مصادر متاحة للعامة.',
  source_attribution_en: 'Compiled from public-domain sources.',
  external_links: [
    { label_ar: 'فلسطين في الذاكرة — الطيرة', label_en: 'Palestine Remembered — al-Tira', url: 'https://example.org/al-tira' },
  ],
};

function renderVillage(profile: PlaceProfile | null, place: PlaceDetail = AL_TIRA) {
  return render(
    <LocaleProvider>
      <VillageDetailClient place={place} persons={[]} surnames={[]} profile={profile} />
    </LocaleProvider>,
  );
}

describe('VillageDetailClient — editorial enrichment (mockup 04)', () => {
  it('renders the full enrichment when a place_profile is present', () => {
    renderVillage(AL_TIRA_PROFILE);

    // Historical overview + what-remains (Arabic, the default locale)
    expect(screen.queryByText(/كانت الطيرة قرية فلسطينية/)).not.toBeNull();
    expect(screen.queryByText(/الموقع الأصلي للقرية/)).not.toBeNull();
    // Source attribution
    expect(screen.queryByText(/مُجمَّع من مصادر متاحة للعامة/)).not.toBeNull();
    // Historical population figure + label (mockup stat grid)
    expect(screen.queryByText(/السكان/)).not.toBeNull();
    expect(screen.queryByText(/5[,٬]?280/)).not.toBeNull();
    // Curated external resource link
    expect(screen.queryByText(/فلسطين في الذاكرة/)).not.toBeNull();
    // Content-sourcing legal note (we link out rather than copy Zochrot/iReturn)
    expect(screen.queryByText(/لا ينسخ محتوى الأرشيفات/)).not.toBeNull();
  });

  it('degrades gracefully when there is no profile (depopulated place)', () => {
    renderVillage(null);

    // Base page still renders the place identity…
    expect(screen.queryAllByText(/الطيرة/).length).toBeGreaterThan(0);
    // …but none of the editorial body text appears.
    expect(screen.queryByText(/كانت الطيرة قرية فلسطينية/)).toBeNull();
    expect(screen.queryByText(/الموقع الأصلي للقرية/)).toBeNull();
    // The population figure is absent without a profile (stat shows a dash).
    expect(screen.queryByText(/5[,٬]?280/)).toBeNull();
    // The sourcing note still shows for a depopulated place (intended): it
    // contextualises the external archives even before editorial text exists.
    expect(screen.queryByText(/لا ينسخ محتوى الأرشيفات/)).not.toBeNull();
  });

  it('shows an OpenStreetMap embed when coordinates exist', () => {
    renderVillage(null);
    const iframe = document.querySelector('iframe[src*="openstreetmap.org/export/embed"]');
    expect(iframe).not.toBeNull();
  });

  it('hides the map when coordinates are missing', () => {
    renderVillage(null, { ...AL_TIRA, latitude: null, longitude: null });
    expect(document.querySelector('iframe[src*="openstreetmap.org"]')).toBeNull();
  });

  it('withholds a protected (minor) record from the public people list (Privacy §11)', () => {
    const people: PlacePerson[] = [
      {
        person_id: 'p-adult',
        display_name_ar: 'محمد العجرمي',
        display_name_en: 'Mohammed Al-Ajrami',
        gender: 'M',
        birth_year: 1940,
        tree_id: 't1',
        tree_name: 'Al-Ajrami',
        protected: false,
      },
      {
        person_id: 'p-minor',
        display_name_ar: null,
        display_name_en: null,
        gender: null,
        birth_year: null,
        tree_id: 't2',
        tree_name: null,
        protected: true,
      },
    ];
    render(
      <LocaleProvider>
        <VillageDetailClient place={AL_TIRA} persons={people} surnames={[]} profile={null} />
      </LocaleProvider>,
    );
    // adult shows; protected minor is anonymised
    expect(screen.queryByText(/محمد العجرمي/)).not.toBeNull();
    expect(screen.queryByText(/فرد محمي/)).not.toBeNull();
  });

  it('shows no sourcing note for a non-depopulated place without a profile', () => {
    const livingCity: PlaceDetail = {
      ...AL_TIRA,
      id: 'place-nablus',
      name_ar: 'نابلس',
      name_en: 'Nablus',
      depopulated_year: null,
      is_depopulated: false,
    };
    renderVillage(null, livingCity);

    expect(screen.queryByText(/لا ينسخ محتوى الأرشيفات/)).toBeNull();
    expect(screen.queryByText(/كانت الطيرة قرية فلسطينية/)).toBeNull();
  });
});
