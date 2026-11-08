'use client';

import { useEffect, useRef, useState } from 'react';
import { Mail, Phone, Send } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { logAccessAction } from '@/data/user/accessLog';
import { createContactRelayAction } from '@/data/user/contactRelay';
import type { PersonProfile } from '@/data/user/personProfiles';

/** W3.4 / D3: show contact when consent + privileged; else request via contact_relay.
 *  W5.3: logging a view when email/phone are actually rendered. */
export function ContactPanel({
  personId,
  profile,
  canManage,
  isPrivilegedViewer,
}: {
  personId: string;
  profile: PersonProfile | null;
  canManage: boolean;
  isPrivilegedViewer: boolean;
}) {
  const { t } = useLocale();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const loggedRef = useRef(false);

  const consent = Boolean(profile?.contact_consent);
  // Tree writers always see their own records' contact; other privileged
  // viewers need consent (D3).
  const showContact =
    (canManage && Boolean(profile?.contact_email || profile?.contact_phone)) ||
    (consent && isPrivilegedViewer);
  const hasFields = Boolean(profile?.contact_email || profile?.contact_phone);

  useEffect(() => {
    if (!showContact || !hasFields || loggedRef.current) return;
    loggedRef.current = true;
    void logAccessAction({
      resourceType: 'person_contact',
      resourceId: personId,
      action: 'view',
    });
  }, [showContact, hasFields, personId]);

  async function requestContact() {
    setSending(true);
    setError(null);
    try {
      await createContactRelayAction({
        targetPersonId: personId,
        message: message.trim() || undefined,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر الإرسال', 'Could not send'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-0">
        <h3
          className="text-lg font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('التواصل', 'Contact')}
        </h3>
      </CardHeader>
      <CardContent className="space-y-3">
        {showContact ? (
          <>
            {profile?.contact_email && (
              <p className="flex items-center gap-2 text-sm text-[var(--jt-stone-800)]">
                <Mail className="h-4 w-4 text-[var(--jt-olive-600)]" />
                <a className="underline" href={`mailto:${profile.contact_email}`}>
                  {profile.contact_email}
                </a>
              </p>
            )}
            {profile?.contact_phone && (
              <p className="flex items-center gap-2 text-sm text-[var(--jt-stone-800)]">
                <Phone className="h-4 w-4 text-[var(--jt-olive-600)]" />
                <a className="underline" href={`tel:${profile.contact_phone}`}>
                  {profile.contact_phone}
                </a>
              </p>
            )}
            {!profile?.contact_email && !profile?.contact_phone && (
              <p className="text-sm text-[var(--jt-stone-500)]">
                {t('لا توجد بيانات تواصل مسجلة.', 'No contact details on file.')}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--jt-stone-600)]">
              {t(
                'بيانات التواصل خاصة. يمكنك طلب التواصل عبر العائلة.',
                'Contact details are private. You can request contact through the family.',
              )}
            </p>
            {!canManage && (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t('رسالة قصيرة (اختياري)', 'Short message (optional)')}
                  className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                />
                <Button onClick={requestContact} disabled={sending || sent} size="sm">
                  <Send className="h-3.5 w-3.5" />
                  {sent
                    ? t('تم إرسال الطلب', 'Request sent')
                    : sending
                      ? t('يرسل…', 'Sending…')
                      : t('اطلب التواصل', 'Request contact')}
                </Button>
                {error && <p className="text-sm text-[var(--jt-terra-600)]">{error}</p>}
              </>
            )}
            {canManage && (
              <p className="text-xs text-[var(--jt-stone-500)]">
                {t(
                  'فعل موافقة التواصل من لوحة السيرة لإظهار البريد/الهاتف للآخرين، أو أضف بيانات التواصل هناك.',
                  'Enable contact consent in the story panel to show email/phone to others, or add contact details there.',
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
