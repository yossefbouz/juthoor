'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Scale,
  Upload,
  XCircle,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import {
  submitVerificationAppealAction,
} from '@/data/user/appeals';
import {
  getVerificationUploadTarget,
  submitVerification,
  type IdDocumentType,
  type IdentityVerification,
  type SelectableTree,
} from '@/data/user/identityVerification';

const BUCKET = 'verification-docs';
const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.pdf,image/*,application/pdf';

const ID_TYPES: { value: IdDocumentType; ar: string; en: string }[] = [
  { value: 'passport', ar: 'جواز سفر', en: 'Passport' },
  { value: 'national_id', ar: 'بطاقة هوية وطنية', en: 'National ID' },
  { value: 'refugee_card', ar: 'بطاقة تسجيل لاجئ', en: 'Refugee registration card' },
  { value: 'other', ar: 'وثيقة أخرى', en: 'Other document' },
];

async function uploadDoc(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const { path, token } = await getVerificationUploadTarget({ fileExtension: ext });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Storage is not configured');
  const browser = createClient(url, key);
  const { error } = await browser.storage.from(BUCKET).uploadToSignedUrl(path, token, file);
  if (error) throw new Error(error.message);
  return path;
}

export function VerifyClient({
  initialVerification,
  trees = [],
  initialOpenAppeal = null,
  compact = false,
}: {
  initialVerification: IdentityVerification | null;
  trees?: SelectableTree[];
  /** Open appeal for the current verification, if any. */
  initialOpenAppeal?: { id: string; reason: string; created_at: string } | null;
  /** Hide the stepper when embedded inside register/complete. */
  compact?: boolean;
}) {
  const { t, dir } = useLocale();
  const [verification, setVerification] = useState(initialVerification);
  const [treeId, setTreeId] = useState('');
  const [idType, setIdType] = useState<IdDocumentType>('passport');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [famFile, setFamFile] = useState<File | null>(null);
  const [famNote, setFamNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAppeal, setOpenAppeal] = useState(initialOpenAppeal);
  const [appealReason, setAppealReason] = useState('');
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  const status = verification?.status;
  // Step 4 = submitted/done; otherwise sitting on the Identity step (2).
  const activeStep = status === 'approved' || status === 'pending' ? 4 : 2;

  async function handleAppeal() {
    if (!verification?.id) return;
    const reason = appealReason.trim();
    if (reason.length < 10) {
      setAppealError(
        t('اكتب سببًا أوضح (١٠ أحرف على الأقل).', 'Write a clearer reason (at least 10 characters).'),
      );
      return;
    }
    setAppealBusy(true);
    setAppealError(null);
    try {
      const result = await submitVerificationAppealAction({
        verificationId: verification.id,
        reason,
      });
      if (result?.serverError) {
        setAppealError(result.serverError);
        return;
      }
      setOpenAppeal({
        id: crypto.randomUUID(),
        reason,
        created_at: new Date().toISOString(),
      });
      setAppealReason('');
    } catch (e) {
      setAppealError(
        e instanceof Error ? e.message : t('تعذّر إرسال الاستئناف.', 'Could not submit appeal.'),
      );
    } finally {
      setAppealBusy(false);
    }
  }

  async function handleSubmit() {
    if (!idFile) {
      setError(t('يرجى إرفاق وثيقة هوية رسمية أوّلًا.', 'Please attach a government ID first.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idDocumentPath = await uploadDoc(idFile);
      const familyEvidencePath = famFile ? await uploadDoc(famFile) : undefined;
      const v = await submitVerification({
        idDocumentPath,
        idDocumentType: idType,
        familyEvidencePath,
        familyEvidenceNote: famNote.trim() || undefined,
        treeId: treeId || undefined,
      });
      setVerification(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذّر الإرسال.', 'Submission failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      dir={dir}
      className={
        compact
          ? 'flex w-full flex-col'
          : 'mx-auto flex w-full max-w-xl flex-1 flex-col p-4 md:p-8'
      }
    >
      {compact ? null : <Stepper active={activeStep} />}

      {status === 'approved' ? (
        <StatusCard
          tone="olive"
          icon={CheckCircle2}
          title={t('تم توثيق هويتك', 'Your identity is verified')}
          body={t(
            'تمت الموافقة على طلبك. أصبح بإمكانك تحرير شجرة عائلتك.',
            'Your request was approved. You can now edit your family tree.',
          )}
          note={verification?.reviewer_note}
        />
      ) : status === 'pending' ? (
        <StatusCard
          tone="sand"
          icon={Clock}
          title={t('طلبك قيد المراجعة', 'Your request is under review')}
          body={t(
            'استلمنا وثائقك. تتم المراجعة من قبل المسؤول خلال ٢-٣ أيام، وسنعلمك بالنتيجة.',
            'We received your documents. An administrator will review them within 2–3 days and we will notify you.',
          )}
        />
      ) : (
        <div className="space-y-4">
          {status === 'rejected' && (
            <>
              <StatusCard
                tone="terra"
                icon={XCircle}
                title={t('لم تتم الموافقة على الطلب السابق', 'Your previous request was not approved')}
                body={t('يمكنك إعادة الإرسال بوثائق أوضح، أو استئناف القرار.', 'You can resubmit with clearer documents, or appeal the decision.')}
                note={verification?.reviewer_note}
              />
              <section className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]">
                <div className="mb-2 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-[var(--jt-olive-700)]" />
                  <h3
                    className="text-base font-bold text-[var(--jt-olive-900)]"
                    style={{ fontFamily: 'var(--jt-font-display)' }}
                  >
                    {t('استئناف القرار', 'Appeal this decision')}
                  </h3>
                </div>
                {openAppeal ? (
                  <p className="text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
                    {t(
                      'استئنافك مفتوح ويراجعه الفريق. يمكنك إعادة الإرسال بوثائق جديدة أدناه إن رغبت.',
                      'Your appeal is open for staff review. You can still resubmit with new documents below if you want.',
                    )}
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
                      {t(
                        'اشرح لماذا يجب إعادة النظر في الرفض. قبول الاستئناف يعيد الطلب إلى قيد المراجعة.',
                        'Explain why the rejection should be reconsidered. Accepting an appeal reopens the request as pending.',
                      )}
                    </p>
                    <textarea
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] p-3 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                      placeholder={t('سبب الاستئناف…', 'Appeal reason…')}
                    />
                    {appealError ? (
                      <p className="mt-2 text-sm text-[var(--jt-terra-700)]">{appealError}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleAppeal}
                      disabled={appealBusy}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-300)] bg-[var(--jt-olive-50)] px-4 py-2 text-sm font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)] disabled:opacity-50"
                    >
                      {appealBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Scale className="h-3.5 w-3.5" />
                      )}
                      {t('إرسال الاستئناف', 'Submit appeal')}
                    </button>
                  </>
                )}
              </section>
            </>
          )}

          <section className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-sm)] md:p-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--jt-stone-500)]">
              {t('الخطوة 2 من 3 · مخطط العملية 1.1', 'Step 2 of 3 · process flow 1.1')}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
              {t('تحقّق من هويتك', 'Verify your identity')}
            </h2>

            {/* Target tree — on approval the admin grants you edit access to it */}
            {trees.length > 0 && (
              <label className="mb-4 mt-5 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                  {t('أيّ شجرة عائلة تريد إدارتها؟ (اختياري)', 'Which family tree do you want to manage? (optional)')}
                </span>
                <select
                  value={treeId}
                  onChange={(e) => setTreeId(e.target.value)}
                  className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                >
                  <option value="">{t('— لا شيء (توثيق هوية عام) —', '— None (general identity check) —')}</option>
                  {trees.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.name ?? tr.id}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[var(--jt-stone-400)]">
                  {t(
                    'عند الموافقة، سيمنحك المسؤول صلاحية التحرير على هذه الشجرة.',
                    'On approval, the administrator grants you edit access to this tree.',
                  )}
                </span>
              </label>
            )}

            {/* ID type */}
            <label className="mb-4 mt-5 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                {t('نوع الوثيقة', 'Document type')}
              </span>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value as IdDocumentType)}
                className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
              >
                {ID_TYPES.map((it) => (
                  <option key={it.value} value={it.value}>
                    {t(it.ar, it.en)}
                  </option>
                ))}
              </select>
            </label>

            {/* Gov ID (required) — Identity step */}
            <UploadZone
              title={t('حمّل وثيقة هوية رسمية', 'Upload a government-issued ID')}
              hint={t('جواز سفر، بطاقة هوية وطنية، أو بطاقة تسجيل لاجئ', 'Passport, national ID, or refugee registration card')}
              file={idFile}
              onPick={setIdFile}
            />

            {/* Family belonging — Family step */}
            <div className="mt-5 rounded-xl border-s-4 border-[var(--jt-gold-400)] bg-[var(--jt-gold-50)] p-3">
              <p className="text-[12px] text-[var(--jt-stone-700)]" style={{ lineHeight: 1.6 }}>
                {t(
                  'الخطوة التالية (العائلة): قدّم دليلاً يربطك بالعائلة التي تريد إدارة شجرتها — سجل عائلي، شهادة أحد كبار العائلة، أو وثيقة تذكر والديك أو جدودك.',
                  'Next (Family): provide evidence connecting you to the family whose tree you want to manage — a family record, an elder’s testimony, or a document naming your parents or grandparents.',
                )}
              </p>
            </div>
            <div className="mt-3">
              <UploadZone
                compact
                title={t('دليل الانتماء للعائلة (اختياري)', 'Family-belonging evidence (optional)')}
                hint={t('سجل عائلي أو وثيقة تذكر والديك', 'A family record or a document naming your parents')}
                file={famFile}
                onPick={setFamFile}
              />
              <textarea
                value={famNote}
                onChange={(e) => setFamNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t('أو اكتب شهادة قصيرة: صلتي بهذه العائلة هي…', 'Or write a short testimony: my connection to this family is…')}
                className="mt-2 w-full resize-y rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] p-3 text-sm outline-none focus:border-[var(--jt-olive-400)]"
              />
            </div>

            {/* Review SLA pill */}
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-gold-100)] px-3 py-1 text-[11px] font-medium text-[var(--jt-gold-700)]">
              <Clock className="h-3.5 w-3.5" />
              {t('تتم المراجعة من قبل المسؤول خلال 2-3 أيام', 'Reviewed by an administrator within 2–3 days')}
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !idFile}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--jt-terra-600)] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--jt-terra-700)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('إرسال للمراجعة', 'Submit for review')}
            </button>

            <a
              href="/dashboard"
              className="mt-3 block text-center text-xs font-medium text-[var(--jt-stone-500)] underline underline-offset-2 hover:text-[var(--jt-olive-700)]"
            >
              {t('تخطّ الآن واستكشف المنصّة', 'Skip for now and explore the platform')}
            </a>
          </section>
        </div>
      )}
    </div>
  );
}

