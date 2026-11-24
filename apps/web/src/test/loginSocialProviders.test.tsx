import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Login } from '@/app/(auth-pages)/login/Login';
import { RenderProviders } from '@/components/Auth/RenderProviders';
import { LocaleProvider } from '@/contexts/LocaleContext';
import type { SocialProvider } from '@/lib/auth/socialProviders';

// Keep the server action module (and its server-only imports) out of jsdom.
vi.mock('@/data/auth/auth', () => ({
  signInWithPasswordAction: vi.fn(),
  signInWithProviderAction: vi.fn(),
  requestEmailOtpAction: vi.fn(),
  verifyEmailOtpAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => cleanup());

const SOCIAL_TAB = 'التواصل الاجتماعي'; // "Social" (the default locale is Arabic)
const BRAND_BUTTONS = /^(Google|Github|Twitter)$/;

function renderLogin(providers: SocialProvider[]) {
  return render(
    <LocaleProvider>
      <Login providers={providers} />
    </LocaleProvider>
  );
}

function openSocialTab() {
  // Radix tabs switch on mouse down, not on click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: SOCIAL_TAB }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('Login — social providers', () => {
  it('shows no social tab, panel or buttons when no provider is enabled', () => {
    renderLogin([]);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: SOCIAL_TAB })).toBeNull();
    // Inactive panels stay in the DOM (hidden), so count them there.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: BRAND_BUTTONS })).toBeNull();
  });

  it('keeps email log-in working when no provider is enabled', () => {
    renderLogin([]);
    expect(screen.getByTestId('password-form')).not.toBeNull();
    expect(document.querySelector('input[type="email"]')).not.toBeNull();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('shows exactly the enabled providers', () => {
    renderLogin(['google', 'twitter']);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
    openSocialTab();
    const names = screen
      .getAllByRole('button', { name: BRAND_BUTTONS })
      .map((button) => button.textContent);
    expect(names).toEqual(['Google', 'Twitter']);
  });

  it('offers enabled buttons as usable, not as a disabled demo', () => {
    renderLogin(['github']);
    openSocialTab();
    const button = screen.getByRole('button', { name: 'Github' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe('RenderProviders', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(
      <RenderProviders providers={[]} isLoading={false} onProviderLoginRequested={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders one button per provider and reports the clicked one', () => {
    const onRequested = vi.fn();
    render(
      <RenderProviders
        providers={['google', 'github']}
        isLoading={false}
        onProviderLoginRequested={onRequested}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Github' }));
    expect(onRequested).toHaveBeenCalledWith('github');
  });
});
