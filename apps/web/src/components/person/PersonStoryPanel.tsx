'use client';

import { useState } from 'react';
import { Award, Check, HeartHandshake, Pencil, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  savePersonProfile,
  type PersonProfile,
} from '@/data/user/personProfiles';

const CURRENT_COUNTRY_OPTIONS = [
  { value: 'Jordan', ar: 'الأردن', en: 'Jordan' },
  { value: 'Lebanon', ar: 'لبنان', en: 'Lebanon' },
  { value: 'Syria', ar: 'سوريا', en: 'Syria' },
  { value: 'Egypt', ar: 'مصر', en: 'Egypt' },
  { value: 'Gaza Strip', ar: 'قطاع غزة', en: 'Gaza Strip' },
  { value: 'West Bank', ar: 'الضفة الغربية', en: 'West Bank' },
  { value: 'Other', ar: 'أخرى', en: 'Other' },
] as const;

const PREFERRED_CONTACT_OPTIONS = [
  { value: 'email', ar: 'البريد', en: 'Email' },
  { value: 'mobile', ar: 'الجوال', en: 'Mobile' },
  { value: 'messaging', ar: 'الرسائل', en: 'Messaging' },
  { value: 'do_not_contact', ar: 'عدم التواصل', en: 'Do not contact' },
] as const;

/**
 * "Achievements" + "Contribution to the cause" for the 360° person view
 * (design flow 4.X.1.1.4 / 4.X.1.1.5). Read for everyone who can see the person;
 * inline-editable by tree owners/collaborators (`canManage`). Bilingual: shows
 * and edits the active locale's text, preserving the other language on save.
 */