/** Account → Identity → Family progress stepper (mockup 02). */
function Stepper({ active }: { active: number }) {
  const { t } = useLocale();
  const steps = [
    { n: 1, label: t('الحساب', 'Account') },
    { n: 2, label: t('الهوية', 'Identity') },
    { n: 3, label: t('العائلة', 'Family') },
  ];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-center">
        {steps.map((s, i) => {
          const done = active > s.n || active === 4;
          const isActive = active === s.n;
          return (
            <div key={s.n} className="flex items-center">
              <div
                className={
                  'flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold ' +
                  (done
                    ? 'border-[var(--jt-olive-600)] bg-[var(--jt-olive-100)] text-[var(--jt-olive-700)]'
                    : isActive
                      ? 'border-[var(--jt-olive-600)] bg-[var(--jt-olive-600)] text-white'
                      : 'border-[var(--jt-stone-300)] bg-[var(--card)] text-[var(--jt-stone-400)]')
                }
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.n}
              </div>
              {i < steps.length - 1 && (
                <span
                  className={
                    'mx-1.5 h-px w-9 ' +
                    (active > s.n || active === 4 ? 'bg-[var(--jt-olive-500)]' : 'bg-[var(--jt-stone-200)]')
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-[34px] text-[10px]">
        {steps.map((s) => (
          <span
            key={s.n}
            className={active >= s.n || active === 4 ? 'font-medium text-[var(--jt-olive-700)]' : 'text-[var(--jt-stone-400)]'}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function UploadZone({
  title,
  hint,
  file,
  onPick,
  compact,
}: {
  title: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <label
        className={
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--jt-stone-300)] text-center transition-colors hover:border-[var(--jt-olive-400)] ' +
          (compact ? 'p-3' : 'p-5')
        }
      >
        <Upload className={(compact ? 'h-5 w-5' : 'h-6 w-6') + ' text-[var(--jt-gold-600)]'} />
        <span className="mt-1.5 text-[13px] font-semibold text-[var(--jt-stone-900)]">{title}</span>
        <span className="mt-0.5 text-[11px] text-[var(--jt-stone-500)]">{hint}</span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>
      {file && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--jt-olive-100)] px-3 py-2">
          <FileText className="h-4 w-4 text-[var(--jt-olive-700)]" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--jt-stone-800)]">{file.name}</span>
          <Check className="h-4 w-4 text-[var(--jt-olive-600)]" />
        </div>
      )}
    </div>
  );
}

function StatusCard({
  tone,
  icon: Icon,
  title,
  body,
  note,
}: {
  tone: 'olive' | 'sand' | 'terra';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  note?: string | null;
}) {
  const styles =
    tone === 'olive'
      ? 'border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/60 text-[var(--jt-olive-800)]'
      : tone === 'terra'
        ? 'border-[var(--jt-terra-200)]/70 bg-[var(--jt-terra-50)]/50 text-[var(--jt-terra-700)]'
        : 'border-[var(--jt-gold-300)]/50 bg-[var(--jt-gold-100)]/50 text-[var(--jt-stone-800)]';
  return (
    <section className={`rounded-2xl border p-6 ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 flex-shrink-0" />
        <div>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--jt-font-display)' }}>
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--jt-stone-700)]" style={{ lineHeight: 1.8 }}>
            {body}
          </p>
          {note && (
            <p className="mt-2 rounded-lg bg-white/50 p-2 text-xs text-[var(--jt-stone-700)]">{note}</p>
          )}
        </div>
      </div>
    </section>
  );
}
