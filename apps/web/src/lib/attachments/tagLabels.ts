import type { AttachmentTag } from '@/data/user/attachments';

export const TAG_LABELS: Record<AttachmentTag, { ar: string; en: string }> = {
  portrait: { ar: 'صورة شخصية', en: 'Portrait' },
  id_card: { ar: 'بطاقة هوية', en: 'ID card' },
  passport: { ar: 'جواز سفر', en: 'Passport' },
  birth_cert: { ar: 'شهادة ميلاد', en: 'Birth certificate' },
  death_cert: { ar: 'شهادة وفاة', en: 'Death certificate' },
  marriage_cert: { ar: 'عقد زواج', en: 'Marriage certificate' },
  land_deed: { ar: 'وثيقة عقارية', en: 'Land deed' },
  family_card: { ar: 'بطاقة عائلية', en: 'Family card' },
  unrwa_card: { ar: 'بطاقة الأونروا', en: 'UNRWA card' },
  letter: { ar: 'رسالة', en: 'Letter' },
  old_photo: { ar: 'صورة قديمة', en: 'Old photo' },
  other: { ar: 'أخرى', en: 'Other' },
};

export const PHOTO_TAGS: AttachmentTag[] = ['portrait', 'old_photo', 'other'];
export const DOCUMENT_TAGS: AttachmentTag[] = [
  'id_card',
  'passport',
  'birth_cert',
  'death_cert',
  'marriage_cert',
  'land_deed',
  'family_card',
  'unrwa_card',
  'letter',
  'other',
];
