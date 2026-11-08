'use client';

import { Eye, Loader2, Mail, Phone, Shield } from 'lucide-react';
import { useState } from 'react';

import { useLocale } from '@/contexts/LocaleContext';
import {
  revealPersonContact,
  type PersonContact,
} from '@/data/user/personContacts';
import { createContactRelayAction } from '@/data/user/contactRelay';

/**
 * Consent-gated contact fields. Revealing values writes an access_log row.
 * Empty / denied contacts render a short privacy note (no logging).
 */
export function PersonContactPanel({ personId }: { readonly personId: string }) {
  const { t, dir } = useLocale();
  const [contact, setContact] = useState<PersonContact | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const row = await revealPersonContact(personId);
      setContact(row);
      setRevealed(true);
    } catch {
      setError(t('تعذّر عرض بيانات التواصل.', 'Could not show contact details.'));
    } finally {
      setBusy(false);
    }
  }

  const hasValues = Boolean(contact?.email || contact?.phone);

  return (
    <section
      dir={dir}
      className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
      aria-labelledby="person-contact-heading"
    >
      <header className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-[var(--jt-olive-700)]" aria-hidden />
        <h2
          id="person-contact-heading"
          className="text-sm font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('بيانات التواصل', 'Contact details')}
        </h2>
      </header>

      {!revealed ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
            {t(
              'تظهر بيانات التواصل فقط عند الموافقة أو لمن يدير الشجرة. فتحها يُسجَّل في سجل الوصول.',
              'Contact details show only with consent or to tree managers. Opening them is written to the access log.',
            )}
          </p>
          <button
            type="button"
            onClick={reveal}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)] px-3.5 py-1.5 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {t('عرض بيانات التواصل', 'Show contact details')}
          </button>
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--jt-terra-700)]">{error}</p>
      ) : !hasValues ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--jt-stone-600)]">
            {t(
              'لا توجد بيانات تواصل متاحة لك، أو لم يُمنح إذن المشاركة.',
              'No contact details are available to you, or sharing consent is off.',
            )}
          </p>
          <button
            type="button"
            disabled={requesting || requested}
            onClick={async () => {
              setRequesting(true);
              setError(null);
              try {
                await createContactRelayAction({ targetPersonId: personId });
                setRequested(true);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : t('تعذر إرسال الطلب', 'Could not send request'),
                );
              } finally {
                setRequesting(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-3.5 py-1.5 text-xs font-semibold text-[var(--jt-stone-50)] disabled:opacity-50"
          >
            {requested
              ? t('تم إرسال طلب التواصل', 'Contact request sent')
              : requesting
                ? t('يرسل…', 'Sending…')
                : t('اطلب التواصل', 'Request contact')}
          </button>
        </div>
      ) : (
        <ul className="space-y-2 text-sm text-[var(--jt-stone-800)]">
          {contact?.email ? (
            <li className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-[var(--jt-olive-700)]" aria-hidden />
              <a
                dir="ltr"
                href={`mailto:${contact.email}`}
                className="underline-offset-2 hover:underline"
              >
                {contact.email}
              </a>
            </li>
          ) : null}
          {contact?.phone ? (
            <li className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-[var(--jt-olive-700)]" aria-hidden />
              <span dir="ltr">{contact.phone}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
