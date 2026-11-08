'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Check, MapPinned, Pencil, Upload, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getAttachmentUploadTarget,
  recordAttachment,
} from '@/data/user/attachments';
import {
  loadUnrwaEvidenceAttachmentId,
  savePersonDisplacement,
  type PersonDisplacement,
} from '@/data/user/personDisplacement';

/**
 * R13 displacement / UNRWA / host-country / oral-history section on the
 * person page. Editable when the viewer has optional-field write access
 * (record owner, grant, admin, or tree writer for deceased). Saving an
 * UNRWA number requires an uploaded card and sets evidence_attachment_id.
 */
export function DisplacementPanel({
  personId,
  treeId,
  initial,
  canManage,
  initialUnrwaEvidenceId = null,
}: {
  personId: string;
  treeId: string;
  initial: PersonDisplacement | null;
  canManage: boolean;
  initialUnrwaEvidenceId?: string | null;
}) {
  const { t } = useLocale();
  const [row, setRow] = useState<PersonDisplacement | null>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unrwa, setUnrwa] = useState('');
  const [familyCard, setFamilyCard] = useState('');
  const [hostFirst, setHostFirst] = useState('');
  const [hostCurrent, setHostCurrent] = useState('');
  const [refugeeStatus, setRefugeeStatus] = useState('');
  const [campName, setCampName] = useState('');
  const [dispYear, setDispYear] = useState('');
  const [dispWave, setDispWave] = useState('');
  const [landNotes, setLandNotes] = useState('');
  const [oralHistory, setOralHistory] = useState('');
  const [oralProv, setOralProv] = useState('');
  const [unrwaCardFile, setUnrwaCardFile] = useState<File | null>(null);
  const [existingEvidenceId, setExistingEvidenceId] = useState<string | null>(
    initialUnrwaEvidenceId,
  );

  const hasContent = Boolean(
    row?.unrwa_registration_number ||
      row?.family_card_1948_number ||
      row?.host_country_first ||
      row?.host_country_current ||
      row?.refugee_status ||
      row?.camp_name ||
      row?.displacement_year ||
      row?.displacement_wave ||
      row?.land_property_notes ||
      row?.oral_history ||
      row?.oral_history_provenance,
  );

  if (!hasContent && !canManage) return null;

  function startEditing() {
    setUnrwa(row?.unrwa_registration_number ?? '');
    setFamilyCard(row?.family_card_1948_number ?? '');
    setHostFirst(row?.host_country_first ?? '');
    setHostCurrent(row?.host_country_current ?? '');
    setRefugeeStatus(row?.refugee_status ?? '');
    setCampName(row?.camp_name ?? '');
    setDispYear(row?.displacement_year != null ? String(row.displacement_year) : '');
    setDispWave(row?.displacement_wave ?? '');
    setLandNotes(row?.land_property_notes ?? '');
    setOralHistory(row?.oral_history ?? '');
    setOralProv(row?.oral_history_provenance ?? '');
    setUnrwaCardFile(null);
    setError(null);
    setEditing(true);
    void loadUnrwaEvidenceAttachmentId(personId).then((id) => {
      if (id) setExistingEvidenceId(id);
    });
  }

  async function uploadUnrwaCard(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'bin';
    const kind = /\.pdf$/i.test(file.name) ? 'document' : 'photo';
    const { path, token } = await getAttachmentUploadTarget({
      treeId,
      personId,
      fileExtension: ext,
      kind,
    });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Storage is not configured');
    const browser = createClient(url, key);
    const { error: upErr } = await browser.storage
      .from('person-attachments')
      .uploadToSignedUrl(path, token, file);
    if (upErr) throw new Error(upErr.message);
    const recorded = await recordAttachment({
      personId,
      treeId,
      kind,
      tag: 'id_card',
      storagePath: path,
      mimeType: file.type || (kind === 'photo' ? 'image/jpeg' : 'application/pdf'),
      sizeBytes: file.size,
      title: 'UNRWA registration card',
      openMessageThread: false,
    });
    return recorded.id;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const yearRaw = dispYear.trim();
      const year = yearRaw === '' ? null : Number.parseInt(yearRaw, 10);
      if (yearRaw !== '' && Number.isNaN(year)) {
        throw new Error(t('سنة النزوح غير صالحة', 'Invalid displacement year'));
      }

      const unrwaValue = unrwa.trim();
      let evidenceId = existingEvidenceId;
      if (unrwaValue) {
        if (unrwaCardFile) {
          evidenceId = await uploadUnrwaCard(unrwaCardFile);
        }
        if (!evidenceId) {
          throw new Error(
            t(
              'رقم الأونروا يتطلب رفع صورة أو ملف البطاقة.',
              'UNRWA number requires an uploaded card file.',
            ),
          );
        }
      }

      const updated = await savePersonDisplacement({
        personId,
        unrwaRegistrationNumber: unrwaValue || null,
        familyCard1948Number: familyCard || null,
        hostCountryFirst: hostFirst || null,
        hostCountryCurrent: hostCurrent || null,
        refugeeStatus: refugeeStatus || null,
        campName: campName || null,
        displacementYear: year,
        displacementWave: dispWave || null,
        landPropertyNotes: landNotes || null,
        oralHistory: oralHistory || null,
        oralHistoryProvenance: oralProv || null,
        unrwaEvidenceAttachmentId: unrwaValue ? evidenceId : null,
      });
      setRow(updated);
      if (evidenceId) setExistingEvidenceId(evidenceId);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذّر الحفظ', 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <h3
          className="flex items-center gap-2 text-lg font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          <MapPinned className="h-5 w-5 text-[var(--jt-olive-700)]" />
          {t('النزوح والهوية', 'Displacement & identity')}
        </h3>
        {canManage && !editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" />
            {hasContent ? t('تعديل', 'Edit') : t('إضافة', 'Add')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('رقم تسجيل الأونروا', 'UNRWA registration number')}
              value={unrwa}
              onChange={setUnrwa}
            />
            <Field
              label={t('رقم بطاقة العائلة 1948', '1948 family card number')}
              value={familyCard}
              onChange={setFamilyCard}
            />
            <div className="sm:col-span-2 space-y-1">
              <span className="text-xs font-medium text-[var(--jt-stone-600)]">
                {t('صورة بطاقة الأونروا (مطلوبة مع الرقم)', 'UNRWA card file (required with number)')}
              </span>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm hover:border-[var(--jt-olive-400)]">
                <Upload className="h-4 w-4 text-[var(--jt-olive-700)]" />
                <span className="truncate">
                  {unrwaCardFile?.name
                    ?? (existingEvidenceId
                      ? t('بطاقة مرفوعة سابقًا — اختر ملفًا للاستبدال', 'Card on file — pick a file to replace')
                      : t('اختر صورة أو PDF', 'Choose image or PDF'))}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setUnrwaCardFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <Field
              label={t('بلد اللجوء الأول', 'First host country')}
              value={hostFirst}
              onChange={setHostFirst}
            />
            <Field
              label={t('بلد اللجوء الحالي', 'Current host country')}
              value={hostCurrent}
              onChange={setHostCurrent}
            />
            <Field
              label={t('وضع اللجوء', 'Refugee status')}
              value={refugeeStatus}
              onChange={setRefugeeStatus}
            />
            <Field
              label={t('اسم المخيم', 'Camp name')}
              value={campName}
              onChange={setCampName}
            />
            <Field
              label={t('سنة النزوح', 'Displacement year')}
              value={dispYear}
              onChange={setDispYear}
              inputMode="numeric"
            />
            <Field
              label={t('موجة النزوح', 'Displacement wave')}
              value={dispWave}
              onChange={setDispWave}
            />
            <div className="sm:col-span-2">
              <Area
                label={t('ملاحظات الأرض والممتلكات', 'Land / property notes')}
                value={landNotes}
                onChange={setLandNotes}
              />
            </div>
            <div className="sm:col-span-2">
              <Area
                label={t('التاريخ الشفهي', 'Oral history')}
                value={oralHistory}
                onChange={setOralHistory}
              />
            </div>
            <div className="sm:col-span-2">
              <Area
                label={t('مصدر الرواية الشفهية', 'Oral history provenance')}
                value={oralProv}
                onChange={setOralProv}
              />
            </div>
            {error ? (
              <p className="sm:col-span-2 text-sm text-destructive">{error}</p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Check className="h-3.5 w-3.5" />
                {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                <X className="h-3.5 w-3.5" />
                {t('إلغاء', 'Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <ReadRow label={t('رقم الأونروا', 'UNRWA #')} value={row?.unrwa_registration_number} />
            <ReadRow label={t('بطاقة 1948', '1948 card')} value={row?.family_card_1948_number} />
            {row?.unrwa_registration_number ? (
              <ReadRow
                label={t('دليل بطاقة الأونروا', 'UNRWA card evidence')}
                value={
                  existingEvidenceId
                    ? t('مرفق', 'Attached')
                    : t('ناقص — غير مؤهّل للمطابقة التامة', 'Missing — not perfect-match eligible')
                }
              />
            ) : null}
            <ReadRow label={t('بلد اللجوء الأول', 'First host')} value={row?.host_country_first} />
            <ReadRow label={t('بلد اللجوء الحالي', 'Current host')} value={row?.host_country_current} />
            <ReadRow label={t('وضع اللجوء', 'Refugee status')} value={row?.refugee_status} />
            <ReadRow label={t('المخيم', 'Camp')} value={row?.camp_name} />
            <ReadRow
              label={t('سنة النزوح', 'Displacement year')}
              value={row?.displacement_year != null ? String(row.displacement_year) : null}
            />
            <ReadRow label={t('موجة النزوح', 'Wave')} value={row?.displacement_wave} />
            <ReadRow
              label={t('الأرض والممتلكات', 'Land / property')}
              value={row?.land_property_notes}
              wide
            />
            <ReadRow label={t('التاريخ الشفهي', 'Oral history')} value={row?.oral_history} wide />
            <ReadRow
              label={t('مصدر الرواية', 'Provenance')}
              value={row?.oral_history_provenance}
              wide
            />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'numeric';
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--jt-stone-600)]">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--jt-stone-600)]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
}

function ReadRow({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null | undefined;
  wide?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium text-[var(--jt-stone-500)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[var(--jt-olive-900)]">{value}</dd>
    </div>
  );
}
