import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { NAV_ITEMS } from '@/app/nav-items';
import { AppSidebarContent } from '@/app/(app-pages)/app-sidebar-client';
import { DashboardClient, type DashboardData } from '@/app/(app-pages)/dashboard/DashboardClient';
import { FaqClient } from '@/app/(external-pages)/faq/FaqClient';
import { SidebarProvider } from '@/components/ui/sidebar';
import { OnboardingTour } from '@/components/tour/OnboardingTour';
import { TOUR_STEPS } from '@/lib/tour/tourSteps';
import {
  isTourDoneInMetadata,
  readLocalTourDone,
  shouldShowTour,
  TOUR_DONE_METADATA_KEY,
  TOUR_REPLAY_HREF,
  writeLocalTourDone,
} from '@/lib/tour/tourState';

const nav = vi.hoisted(() => ({
  search: '',
  router: { replace: vi.fn() },
  updateUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(nav.search),
}));
// next/link needs no Next runtime in jsdom — render a plain anchor.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault(); // jsdom does not navigate
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/supabase-clients/client', () => ({
  createClient: () => ({ auth: { updateUser: nav.updateUser } }),
}));
// The dashboard's chart preview is not under test (and is not drawn for an empty tree).
vi.mock('@/components/tree/FamilyChart', () => ({ FamilyChart: () => null }));
// Keep the server-only action modules of the sidebar out of jsdom.
vi.mock('@/data/auth/sign-out', () => ({ signOutAction: vi.fn() }));
vi.mock('@/data/user/account', () => ({ deleteAccountAction: vi.fn() }));
vi.mock('@/lib/auth/clearClientCaches', () => ({ clearClientAuthCaches: vi.fn() }));

const USER = 'user-1';
const ARABIC = /[؀-ۿ]/;

beforeEach(() => {
  nav.search = '';
  nav.router.replace.mockReset();
  nav.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function renderTour(metadataDone = false) {
  return render(
    <LocaleProvider>
      <OnboardingTour userId={USER} metadataDone={metadataDone} />
    </LocaleProvider>,
  );
}

/** Every static route under src/app, with route groups like (app-pages) removed. */
function existingRoutes(): Set<string> {
  const appDir = path.resolve(__dirname, '../app');
  const routes = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const isGroup = entry.name.startsWith('(');
        walk(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]);
      } else if (entry.name === 'page.tsx') {
        routes.add(`/${segments.join('/')}`);
      }
    }
  };
  walk(appDir, []);
  return routes;
}

describe('tour steps', () => {
  it('has Arabic and English text for every step', () => {
    for (const step of TOUR_STEPS) {
      for (const ar of [step.titleAr, step.bodyAr]) {
        expect(ar.trim(), step.id).not.toBe('');
        expect(ar, step.id).toMatch(ARABIC);
      }
      expect(step.titleEn.trim(), step.id).not.toBe('');
      expect(step.titleEn, step.id).not.toMatch(ARABIC);
      expect(step.bodyEn.trim(), step.id).not.toBe('');
      // the language step quotes the "ع / EN" toggle, so only titles are Arabic-free
      expect(step.bodyEn, step.id).toMatch(/[A-Za-z]{3}/);
    }
  });

  it('has unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every main area of the site', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    for (const area of [
      'tree', // creating a tree and adding people
      'chart', // chart layouts and the people list
      'verify', // identity verification and "this is me"
      'search', // individuals
      'families',
      'villages', // VCC
      'connections', // accept / decline / revoke
      'messages',
      'pictures',
      'documents',
      'gedcom', // import / export
      'language', // the language toggle
    ]) {
      expect(ids, area).toContain(area);
    }
    const text = (id: string) => {
      const s = TOUR_STEPS.find((step) => step.id === id)!;
      return `${s.titleEn} ${s.bodyEn}`;
    };
    expect(text('tree')).toMatch(/add person/i);
    expect(text('chart')).toMatch(/horizontal.*vertical.*fan/i);
    expect(text('chart')).toMatch(/all people/i);
    expect(text('verify')).toMatch(/this is me/i);
    expect(text('connections')).toMatch(/accept.*decline.*revoke/i);
    expect(text('gedcom')).toMatch(/import/i);
    expect(text('gedcom')).toMatch(/download|export/i);
  });

  it('points every "Take me there" link at a route that exists', () => {
    const routes = existingRoutes();
    expect(routes.has('/dashboard')).toBe(true); // the walker itself works
    const linked = TOUR_STEPS.filter((s) => s.href);
    expect(linked.length).toBeGreaterThan(0);
    for (const step of linked) {
      expect(routes.has(step.href!), `${step.id} -> ${step.href}`).toBe(true);
    }
  });

  it('sends the replay link to a route that exists', () => {
    expect(existingRoutes().has(TOUR_REPLAY_HREF.split('?')[0])).toBe(true);
  });

  it('names the picture and document steps like the navigation does', () => {
    for (const [id, href] of [
      ['pictures', '/pictures'],
      ['documents', '/documents'],
    ]) {
      const step = TOUR_STEPS.find((s) => s.id === id)!;
      const item = NAV_ITEMS.find((i) => i.href === href)!;
      expect(step.href).toBe(href);
      expect(step.titleAr).toBe(item.ar);
      expect(step.titleEn).toBe(item.en);
    }
  });
});

