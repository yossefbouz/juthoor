import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { getCachedIsUserLoggedIn } from '@/rsc-data/supabase';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { type ReactNode, Suspense } from 'react';
import { AppSidebar } from './app-sidebar';
import { DynamicBreadcrumb } from '@/components/dynamic-breadcrumb';
import { NotificationBellShell } from '@/components/notifications/NotificationBellShell';

async function AuthGuard({ children }: { children: ReactNode }) {
  const isLoggedIn = await getCachedIsUserLoggedIn();
  if (!isLoggedIn) {
    redirect('/login');
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/*
        `min-w-0` lets SidebarInset shrink below its content's intrinsic
        width inside the SidebarProvider's flex layout. Without it, shadcn's
        default `w-full` on SidebarInset combined with the in-flow sidebar
        (256 px) pushes the page beyond the viewport — visible as the
        TreeSidePanel getting clipped on the right edge of /tree.
        `overflow-x-hidden` is a belt-and-suspenders so any rogue child
        with a large intrinsic width scrolls internally instead of
        ballooning <main>.
      */}
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-2 h-4" />
          <Suspense fallback={null}>
            <DynamicBreadcrumb />
          </Suspense>
          <div className="ms-auto flex items-center gap-1">
            <Link
              href="/messages"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--jt-stone-600)] transition hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)]"
              aria-label="Messages"
            >
              <MessageSquare className="h-4 w-4" />
            </Link>
            <Suspense fallback={null}>
              <NotificationBellShell />
            </Suspense>
          </div>
        </header>
        <Suspense fallback={null}>
          <AuthGuard>{children}</AuthGuard>
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