export function PersonStoryPanel({
  personId,
  initialProfile,
  canManage,
  isLiving = false,
}: {
  personId: string;
  initialProfile: PersonProfile | null;
  canManage: boolean;
  /** When true and contribution_consent is false, hide story from non-managers (D13). */
  isLiving?: boolean;
}) {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';

  const [profile, setProfile] = useState<PersonProfile | null>(initialProfile);
  const [editing, setEditing] = useState(false);
  const [achDraft, setAchDraft] = useState('');
  const [conDraft, setConDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contribConsent, setContribConsent] = useState(Boolean(initialProfile?.contribution_consent));
  const [contactConsent, setContactConsent] = useState(Boolean(initialProfile?.contact_consent));
  const [contactEmail, setContactEmail] = useState(initialProfile?.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(initialProfile?.contact_phone ?? '');
  const [currentCountry, setCurrentCountry] = useState(initialProfile?.current_country ?? '');
  const [currentCity, setCurrentCity] = useState(initialProfile?.current_city ?? '');
  const [currentAddress, setCurrentAddress] = useState(initialProfile?.current_address ?? '');
  const [preferredMethod, setPreferredMethod] = useState(
    initialProfile?.preferred_contact_method ?? '',
  );
  const [hamula, setHamula] = useState(initialProfile?.hamula_affiliation ?? '');
  const [originRel, setOriginRel] = useState(initialProfile?.origin_relationship ?? '');
  const [originText, setOriginText] = useState(initialProfile?.origin_text ?? '');
  const [occupation, setOccupation] = useState(initialProfile?.occupation ?? '');
  const [education, setEducation] = useState(initialProfile?.education ?? '');
  const [migrationNotes, setMigrationNotes] = useState(
    initialProfile?.migration_notes ?? '',
  );

  const achievements = isAR
    ? profile?.achievements_ar ?? profile?.achievements_en
    : profile?.achievements_en ?? profile?.achievements_ar;
  const contribution = isAR
    ? profile?.contribution_ar ?? profile?.contribution_en
    : profile?.contribution_en ?? profile?.contribution_ar;

  const contributionConsent = Boolean(profile?.contribution_consent);
  const hideForLiving = isLiving && !contributionConsent && !canManage;
  const achievementsVisible = hideForLiving ? null : achievements;
  const contributionVisible = hideForLiving ? null : contribution;
  const hasOrigin = Boolean(
    profile?.hamula_affiliation ||
      profile?.origin_text ||
      profile?.occupation ||
      profile?.education ||
      profile?.migration_notes ||
      profile?.origin_relationship,
  );
  const hasContent = Boolean(achievementsVisible || contributionVisible || hasOrigin);

  // Nothing recorded and the viewer can't add anything → render nothing.
  // Also hide entirely for living people without consent (non-managers).
  if (hideForLiving) return null;
  if (!hasContent && !canManage) return null;

  function startEditing() {
    setAchDraft((isAR ? profile?.achievements_ar : profile?.achievements_en) ?? '');
    setConDraft((isAR ? profile?.contribution_ar : profile?.contribution_en) ?? '');
    setContribConsent(Boolean(profile?.contribution_consent));
    setContactConsent(Boolean(profile?.contact_consent));
    setContactEmail(profile?.contact_email ?? '');
    setContactPhone(profile?.contact_phone ?? '');
    setCurrentCountry(profile?.current_country ?? '');
    setCurrentCity(profile?.current_city ?? '');
    setCurrentAddress(profile?.current_address ?? '');
    setPreferredMethod(profile?.preferred_contact_method ?? '');
    setHamula(profile?.hamula_affiliation ?? '');
    setOriginRel(profile?.origin_relationship ?? '');
    setOriginText(profile?.origin_text ?? '');
    setOccupation(profile?.occupation ?? '');
    setEducation(profile?.education ?? '');
    setMigrationNotes(profile?.migration_notes ?? '');
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await savePersonProfile({
        personId,
        // edit the active locale; preserve the other language untouched
        achievementsAr: isAR ? achDraft : profile?.achievements_ar ?? null,
        achievementsEn: isAR ? profile?.achievements_en ?? null : achDraft,
        contributionAr: isAR ? conDraft : profile?.contribution_ar ?? null,
        contributionEn: isAR ? profile?.contribution_en ?? null : conDraft,
        contributionConsent: contribConsent,
        contactConsent,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        currentCountry: currentCountry || null,
        currentCity: currentCity || null,
        currentAddress: currentAddress || null,
        preferredContactMethod: (preferredMethod || null) as
          | 'email'
          | 'mobile'
          | 'messaging'
          | 'do_not_contact'
          | ''
          | null,
        hamulaAffiliation: hamula || null,
        originRelationship: (originRel || null) as
          | 'born_there'
          | 'descended'
          | 'married_into'
          | ''
          | null,
        originText: originText || null,
        occupation: occupation || null,
        education: education || null,
        migrationNotes: migrationNotes || null,
      });
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذّر الحفظ', 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    'rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--jt-olive-400)]';
  const inputClass =
    'rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm outline-none focus:border-[var(--jt-olive-400)]';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <h3
          className="text-lg font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('السيرة والإسهام', 'Story & contribution')}
        </h3>
        {canManage && !editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" />
            {hasContent ? t('تعديل', 'Edit') : t('إضافة', 'Add')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {editing ? (
          <div className="space-y-4">
            <Field
              icon={Award}
              label={t('الإنجازات', 'Achievements')}
              value={achDraft}
              onChange={setAchDraft}
              placeholder={t(
                'مناصب، شهادات، أعمال بارزة…',
                'Roles, honours, notable work…',
              )}
            />
            <Field
              icon={HeartHandshake}
              label={t('المساهمة في القضية', 'Contribution to the cause')}
              value={conDraft}
              onChange={setConDraft}
              placeholder={t(
                'دور هذا الشخص في خدمة فلسطين وأهلها…',
                "This person's role in serving Palestine and its people…",
              )}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--jt-stone-700)]">
              <input
                type="checkbox"
                checked={contribConsent}
                onChange={(e) => setContribConsent(e.target.checked)}
              />
              {t('الموافقة على عرض الإنجازات/المساهمة (للأحياء)', 'Consent to show achievements/contribution (living)')}
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--jt-stone-700)]">
              <input
                type="checkbox"
                checked={contactConsent}
                onChange={(e) => setContactConsent(e.target.checked)}
              />
              {t('الموافقة على إظهار بيانات التواصل', 'Consent to show contact details')}
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('العشيرة / الحمولة', 'Clan / hamula')}
                </span>
                <input
                  type="text"
                  value={hamula}
                  onChange={(e) => setHamula(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('صلة الأصل', 'Link to origin VCC')}
                </span>
                <select
                  value={originRel}
                  onChange={(e) => setOriginRel(e.target.value)}
                  className={`w-full ${selectClass}`}
                >
                  <option value="">{t('— اختر —', '— Select —')}</option>
                  <option value="born_there">{t('وُلد هناك', 'Born there')}</option>
                  <option value="descended">{t('منحدر منها', 'Descended from there')}</option>
                  <option value="married_into">{t('انتمى بالزواج', 'Married into')}</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('الأصل (نص)', 'Origin (text)')}
                </span>
                <input
                  type="text"
                  value={originText}
                  onChange={(e) => setOriginText(e.target.value)}
                  placeholder={t('غير معروف', 'Unknown')}
                  className={`w-full ${inputClass}`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('المهنة', 'Occupation')}
                </span>
                <input
                  type="text"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('التعليم', 'Education')}
                </span>
                <input
                  type="text"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  className={`w-full ${inputClass}`}
                />
              </label>
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                  {t('ملاحظات الهجرة', 'Migration notes')}
                </span>
                <textarea
                  value={migrationNotes}
                  onChange={(e) => setMigrationNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className={`w-full ${inputClass}`}
                />
              </label>
            </div>
            {contactConsent && (
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t('البريد', 'Email')}
                  className={inputClass}
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder={t('الهاتف', 'Phone')}
                  className={inputClass}
                />
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                    {t('البلد الحالي', 'Current country')}
                  </span>
                  <select
                    value={currentCountry}
                    onChange={(e) => setCurrentCountry(e.target.value)}
                    className={`w-full ${selectClass}`}
                  >
                    <option value="">{t('— اختر —', '— Select —')}</option>
                    {CURRENT_COUNTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isAR ? opt.ar : opt.en}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                    {t('المدينة الحالية', 'Current city')}
                  </span>
                  <input
                    type="text"
                    value={currentCity}
                    onChange={(e) => setCurrentCity(e.target.value)}
                    placeholder={t('المدينة', 'City')}
                    className={`w-full ${inputClass}`}
                  />
                </label>
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                    {t('العنوان الحالي', 'Current address')}
                  </span>
                  <input
                    type="text"
                    value={currentAddress}
                    onChange={(e) => setCurrentAddress(e.target.value)}
                    placeholder={t('العنوان', 'Address')}
                    className={`w-full ${inputClass}`}
                  />
                </label>
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                    {t('طريقة التواصل المفضلة', 'Preferred contact method')}
                  </span>
                  <select
                    value={preferredMethod}
                    onChange={(e) => setPreferredMethod(e.target.value)}
                    className={`w-full ${selectClass}`}
                  >
                    <option value="">{t('— اختر —', '— Select —')}</option>
                    {PREFERRED_CONTACT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isAR ? opt.ar : opt.en}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {error && (
              <p className="text-sm text-[var(--jt-terra-600)]">{error}</p>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Check className="h-4 w-4" />
                {saving ? t('يحفظ…', 'Saving…') : t('حفظ', 'Save')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                {t('إلغاء', 'Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ReadBlock
              icon={Award}
              label={t('الإنجازات', 'Achievements')}
              text={achievementsVisible}
              empty={t('لم تُسجَّل إنجازات بعد.', 'No achievements recorded yet.')}
            />
            <ReadBlock
              icon={HeartHandshake}
              label={t('المساهمة في القضية', 'Contribution to the cause')}
              text={contributionVisible}
              empty={t('لم تُسجَّل مساهمة بعد.', 'No contribution recorded yet.')}
            />
            {(profile?.hamula_affiliation ||
              profile?.origin_text ||
              profile?.occupation ||
              profile?.education ||
              profile?.migration_notes ||
              profile?.origin_relationship) && (
              <div className="grid gap-2 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/50 p-3 text-sm text-[var(--jt-stone-800)]">
                {profile.hamula_affiliation && (
                  <p>
                    <span className="font-semibold">{t('العشيرة', 'Hamula')}: </span>
                    {profile.hamula_affiliation}
                  </p>
                )}
                {profile.origin_relationship && (
                  <p>
                    <span className="font-semibold">{t('صلة الأصل', 'Origin link')}: </span>
                    {profile.origin_relationship === 'born_there'
                      ? t('وُلد هناك', 'Born there')
                      : profile.origin_relationship === 'descended'
                        ? t('منحدر منها', 'Descended')
                        : t('انتمى بالزواج', 'Married into')}
                  </p>
                )}
                {profile.origin_text && (
                  <p>
                    <span className="font-semibold">{t('الأصل', 'Origin')}: </span>
                    {profile.origin_text}
                  </p>
                )}
                {profile.occupation && (
                  <p>
                    <span className="font-semibold">{t('المهنة', 'Occupation')}: </span>
                    {profile.occupation}
                  </p>
                )}
                {profile.education && (
                  <p>
                    <span className="font-semibold">{t('التعليم', 'Education')}: </span>
                    {profile.education}
                  </p>
                )}
                {profile.migration_notes && (
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold">{t('الهجرة', 'Migration')}: </span>
                    {profile.migration_notes}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReadBlock({
  icon: Icon,
  label,
  text,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text: string | null | undefined;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--jt-olive-700)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      {text ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--jt-stone-800)]">
          {text}
        </p>
      ) : (
        <p className="text-sm text-[var(--jt-stone-400)]">{empty}</p>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--jt-olive-700)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={2000}
        className="w-full resize-y rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-sm text-[var(--jt-stone-900)] outline-none focus:border-[var(--jt-olive-400)]"
      />
    </label>
  );
}