describe('tour state', () => {
  it('reads the completion flag from the auth user metadata', () => {
    expect(isTourDoneInMetadata({ [TOUR_DONE_METADATA_KEY]: true })).toBe(true);
    expect(isTourDoneInMetadata({ [TOUR_DONE_METADATA_KEY]: 'true' })).toBe(false);
    expect(isTourDoneInMetadata({})).toBe(false);
    expect(isTourDoneInMetadata(null)).toBe(false);
    expect(isTourDoneInMetadata(undefined)).toBe(false);
  });

  it('shows the tour only when neither store says it is done', () => {
    expect(shouldShowTour({ metadataDone: false, localDone: false })).toBe(true);
    expect(shouldShowTour({ metadataDone: true, localDone: false })).toBe(false);
    expect(shouldShowTour({ metadataDone: false, localDone: true })).toBe(false);
    expect(shouldShowTour({ metadataDone: true, localDone: true })).toBe(false);
  });

  it('keeps the local fallback per user', () => {
    expect(readLocalTourDone(USER)).toBe(false);
    writeLocalTourDone(USER);
    expect(readLocalTourDone(USER)).toBe(true);
    expect(readLocalTourDone('someone-else')).toBe(false);
  });

  it('treats a blocked localStorage as "not done" instead of throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLocalTourDone(USER)).toBe(false);
    spy.mockRestore();
  });
});

