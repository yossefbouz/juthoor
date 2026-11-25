import { type ReactNode } from 'react';
import Navbar from '@/app/Navbar';
import Footer from '@/components/Footer';
import { AuthBrandPanel } from '@/components/Auth/AuthBrandPanel';
import { CONTAINER, PAPER } from '@/components/home/homeContent';

export default function AuthLayout({ children }: { children: ReactNode }) {
  // Same frame as the public pages: site navbar, paper background, footer.
  // Light-only like them (force-light), so it does not flip when dark mode is on.
  return (
    <div
      className="force-light jt-grain-paper relative isolate flex min-h-screen flex-col text-[var(--jt-stone-900)]"
      style={{ backgroundColor: PAPER }}
    >
      <Navbar />
      <main className={`${CONTAINER} flex flex-1 items-center py-12 md:py-16`}>
        <div className="grid w-full items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <AuthBrandPanel />
          <div className="flex w-full justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 [animation-fill-mode:both] motion-reduce:animate-none">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
