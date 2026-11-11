'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Check, MapPinned, Pencil, Upload, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FieldHint } from '@/components/tree/FieldHint';
import {
  getAttachmentUploadTarget,
  recordAttachment,
} from '@/data/user/attachments';
import {
  loadUnrwaEvidenceAttachmentId,
  savePersonDisplacement,
  type PersonDisplacement,
} from '@/data/user/personDisplacement';
import { TOOLTIP_COPY } from '@/lib/tree/tooltipCopy';

const UNRWA_FIELD_OPTIONS = [
  { value: 'jordan', ar: 'الأردن', en: 'Jordan' },
  { value: 'lebanon', ar: 'لبنان', en: 'Lebanon' },
  { value: 'syria', ar: 'سوريا', en: 'Syria' },
  { value: 'west_bank', ar: 'الضفة الغربية', en: 'West Bank' },
  { value: 'gaza', ar: 'غزة', en: 'Gaza' },
] as const;

const UNRWA_STATUS_OPTIONS = [
  { value: 'active', ar: 'نشط', en: 'Active' },
  { value: 'inactive', ar: 'غير نشط', en: 'Inactive' },
  { value: 'descendant', ar: 'من نسل مسجّل', en: 'Descendant' },
] as const;

const LAND_REGISTRY_OPTIONS = [
  { value: 'ottoman_tapu', ar: 'طابو عثماني', en: 'Ottoman tapu' },
  { value: 'british_mandate', ar: 'انتداب بريطاني', en: 'British Mandate' },
  { value: 'israeli', ar: 'إسرائيلي', en: 'Israeli' },
  { value: 'pa', ar: 'السلطة الفلسطينية', en: 'Palestinian Authority' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
] as const;

const OWNERSHIP_NATURE_OPTIONS = [
  { value: 'owner', ar: 'مالك', en: 'Owner' },
  { value: 'co_owner', ar: 'شريك', en: 'Co-owner' },
  { value: 'heir', ar: 'وريث', en: 'Heir' },
  { value: 'tenant', ar: 'مستأجر', en: 'Tenant' },
] as const;

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
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
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
  const [unrwaField, setUnrwaField] = useState('');
  const [unrwaRegYear, setUnrwaRegYear] = useState('');
  const [unrwaStatus, setUnrwaStatus] = useState('');
  const [unrwaServices, setUnrwaServices] = useState('');
  const [hostTravelDoc, setHostTravelDoc] = useState('');
  const [hostIdResidency, setHostIdResidency] = useState('');
  const [paId, setPaId] = useState('');
  const [paPassport, setPaPassport] = useState('');
  const [israeliId, setIsraeliId] = useState('');
  const [otherIdDoc, setOtherIdDoc] = useState('');
  const [landRecordRef, setLandRecordRef] = useState('');
  const [landRegistry, setLandRegistry] = useState('');
  const [propertyLocation, setPropertyLocation] = useState('');
  const [ownershipNature, setOwnershipNature] = useState('');
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
      row?.oral_history_provenance ||
      row?.unrwa_field_of_operations ||
      row?.unrwa_registration_date ||
      row?.unrwa_registration_status ||
      row?.unrwa_services_area ||
      row?.host_travel_document_number ||
      row?.host_id_residency_number ||
      row?.pa_id_number ||
      row?.palestinian_passport_number ||
      row?.other_identity_document ||
      row?.land_record_reference ||
      row?.land_registry ||
      row?.property_location ||
      row?.ownership_nature ||
      (canManage && row?.israeli_id_number),
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
    setUnrwaField(row?.unrwa_field_of_operations ?? '');
    setUnrwaRegYear(
      row?.unrwa_registration_date != null ? String(row.unrwa_registration_date) : '',
    );
    setUnrwaStatus(row?.unrwa_registration_status ?? '');
    setUnrwaServices(row?.unrwa_services_area ?? '');
    setHostTravelDoc(row?.host_travel_document_number ?? '');
    setHostIdResidency(row?.host_id_residency_number ?? '');
    setPaId(row?.pa_id_number ?? '');
    setPaPassport(row?.palestinian_passport_number ?? '');
    setIsraeliId(row?.israeli_id_number ?? '');
    setOtherIdDoc(row?.other_identity_document ?? '');
    setLandRecordRef(row?.land_record_reference ?? '');
    setLandRegistry(row?.land_registry ?? '');
    setPropertyLocation(row?.property_location ?? '');
    setOwnershipNature(row?.ownership_nature ?? '');
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
    try {
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
    } catch (insertErr) {
      const { removeOrphanedAttachmentObjectAction } = await import(
        '@/data/user/attachmentsCleanup'
      );
      await removeOrphanedAttachmentObjectAction({ storagePath: path }).catch(
        () => undefined,
      );
      throw insertErr;
    }
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

      const regYearRaw = unrwaRegYear.trim();
      const regYear = regYearRaw === '' ? null : Number.parseInt(regYearRaw, 10);
      if (regYearRaw !== '' && Number.isNaN(regYear)) {
        throw new Error(
          t('سنة تسجيل الأونروا غير صالحة', 'Invalid UNRWA registration year'),
        );
      }

      // '' clears identifier/text fields (RPC NULL = keep; '' = clear).
      const unrwaValue = unrwa.trim();
      const priorUnrwa = (row?.unrwa_registration_number ?? '').trim();
      const unrwaChangingToNonEmpty =
        unrwaValue.length > 0 && unrwaValue !== priorUnrwa;

      let evidenceId = existingEvidenceId;
      if (unrwaValue.length > 0) {
        if (unrwaCardFile) {
          evidenceId = await uploadUnrwaCard(unrwaCardFile);
        }
        // Evidence required when setting/changing UNRWA to a non-empty value.
        // Unchanged UNRWA may reuse existing evidence on file.
        if ((unrwaChangingToNonEmpty || !priorUnrwa) && !evidenceId) {
          throw new Error(
            t(
              'رقم الأونروا يتطلب رفع صورة أو ملف البطاقة.',
              'UNRWA number requires an uploaded card file.',
            ),
          );
        }
        if (!evidenceId && priorUnrwa === unrwaValue && existingEvidenceId) {
          evidenceId = existingEvidenceId;
        }
      }

      const updated = await savePersonDisplacement({
        personId,
        unrwaRegistrationNumber: unrwaValue,
        familyCard1948Number: familyCard.trim(),
        hostCountryFirst: hostFirst.trim(),
        hostCountryCurrent: hostCurrent.trim(),
        refugeeStatus: refugeeStatus.trim(),
        campName: campName.trim(),
        displacementYear: year,
        displacementWave: dispWave.trim(),
        landPropertyNotes: landNotes.trim(),
        oralHistory: oralHistory.trim(),
        oralHistoryProvenance: oralProv.trim(),
        unrwaFieldOfOperations: selectOrEmpty(unrwaField, UNRWA_FIELD_OPTIONS),
        unrwaRegistrationDate: regYear,
        unrwaRegistrationStatus: selectOrEmpty(
          unrwaStatus,
          UNRWA_STATUS_OPTIONS,
        ),
        unrwaServicesArea: unrwaServices.trim(),
        hostTravelDocumentNumber: hostTravelDoc.trim(),
        hostIdResidencyNumber: hostIdResidency.trim(),
        paIdNumber: paId.trim(),
        palestinianPassportNumber: paPassport.trim(),
        israeliIdNumber: israeliId.trim(),
        otherIdentityDocument: otherIdDoc.trim(),
        landRecordReference: landRecordRef.trim(),
        landRegistry: selectOrEmpty(landRegistry, LAND_REGISTRY_OPTIONS),
        propertyLocation: propertyLocation.trim(),
        ownershipNature: selectOrEmpty(
          ownershipNature,
          OWNERSHIP_NATURE_OPTIONS,
        ),
        unrwaEvidenceAttachmentId:
          unrwaValue.length > 0 ? (evidenceId ?? null) : null,
      });
      setRow(updated);
      if (evidenceId) setExistingEvidenceId(evidenceId);
      if (!unrwaValue) setExistingEvidenceId(null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذّر الحفظ', 'Could not save'));
    } finally {
      setSaving(false);
    }
  }

  function labelFor(
    options: ReadonlyArray<{ value: string; ar: string; en: string }>,
    value: string | null | undefined,
  ): string | null {
    if (!value) return null;
    const opt = options.find((o) => o.value === value);
    if (!opt) return value;
    return isAR ? opt.ar : opt.en;
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
              hintKey="unrwaNumber"
            />
            <Field
              label={t('رقم بطاقة العائلة 1948', '1948 family card number')}
              value={familyCard}
              onChange={setFamilyCard}
              hintKey="familyCard1948"
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
            <SelectField
              label={t('مجال عمليات الأونروا', 'UNRWA field of operations')}
              value={unrwaField}
              onChange={setUnrwaField}
              options={UNRWA_FIELD_OPTIONS}
              isAR={isAR}
              hintKey="unrwaFieldOfOperations"
              emptyLabel={t('— اختر —', '— Select —')}
            />
            <Field
              label={t('سنة تسجيل الأونروا', 'UNRWA registration year')}
              value={unrwaRegYear}
              onChange={setUnrwaRegYear}
              inputMode="numeric"
              hintKey="unrwaRegistrationDate"
            />
            <SelectField
              label={t('حالة تسجيل الأونروا', 'UNRWA registration status')}
              value={unrwaStatus}
              onChange={setUnrwaStatus}
              options={UNRWA_STATUS_OPTIONS}
              isAR={isAR}
              hintKey="unrwaRegistrationStatus"
              emptyLabel={t('— اختر —', '— Select —')}
            />
            <Field
              label={t('منطقة خدمات الأونروا', 'UNRWA services area')}
              value={unrwaServices}
              onChange={setUnrwaServices}
              hintKey="unrwaServicesArea"
            />
            <Field
              label={t('بلد اللجوء الأول', 'First host country')}
              value={hostFirst}
              onChange={setHostFirst}
              hintKey="hostCountry"
            />
            <Field
              label={t('بلد اللجوء الحالي', 'Current host country')}
              value={hostCurrent}
              onChange={setHostCurrent}
              hintKey="hostCountry"
            />
            <Field
              label={t('وضع اللجوء', 'Refugee status')}
              value={refugeeStatus}
              onChange={setRefugeeStatus}
              hintKey="refugeeStatus"
            />
            <Field
              label={t('اسم المخيم', 'Camp name')}
              value={campName}
              onChange={setCampName}
              hintKey="campName"
            />
            <Field
              label={t('سنة النزوح', 'Displacement year')}
              value={dispYear}
              onChange={setDispYear}
              inputMode="numeric"
              hintKey="displacementYear"
            />
            <Field
              label={t('موجة النزوح', 'Displacement wave')}
              value={dispWave}
              onChange={setDispWave}
              hintKey="displacementWave"
            />
            <Field
              label={t('رقم وثيقة السفر المضيفة', 'Host travel document number')}
              value={hostTravelDoc}
              onChange={setHostTravelDoc}
              hintKey="hostTravelDocumentNumber"
            />
            <Field
              label={t('رقم هوية/إقامة المضيف', 'Host ID / residency number')}
              value={hostIdResidency}
              onChange={setHostIdResidency}
              hintKey="hostIdResidencyNumber"
            />
            <Field
              label={t('رقم الهوية الفلسطينية', 'PA ID number')}
              value={paId}
              onChange={setPaId}
              hintKey="paIdNumber"
            />
            <Field
              label={t('رقم جواز السفر الفلسطيني', 'Palestinian passport number')}
              value={paPassport}
              onChange={setPaPassport}
              hintKey="palestinianPassportNumber"
            />
            {canManage ? (
              <Field
                label={t('رقم الهوية الإسرائيلية', 'Israeli ID number')}
                value={israeliId}
                onChange={setIsraeliId}
                hintKey="israeliIdNumber"
              />
            ) : null}
            <Field
              label={t('وثيقة هوية أخرى', 'Other identity document')}
              value={otherIdDoc}
              onChange={setOtherIdDoc}
              hintKey="otherIdentityDocument"
            />
            <Field
              label={t('مرجع سجل الأرض', 'Land record reference')}
              value={landRecordRef}
              onChange={setLandRecordRef}
              hintKey="landRecordReference"
            />
            <SelectField
              label={t('السجل العقاري', 'Land registry')}
              value={landRegistry}
              onChange={setLandRegistry}
              options={LAND_REGISTRY_OPTIONS}
              isAR={isAR}
              hintKey="landRegistry"
              emptyLabel={t('— اختر —', '— Select —')}
            />
            <Field
              label={t('موقع العقار', 'Property location')}
              value={propertyLocation}
              onChange={setPropertyLocation}
              hintKey="propertyLocation"
            />
            <SelectField
              label={t('طبيعة الملكية', 'Ownership nature')}
              value={ownershipNature}
              onChange={setOwnershipNature}
              options={OWNERSHIP_NATURE_OPTIONS}
              isAR={isAR}
              hintKey="ownershipNature"
              emptyLabel={t('— اختر —', '— Select —')}
            />
            <div className="sm:col-span-2">
              <Area
                label={t('ملاحظات الأرض والممتلكات', 'Land / property notes')}
                value={landNotes}
                onChange={setLandNotes}
                hintKey="landPropertyNotes"
              />
            </div>
            <div className="sm:col-span-2">
              <Area
                label={t('التاريخ الشفهي', 'Oral history')}
                value={oralHistory}
                onChange={setOralHistory}
                hintKey="oralHistory"
              />
            </div>
            <div className="sm:col-span-2">
              <Area
                label={t('مصدر الرواية الشفهية', 'Oral history provenance')}
                value={oralProv}
                onChange={setOralProv}
                hintKey="oralHistoryProvenance"
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
            <ReadRow
              label={t('مجال عمليات الأونروا', 'UNRWA field')}
              value={labelFor(UNRWA_FIELD_OPTIONS, row?.unrwa_field_of_operations)}
            />
            <ReadRow
              label={t('سنة تسجيل الأونروا', 'UNRWA reg. year')}
              value={
                row?.unrwa_registration_date != null
                  ? String(row.unrwa_registration_date)
                  : null
              }
            />
            <ReadRow
              label={t('حالة تسجيل الأونروا', 'UNRWA status')}
              value={labelFor(UNRWA_STATUS_OPTIONS, row?.unrwa_registration_status)}
            />
            <ReadRow
              label={t('منطقة خدمات الأونروا', 'UNRWA services area')}
              value={row?.unrwa_services_area}
            />
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
              label={t('وثيقة السفر المضيفة', 'Host travel doc')}
              value={row?.host_travel_document_number}
            />
            <ReadRow
              label={t('هوية/إقامة المضيف', 'Host ID / residency')}
              value={row?.host_id_residency_number}
            />
            <ReadRow label={t('الهوية الفلسطينية', 'PA ID')} value={row?.pa_id_number} />
            <ReadRow
              label={t('جواز السفر الفلسطيني', 'PA passport')}
              value={row?.palestinian_passport_number}
            />
            {canManage ? (
              <ReadRow
                label={t('الهوية الإسرائيلية', 'Israeli ID')}
                value={row?.israeli_id_number}
              />
            ) : null}
            <ReadRow
              label={t('وثيقة هوية أخرى', 'Other ID document')}
              value={row?.other_identity_document}
            />
            <ReadRow
              label={t('مرجع سجل الأرض', 'Land record ref')}
              value={row?.land_record_reference}
            />
            <ReadRow
              label={t('السجل العقاري', 'Land registry')}
              value={labelFor(LAND_REGISTRY_OPTIONS, row?.land_registry)}
            />
            <ReadRow
              label={t('موقع العقار', 'Property location')}
              value={row?.property_location}
            />
            <ReadRow
              label={t('طبيعة الملكية', 'Ownership')}
              value={labelFor(OWNERSHIP_NATURE_OPTIONS, row?.ownership_nature)}
            />
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

type HintKey = keyof typeof TOOLTIP_COPY;

function selectOrEmpty<const T extends ReadonlyArray<{ value: string }>>(
  value: string,
  options: T,
): T[number]['value'] | '' {
  if (value === '') return '';
  return options.some((o) => o.value === value)
    ? (value as T[number]['value'])
    : '';
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  hintKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'numeric';
  hintKey?: HintKey;
}) {
  return (
    <label className="block space-y-1">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--jt-stone-600)]">
        {label}
        {hintKey ? <FieldHint fieldKey={hintKey} /> : null}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  isAR,
  hintKey,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; ar: string; en: string }>;
  isAR: boolean;
  hintKey?: HintKey;
  emptyLabel: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--jt-stone-600)]">
        {label}
        {hintKey ? <FieldHint fieldKey={hintKey} /> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">{emptyLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {isAR ? opt.ar : opt.en}
          </option>
        ))}
      </select>
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  hintKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hintKey?: HintKey;
}) {
  return (
    <label className="block space-y-1">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--jt-stone-600)]">
        {label}
        {hintKey ? <FieldHint fieldKey={hintKey} /> : null}
      </span>
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