describe('OnboardingTour', () => {
  it('opens for a member without the completion flag', async () => {
    renderTour(false);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(TOUR_STEPS[0].titleAr); // Arabic is the default locale
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(nav.updateUser).not.toHaveBeenCalled();
  });

  it('stays closed when the metadata flag is set', () => {
    renderTour(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nav.updateUser).not.toHaveBeenCalled();
  });

  it('stays closed on the local fallback and retries the metadata write', () => {
    writeLocalTourDone(USER);
    renderTour(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nav.updateUser).toHaveBeenCalledWith({ data: { [TOUR_DONE_METADATA_KEY]: true } });
  });

  it('renders in English, left to right, when that is the chosen language', async () => {
    window.localStorage.setItem('juthoor.locale', 'en');
    renderTour(false);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain(TOUR_STEPS[0].titleEn));
    expect(dialog.getAttribute('dir')).toBe('ltr');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeNull();
    expect(dialog.textContent).toContain(`Step 1 of ${TOUR_STEPS.length}`);
  });

  it('walks forward and back through every step and shows progress', async () => {
    renderTour(false);
    const dialog = await screen.findByRole('dialog');
    const progress = screen.getByRole('progressbar');
    expect(screen.queryByRole('button', { name: 'السابق' })).toBeNull(); // no Back on step 1

    TOUR_STEPS.forEach((step, i) => {
      expect(dialog.textContent).toContain(step.titleAr);
      expect(dialog.textContent).toContain(step.bodyAr);
      expect(progress.getAttribute('aria-valuenow')).toBe(String(i + 1));
      expect(progress.getAttribute('aria-valuemax')).toBe(String(TOUR_STEPS.length));
      const link = screen.queryByRole('link', { name: /خذني إلى هناك/ });
      expect(link?.getAttribute('href') ?? undefined, step.id).toBe(step.href);
      if (i < TOUR_STEPS.length - 1) fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    });

    // last step: Finish replaces Next, Skip is gone
    expect(screen.queryByRole('button', { name: 'التالي' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تخطّي' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إنهاء' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(dialog.textContent).toContain(TOUR_STEPS[TOUR_STEPS.length - 2].titleAr);
  });

  it('stores the flag in user metadata and localStorage when skipped, and does not come back', async () => {
    const first = renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'تخطّي' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalTourDone(USER)).toBe(true);
    expect(nav.updateUser).toHaveBeenCalledTimes(1);
    expect(nav.updateUser).toHaveBeenCalledWith({ data: { [TOUR_DONE_METADATA_KEY]: true } });

    // next dashboard visit on this device (metadata not refreshed yet)
    first.unmount();
    renderTour(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stores the flag when finished on the last step', async () => {
    renderTour(false);
    await screen.findByRole('dialog');
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'إنهاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalTourDone(USER)).toBe(true);
    expect(nav.updateUser).toHaveBeenCalledWith({ data: { [TOUR_DONE_METADATA_KEY]: true } });
  });

  it('closes on Esc and on the close button, and counts both as done', async () => {
    const first = renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalTourDone(USER)).toBe(true);
    expect(nav.updateUser).toHaveBeenCalledTimes(1);

    first.unmount();
    window.localStorage.clear();
    renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق الجولة' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalTourDone(USER)).toBe(true);
  });

  it('still stops on this device when the metadata write fails', async () => {
    nav.updateUser.mockRejectedValue(new Error('offline'));
    const first = renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'تخطّي' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    first.unmount();
    renderTour(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not reopen in the same visit when localStorage is unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    nav.search = 'tour=1';
    const view = renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'تخطّي' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    nav.search = ''; // the URL change re-runs the show / don't-show check
    view.rerender(
      <LocaleProvider>
        <OnboardingTour userId={USER} metadataDone={false} />
      </LocaleProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nav.updateUser).toHaveBeenCalledTimes(1); // metadata is the store that survives
    spy.mockRestore();
  });

  it('does not close on a click outside the dialog', async () => {
    renderTour(false);
    await screen.findByRole('dialog');
    await new Promise((resolve) => setTimeout(resolve, 0)); // Radix arms its outside listener on a timer
    fireEvent.pointerDown(document.body);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(nav.updateUser).not.toHaveBeenCalled();
  });

  it('counts "Take me there" as finishing the tour', async () => {
    renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    const link = screen.getByRole('link', { name: /خذني إلى هناك/ });
    expect(link.getAttribute('href')).toBe(TOUR_STEPS[1].href);
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalTourDone(USER)).toBe(true);
  });

  it('replays with ?tour=1 even when already done, and drops the parameter', async () => {
    nav.search = 'tour=1';
    writeLocalTourDone(USER);
    renderTour(true);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(TOUR_STEPS[0].titleAr);
    expect(nav.router.replace).toHaveBeenCalledWith('/dashboard', { scroll: false });
  });

  it('keeps the member on their step when the replay parameter is dropped', async () => {
    nav.search = 'tour=1';
    const view = renderTour(false);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));

    nav.search = ''; // router.replace landed
    view.rerender(
      <LocaleProvider>
        <OnboardingTour userId={USER} metadataDone={false} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('dialog').textContent).toContain(TOUR_STEPS[1].titleAr);
  });

  it('puts focus inside the dialog and keeps Tab inside it', async () => {
    renderTour(false);
    const dialog = await screen.findByRole('dialog');
    const next = screen.getByRole('button', { name: 'التالي' });
    await waitFor(() => expect(document.activeElement).toBe(next));

    // Tab from the last control wraps to the first one instead of leaving the dialog
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'إغلاق الجولة' }));

    // every control is a real, focusable button or link
    const controls = dialog.querySelectorAll('button, a[href]');
    expect(controls.length).toBeGreaterThanOrEqual(3);
    controls.forEach((el) => expect((el as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0));
  });

  it('keeps focus inside the dialog when Back disappears on the first step', async () => {
    renderTour(false);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    const back = screen.getByRole('button', { name: 'السابق' });
    back.focus();
    fireEvent.click(back);
    expect(screen.queryByRole('button', { name: 'السابق' })).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('uses only direction-neutral layout classes and gates motion on motion-safe', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/tour/OnboardingTour.tsx'),
      'utf8',
    );
    const classes = [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
      .flatMap((m) => (m[1] ?? m[2]).split(/\s+/))
      .concat(source.match(/const FOCUS_RING =\s*'([^']*)'/)![1].split(/\s+/));
    expect(classes.length).toBeGreaterThan(20);
    for (const cls of classes) {
      const utility = cls.split(':').pop()!;
      expect(utility, cls).not.toMatch(
        /^-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)-|^text-(left|right)$|^(float|clear)-(left|right)$/,
      );
      if (/^(animate-|fade-|zoom-|slide-)/.test(utility)) {
        expect(cls, cls).toMatch(/^motion-safe:/);
      }
    }
  });
});

