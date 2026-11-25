'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/data/user/notifications';

export function NotificationBell({
  initialNotifications,
  initialUnread,
}: {
  initialNotifications: AppNotification[];
  initialUnread: number;
}) {
  const { t, dir, locale } = useLocale();
  const [items, setItems] = useState<AppNotification[]>(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);

  const titleOf = (n: AppNotification) =>
    (locale === 'ar' ? n.titleAr : n.titleEn) || n.titleEn || n.titleAr || t('إشعار', 'Notification');
  const bodyOf = (n: AppNotification) => (locale === 'ar' ? n.bodyAr : n.bodyEn) || '';

  async function openItem(n: AppNotification) {
    if (n.readAt) return;
    setItems((rows) =>
      rows.map((r) => (r.id === n.id ? { ...r, readAt: new Date().toISOString() } : r)),
    );
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead({ id: n.id });
    } catch {
      // best-effort: the badge is a hint, not a source of truth
    }
  }

  async function markAll() {
    if (unread === 0) return;
    const now = new Date().toISOString();
    setItems((rows) => rows.map((r) => (r.readAt ? r : { ...r, readAt: now })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // best-effort
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('الإشعارات', 'Notifications')}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--jt-stone-600)] transition hover:bg-[var(--jt-olive-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)]"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--jt-gold-500,#c99a2e)] px-1 text-[10px] font-bold leading-4 text-white dark:text-[var(--jt-stone-50)]">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" dir={dir} className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-[var(--jt-stone-100)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--jt-olive-900)]">
            {t('الإشعارات', 'Notifications')}
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--jt-olive-600)] transition hover:text-[var(--jt-olive-800)]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('تعليم الكل كمقروء', 'Mark all read')}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--jt-stone-500)]">
            {t('لا إشعارات بعد.', 'No notifications yet.')}
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-[var(--jt-stone-100)] overflow-y-auto">
            {items.map((n) => {
              const unreadItem = !n.readAt;
              const inner = (
                <div className="flex gap-2.5 px-4 py-3">
                  <span
                    aria-hidden
                    className={
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full '
                      + (unreadItem ? 'bg-[var(--jt-gold-500,#c99a2e)]' : 'bg-transparent')
                    }
                  />
                  <div className="min-w-0">
                    <p
                      className={
                        'truncate text-sm '
                        + (unreadItem
                          ? 'font-semibold text-[var(--jt-olive-900)]'
                          : 'font-medium text-[var(--jt-stone-700)]')
                      }
                    >
                      {titleOf(n)}
                    </p>
                    {bodyOf(n) && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--jt-stone-500)]">
                        {bodyOf(n)}
                      </p>
                    )}
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => openItem(n)}
                      className="block transition hover:bg-[var(--jt-olive-50)]/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className="block w-full text-start transition hover:bg-[var(--jt-olive-50)]/60"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
