import Footer from '@/components/Footer';
import Navbar from '@/app/Navbar';
import { type ReactNode } from 'react';

export default function ExternalLayout({ children }: { children: ReactNode }) {
  // The public pages are designed light-only; force-light keeps them light in dark mode.
  return (
    <div className="force-light flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