describe('the dashboard', () => {
  const data: DashboardData = {
    treeId: 'tree-1',
    treeName: 'شجرة عائلتي',
    personsCount: 0,
    recentPersons: [],
    villagesDiscover: [],
    userOrigins: [],
    snapshot: null,
    needsVerification: true,
    verificationStatus: null,
  };
  const renderDashboard = (tour: DashboardData['tour']) =>
    render(
      <LocaleProvider>
        <DashboardClient data={{ ...data, tour }} />
      </LocaleProvider>,
    );

  it('shows the tour to a signed-in member without the completion flag', async () => {
    renderDashboard({ userId: USER, done: false });
    expect((await screen.findByRole('dialog')).textContent).toContain(TOUR_STEPS[0].titleAr);
  });

  it('does not show it to a member who has the flag', () => {
    renderDashboard({ userId: USER, done: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show it when the signed-in user could not be read', () => {
    renderDashboard(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('replaying the tour', () => {
  it('has a "Take the tour" entry in the user menu that points at the replay link', async () => {
    // jsdom has no matchMedia; the sidebar only uses it to tell mobile from desktop.
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(
      <LocaleProvider>
        <SidebarProvider>
          <AppSidebarContent
            userEmail="member@example.com"
            displayName="Member"
            displayNameAr="عضو"
            pendingRequestsCount={0}
          />
        </SidebarProvider>
      </LocaleProvider>,
    );
    // jsdom has no PointerEvent, so send the pointerdown Radix opens the menu on as a MouseEvent.
    fireEvent(
      screen.getByRole('button', { name: /member@example\.com/ }),
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
    const entry = await screen.findByRole('link', { name: 'جولة في الموقع' });
    expect(entry.getAttribute('href')).toBe(TOUR_REPLAY_HREF);
  });

  it('tells members in the FAQ where to find it, in both languages', async () => {
    render(
      <LocaleProvider>
        <FaqClient />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /جولة التعريف بالموقع/ }));
    expect(screen.queryByText(/«جولة في الموقع»/)).not.toBeNull();
    cleanup();

    window.localStorage.setItem('juthoor.locale', 'en');
    render(
      <LocaleProvider>
        <FaqClient />
      </LocaleProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /site tour/i }));
    expect(screen.queryByText(/“Take the tour”/)).not.toBeNull();
  });
});
