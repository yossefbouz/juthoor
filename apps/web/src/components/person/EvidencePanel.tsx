'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, FileText, Plus, Star, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import {
  listAttachments,
  setPrimaryPhoto,
  clearPrimaryPhoto,
  deleteAttachment,
  type Attachment,
} from '@/data/user/attachments';
import { useLocale } from '@/contexts/LocaleContext';
import { TAG_LABELS } from '@/lib/attachments/tagLabels';
import { AttachmentUploader } from './AttachmentUploader';
import { PhotoLightbox } from './PhotoLightbox';

export function EvidencePanel({
  treeId,
  personId,
  initialPrimaryPhotoId,
  canManage,
  onPrimaryChanged,
}: {
  treeId: string;
  personId: string;
  initialPrimaryPhotoId: string | null;
  canManage: boolean;
  /** Optional callback so the page can refresh the avatar elsewhere. */
  onPrimaryChanged?: (newPrimaryId: string | null) => void;
}) {
  const { t, locale, dir } = useLocale();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(initialPrimaryPhotoId);
  const [loading, setLoading] = useState(true);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [uploaderKind, setUploaderKind] = useState<'photo' | 'document'>('photo');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await listAttachments(personId);
      setAttachments(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const photos = attachments.filter((a) => a.kind === 'photo');
  const docs = attachments.filter((a) => a.kind === 'document');

  async function handleSetPrimary(id: string) {
    await setPrimaryPhoto(personId, id);
    setPrimaryId(id);
    onPrimaryChanged?.(id);
  }

  async function handleClearPrimary() {
    await clearPrimaryPhoto(personId);
    setPrimaryId(null);
    onPrimaryChanged?.(null);
  }

  async function handleDelete(id: string) {
    if (!confirm(t('هل أنت متأكد من الحذف؟', 'Delete this attachment?'))) return;
    await deleteAttachment(id);
    if (primaryId === id) {
      setPrimaryId(null);
      onPrimaryChanged?.(null);
    }
    refresh();
  }

  return (
    <section dir={dir} className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-sm)]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            {t('الإثباتات والصور', 'Evidence & photos')}
          </p>
          <h2 className="text-2xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
            {t('ذاكرة هذا الشخص', 'This person\'s memory')}
          </h2>
        </div>
        {canManage && (
          <div dir="ltr" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUploaderKind('photo');
                setUploaderOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--jt-olive-300)] bg-[var(--background)] px-4 py-2 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-50)]"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>{t('صورة', 'Photo')}</span>
              <Plus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                setUploaderKind('document');
                setUploaderOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-xs font-semibold text-[var(--jt-stone-50)] transition-colors hover:bg-[var(--jt-olive-800)]"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{t('مستند', 'Document')}</span>
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--jt-stone-400)]" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-10 text-center">
          <Camera className="mx-auto mb-3 h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm text-[var(--jt-stone-700)]" style={{ lineHeight: 1.8 }}>
            {canManage
              ? t(
                  'لا توجد صور أو مستندات بعد. أضف صورة من شبابه أو وثيقة تثبت وجوده.',
                  'No photos or documents yet. Add a photo from their youth or a document attesting to their existence.',
                )
              : t(
                  'لم يضف صاحب الشجرة أيّ ذكرى عن هذا الشخص بعد.',
                  'The tree owner hasn\'t added any evidence for this person yet.',
                )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {photos.length > 0 && (
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
                {t(`صور (${photos.length})`, `Photos (${photos.length})`)}
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {photos.map((p, i) => {
                  const isPrimary = p.id === primaryId;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-100)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--jt-shadow-md)]"
                    >
                      {p.signed_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.signed_url}
                          alt={p.caption_ar ?? p.caption_en ?? 'photo'}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      )}
                      {isPrimary && (
                        <span
                          className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--jt-gold-400)] px-2 py-0.5 text-[9px] font-bold text-[var(--jt-olive-900)] shadow-md"
                          aria-label={t('الصورة الأساسية', 'Primary photo')}
                        >
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {t('أساسية', 'Primary')}
                        </span>
                      )}
                      {p.year && (
                        <span className="absolute bottom-1 start-1 rounded-full bg-[var(--jt-stone-900)]/60 px-2 py-0.5 text-[10px] font-semibold text-white dark:text-[var(--jt-stone-50)]">
                          {p.year}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
                {t(`مستندات (${docs.length})`, `Documents (${docs.length})`)}
              </p>
              <ul className="space-y-2">
                {docs.map((d, i) => (
                  <motion.li
                    key={d.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--background)] p-4"
                  >
                    <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--jt-olive-100)] text-[var(--jt-olive-700)]">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--jt-stone-800)]" style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}>
                        {locale === 'ar'
                          ? d.caption_ar ?? d.caption_en ?? TAG_LABELS[d.tag].ar
                          : d.caption_en ?? d.caption_ar ?? TAG_LABELS[d.tag].en}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--jt-stone-500)]">
                        <span className="rounded-full bg-[var(--jt-stone-100)] px-2 py-0.5 font-semibold uppercase tracking-[0.15em]">
                          {locale === 'ar' ? TAG_LABELS[d.tag].ar : TAG_LABELS[d.tag].en}
                        </span>
                        {d.year ? <span className="ms-2">· {d.year}</span> : null}
                        {d.uploader_display_name ? <span className="ms-2">· {d.uploader_display_name}</span> : null}
                      </p>
                    </div>
                    <div dir="ltr" className="flex items-center gap-1">
                      {d.signed_url && (
                        <a
                          href={d.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)]"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('فتح', 'Open')}
                        </a>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--jt-stone-400)] transition-colors hover:bg-[var(--jt-terra-50)] hover:text-[var(--jt-terra-700)]"
                          aria-label={t('حذف', 'Delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AttachmentUploader
        open={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        treeId={treeId}
        personId={personId}
        defaultKind={uploaderKind}
        onUploaded={refresh}
        t={t}
        locale={locale}
      />

      <PhotoLightbox
        open={lightboxIndex !== null}
        photos={photos}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))}
        onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))}
        onSetPrimary={handleSetPrimary}
        onClearPrimary={handleClearPrimary}
        onDelete={handleDelete}
        primaryId={primaryId}
        canManage={canManage}
        t={t}
      />
    </section>
  );
}
