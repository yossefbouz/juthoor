'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { signOutAction } from '@/data/auth/sign-out';
import { deleteAccountAction } from '@/data/user/account';
import { clearClientAuthCaches } from '@/lib/auth/clearClientCaches';
import { useLocale } from '@/contexts/LocaleContext';
import { LocaleToggle } from '@/components/LocaleToggle';
import { ModeToggle } from '@/components/ui/mode-toggle';
import {
  Bell,
  ChevronUp,
  Home,
  Inbox,
  LogOut,
  Trash2,
  MapPin,
  Network,
  Search,
  TreePine,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

export function AppSidebarContent({
  userEmail,
  displayName,
  displayNameAr,
  pendingRequestsCount,
}: {
  userEmail: string;
  displayName: string | null;
  displayNameAr: string | null;
  pendingRequestsCount: number;
}) {
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Private Items (Nextbase starter) omitted - quarantined in Wave 0.5
  const navigationItems = [
    { titleAr: 'لوحة الجذور', titleEn: 'Dashboard', url: '/dashboard', icon: Home, match: (p: string) => p === '/dashboard' },
    { titleAr: 'شجرة العائلة', titleEn: 'Family Tree', url: '/tree', icon: TreePine, match: (p: string) => p.startsWith('/tree') },
    {
      titleAr: 'الشجرة الفلسطينية',
      titleEn: 'Palestinian Family Tree',
      url: '/pft',
      icon: Network,
      match: (p: string) => p === '/pft' || p.startsWith('/palestinian-family-tree'),
    },
    { titleAr: 'ابحث عن ذويك', titleEn: 'Find Family', url: '/search', icon: Search, match: (p: string) => p.startsWith('/search') },
    { titleAr: 'العائلات', titleEn: 'Families', url: '/families', icon: Users, match: (p: string) => p.startsWith('/families') },
    { titleAr: 'القرى والمدن', titleEn: 'Villages & Cities', url: '/villages', icon: MapPin, match: (p: string) => p.startsWith('/villages') },
    {
      titleAr: 'طلبات الوصول',
      titleEn: 'Access Requests',
      url: '/dashboard/requests',
      icon: Inbox,
      match: (p: string) => p.startsWith('/dashboard/requests'),
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
  ];

  function handleSignOut() {
    startTransition(async () => {
      await clearClientAuthCaches();
      await signOutAction();
    });
  }

  function handleDeleteAccount() {
    const ok = window.confirm(
      t(
        'إغلاق الحساب نهائي: أشجارك تُنقل إلى أرشيف المنصة، ويُحذف تسجيل الدخول. لا يمكن التراجع عن ذلك.',
        'Closing your account is permanent: your trees move to the platform archive vault, and your login is deleted. This cannot be undone.',
      ),
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await clearClientAuthCaches();
        await deleteAccountAction();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t('تعذّر إغلاق الحساب', 'Could not close account'),
        );
      }
    });
  }

  const shownName =
    locale === 'ar'
      ? displayNameAr || displayName || userEmail.split('@')[0]
      : displayName || displayNameAr || userEmail.split('@')[0];
  const initials = shownName
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
            {t('التنقّل', 'Navigation')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = item.match(pathname);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url}>
                        <Icon className="size-4" />
                        <span className="flex-1">{t(item.titleAr, item.titleEn)}</span>
                        {item.badge ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--jt-gold-400)] px-1.5 text-[10px] font-bold text-[var(--jt-olive-900)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
            {t('التفضيلات', 'Preferences')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="flex items-center gap-2 px-2 py-1">
              <LocaleToggle className="flex-1 justify-center" />
              <ModeToggle />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-9 w-9 rounded-xl">
                    <AvatarFallback
                      className="rounded-xl bg-[var(--jt-olive-100)] text-[var(--jt-olive-800)]"
                      style={{ fontFamily: 'var(--jt-font-display)' }}
                    >
                      {initials || '·'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-start leading-tight">
                    <span
                      className="truncate font-semibold text-[var(--jt-stone-800)]"
                      style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
                    >
                      {shownName}
                    </span>
                    <span className="truncate text-[11px] text-[var(--jt-stone-500)]">{userEmail}</span>
                  </div>
                  <ChevronUp className="ms-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl"
                side="top"
                align="end"
                sideOffset={6}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-2 py-2">
                    <Avatar className="h-9 w-9 rounded-xl">
                      <AvatarFallback className="rounded-xl bg-[var(--jt-olive-100)] text-[var(--jt-olive-800)]">
                        {initials || '·'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate text-sm font-semibold">{shownName}</span>
                      <span className="truncate text-xs text-[var(--jt-stone-500)]">{userEmail}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {pendingRequestsCount > 0 && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/requests" className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-[var(--jt-gold-600)]" />
                        <span className="flex-1">{t('طلبات معلّقة', 'Pending requests')}</span>
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--jt-gold-400)] px-1.5 text-[10px] font-bold text-[var(--jt-olive-900)]">
                          {pendingRequestsCount}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('لوحة الجذور', 'Your roots')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} disabled={isPending}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {isPending ? t('جارٍ الخروج…', 'Signing out…') : t('تسجيل الخروج', 'Sign out')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDeleteAccount}
                  disabled={isPending}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('حذف الحساب', 'Delete account')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </>
  );
}

// `userId` prop is accepted for future per-user features but not used in the current render.

