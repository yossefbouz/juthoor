'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { getAttachmentUploadTarget, recordAttachment, type AttachmentKind, type AttachmentTag } from '@/data/user/attachments';
import { TAG_LABELS, PHOTO_TAGS, DOCUMENT_TAGS } from '@/lib/attachments/tagLabels';
import { ATTACHMENT_LIMITS } from '@/lib/attachments/limits';
import { PlaceCombobox } from '@/components/tree/PlaceCombobox';

export function AttachmentUploader({
  open,
  onClose,
  treeId,
  personId,
  defaultKind,
  onUploaded,
  t,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  treeId: string;
  personId: string;
  defaultKind: AttachmentKind;
  onUploaded: () => void;
  t: <T extends string>(ar: T, en: T) => T;
  locale: 'ar' | 'en';
}) {
  const router = useRouter();
  const [kind, setKind] = useState<AttachmentKind>(defaultKind);
  const [tag, setTag] = useState<AttachmentTag>(defaultKind === 'photo' ? 'portrait' : 'birth_cert');
  const [file, setFile] = useState<File | null>(null);
  const [captionAr, setCaptionAr] = useState('');
  const [captionEn, setCaptionEn] = useState('');
  const [year, setYear] = useState<string>('');
  const [placeTakenId, setPlaceTakenId] = useState<string | null>(null);
  const [dateTaken, setDateTaken] = useState('');
  const [title, setTitle] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedExt = kind === 'photo' ? ATTACHMENT_LIMITS.allowedPhotoExt : ATTACHMENT_LIMITS.allowedDocExt;
  const allowedTags = kind === 'photo' ? PHOTO_TAGS : DOCUMENT_TAGS;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!(allowedExt as readonly string[]).includes(ext)) {
      setError(t(`نوع الملف ${ext} غير مدعوم`, `Unsupported file type: ${ext}`));
      return;
    }
    if (f.size > ATTACHMENT_LIMITS.maxBytes) {
      setError(t('الملف كبير جدًا (الحد ١٠ ميغا)', 'File too large (10MB max)'));
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) {
      setError(t('اختر ملفًا أوّلًا', 'Pick a file first'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      // 1. Get a signed upload URL
      const { path, token } = await getAttachmentUploadTarget({
        treeId,
        personId,
        fileExtension: ext,
        kind,
      });

      // 2. PUT file to storage with the signed URL
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const browser = createClient(url, key);
      const { error: upErr } = await browser.storage
        .from('person-attachments')
        .uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(upErr.message);

      // 3. Record DB row (+ notify IFT Admin / open message thread).
      // On insert failure, remove the orphaned storage object.
      let recorded;
      try {
        recorded = await recordAttachment({
          personId,
          treeId,
          kind,
          tag,
          storagePath: path,
          mimeType: file.type || (kind === 'photo' ? 'image/jpeg' : 'application/pdf'),
          sizeBytes: file.size,
          captionAr: captionAr.trim() || undefined,
          captionEn: captionEn.trim() || undefined,
          year: year.trim() ? Number(year) : undefined,
          placeTakenId: placeTakenId || undefined,
          dateTaken: dateTaken.trim() || undefined,
          title: title.trim() || undefined,
          issuingAuthority: issuingAuthority.trim() || undefined,
          issueDate: issueDate.trim() || undefined,
        });
      } catch (insertErr) {
        await browser.storage.from('person-attachments').remove([path]).catch(() => undefined);
        throw insertErr;
      }

      // 4. Reset + notify parent
      setFile(null);
      setCaptionAr('');
      setCaptionEn('');
      setYear('');
      setPlaceTakenId(null);
      setDateTaken('');
      setTitle('');
      setIssuingAuthority('');
      setIssueDate('');
      onUploaded();
      onClose();
      if (recorded.threadId) {
        router.push(`/messages/${recorded.threadId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--jt-stone-900)]/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--jt-olive-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-xl)] md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute end-4 top-4 rounded-full p-2 text-[var(--jt-stone-500)] transition-colors hover:bg-[var(--jt-stone-100)]"
              aria-label={t('إغلاق', 'Close')}
            >
              <X className="h-4 w-4" />
            </button>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
              {t('إرفاق', 'Attach')}
            </p>
            <h2
              className="text-2xl font-bold text-[var(--jt-olive-900)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {kind === 'photo' ? t('أضف صورة', 'Add a photo') : t('أضف مستندًا', 'Add a document')}
            </h2>

            {/* Kind picker */}
            <div className="mt-4 inline-flex items-center rounded-full bg-[var(--jt-stone-100)] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setKind('photo');
                  setTag('portrait');
                  setFile(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors ${
                  kind === 'photo'
                    ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                    : 'text-[var(--jt-stone-600)]'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                {t('صورة', 'Photo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('document');
                  setTag('birth_cert');
                  setFile(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors ${
                  kind === 'document'
                    ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                    : 'text-[var(--jt-stone-600)]'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                {t('مستند', 'Document')}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* File picker */}
              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--jt-olive-300)] bg-[var(--jt-olive-50)]/30 p-6 text-sm text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-50)]/60">
                <Upload className="h-5 w-5" />
                <span className="font-semibold">
                  {file ? file.name : t('اسحب ملفًا أو انقر للاختيار', 'Drop or click to pick a file')}
                </span>
                <input
                  type="file"
                  accept={
                    kind === 'photo'
                      ? '.jpg,.jpeg,.png,.webp,.heic,image/*'
                      : '.pdf,application/pdf'
                  }
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {file && (
                <p className="text-[11px] text-[var(--jt-stone-500)]">
                  {Math.round(file.size / 1024)} KB · {file.type || 'unknown'}
                </p>
              )}

              {/* Tag */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                  {t('النوع', 'Tag')}
                </span>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value as AttachmentTag)}
                  className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                >
                  {allowedTags.map((tg) => (
                    <option key={tg} value={tg}>
                      {locale === 'ar' ? TAG_LABELS[tg].ar : TAG_LABELS[tg].en}
                    </option>
                  ))}
                </select>
              </label>

              {/* Caption */}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                    {t('وصف بالعربية', 'Caption (Arabic)')}
                  </span>
                  <input
                    type="text"
                    value={captionAr}
                    onChange={(e) => setCaptionAr(e.target.value)}
                    placeholder={t('جواز جدّي ١٩٨٢', 'Grandfather\'s passport 1982')}
                    className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                    style={{ fontFamily: 'var(--jt-font-arabic)' }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                    {t('وصف بالإنجليزية', 'Caption (English)')}
                  </span>
                  <input
                    type="text"
                    value={captionEn}
                    onChange={(e) => setCaptionEn(e.target.value)}
                    placeholder="Grandfather's passport 1982"
                    className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                  />
                </label>
              </div>

              {kind === 'photo' ? (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      {t('مكان الالتقاط', 'Place taken')}
                    </span>
                    <PlaceCombobox
                      value={placeTakenId}
                      onChange={(id) => setPlaceTakenId(id)}
                      placeholder={t('قرية أو مدينة', 'Village or town')}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      {t('تاريخ الالتقاط', 'Date taken')}
                    </span>
                    <input
                      type="date"
                      value={dateTaken}
                      onChange={(e) => setDateTaken(e.target.value)}
                      className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      {t('عنوان الوثيقة', 'Document title')}
                    </span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('شهادة ميلاد', 'Birth certificate')}
                      className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      {t('الجهة المُصدِرة', 'Issuing authority')}
                    </span>
                    <input
                      type="text"
                      value={issuingAuthority}
                      onChange={(e) => setIssuingAuthority(e.target.value)}
                      placeholder={t('مثلاً: الأونروا', 'e.g. UNRWA')}
                      className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      {t('تاريخ الإصدار', 'Issue date')}
                    </span>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                    />
                  </label>
                </>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                  {t('السنة', 'Year')}
                </span>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="1982"
                  min={1500}
                  max={new Date().getUTCFullYear()}
                  className="w-32 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
                />
              </label>

              {error && (
                <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">{error}</div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={busy || !file}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--jt-olive-700)] px-6 py-3 text-sm font-semibold text-[var(--jt-stone-50)] transition-all hover:bg-[var(--jt-olive-800)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t('رفع', 'Upload')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
