/**
 * Bilingual tooltip copy for tree-builder form fields.
 *
 * Centralised here so translators (and the UX partner review) have
 * one file to edit. Keys mirror the form field names in
 * `AddPersonForm.tsx`.
 */

export interface TooltipCopy {
  readonly ar: string;
  readonly en: string;
}

export const TOOLTIP_COPY: Readonly<Record<string, TooltipCopy>> = {
  arGivenName: {
    ar: 'الاسم الأول بالعربية — مثل "أحمد" أو "فاطمة". هذا هو الاسم المفضل للعرض.',
    en: 'First name in Arabic — e.g. "أحمد" or "فاطمة". This is the preferred display name.',
  },
  arSurname: {
    ar: 'اسم العائلة بالعربية. يُورَّث تلقائيًا من الأب إن وُجد.',
    en: "Family surname in Arabic. Auto-inherits from the father when available.",
  },
  enGivenName: {
    ar: 'الاسم الأول بالإنجليزية (اختياري) — للتوافق مع وثائق الهجرة والأرشيف.',
    en: 'First name in English (optional) — for immigration documents and archives.',
  },
  enSurname: {
    ar: 'اسم العائلة بالإنجليزية (اختياري).',
    en: 'Family surname in English (optional).',
  },
  gender: {
    ar: 'الجنس. للنساء يُحفظ اسم العائلة قبل الزواج (الاسم الأصلي) وفقًا للمتطلبات الوظيفية.',
    en: 'Gender. For women, the maiden (pre-marriage) surname is stored per the FRS requirement.',
  },
  birthYear: {
    ar: 'سنة الميلاد — أربعة أرقام. اترك الحقل فارغًا إذا كانت مجهولة.',
    en: 'Birth year — four digits. Leave blank if unknown.',
  },
  deathYear: {
    ar: 'سنة الوفاة — إن كان الشخص متوفى. لا يمكن أن تسبق سنة الميلاد.',
    en: 'Death year — if the person is deceased. Cannot precede the birth year.',
  },
  placeOfOrigin: {
    ar: 'القرية أو المدينة الأصلية — اختر من قائمة القرى الفلسطينية المهجرة. يُورَّث تلقائيًا من الأب.',
    en: 'Origin village or town — pick from the depopulated villages list. Auto-inherits from the father.',
  },
  unrwaNumber: {
    ar: 'رقم تسجيل الأونروا إن وُجد — يُحفظ أيضًا كمعرّف شخصي.',
    en: 'UNRWA registration number if known — also stored as a person identifier.',
  },
  familyCard1948: {
    ar: 'رقم بطاقة العائلة من سجل 1948 إن توفر.',
    en: '1948 family card number when available.',
  },
  hostCountry: {
    ar: 'بلد اللجوء الأول أو الحالي بعد النزوح.',
    en: 'First or current host country after displacement.',
  },
  refugeeStatus: {
    ar: 'وضع اللجوء المسجّل (لاجئ، نازح داخليًا، إلخ).',
    en: 'Recorded refugee status (refugee, IDP, etc.).',
  },
  campName: {
    ar: 'اسم المخيم إن سكن العائلة في مخيم.',
    en: 'Camp name if the family lived in a refugee camp.',
  },
  displacementYear: {
    ar: 'سنة النزوح أو التهجير — أربعة أرقام إن عُرفت.',
    en: 'Year of displacement or expulsion — four digits when known.',
  },
  displacementWave: {
    ar: 'موجة النزوح (مثل 1948 أو 1967) عند معرفتها.',
    en: 'Displacement wave (e.g. 1948 or 1967) when known.',
  },
  oralHistory: {
    ar: 'رواية شفهية عن العائلة أو القرية — تُحفظ مع مصدرها إن أمكن.',
    en: 'Oral history about the family or village — store provenance when possible.',
  },
  oralHistoryProvenance: {
    ar: 'مصدر الرواية الشفهية — من روى، ومتى، وكيف وصلت إليك.',
    en: 'Provenance for the oral history — who told it, when, and how it reached you.',
  },
  landPropertyNotes: {
    ar: 'ملاحظات عن الأرض أو الممتلكات قبل النزوح أو بعده.',
    en: 'Notes about land or property before or after displacement.',
  },
  unrwaFieldOfOperations: {
    ar: 'مجال عمليات الأونروا (الأردن، لبنان، سوريا، الضفة، غزة).',
    en: 'UNRWA field of operations (Jordan, Lebanon, Syria, West Bank, Gaza).',
  },
  unrwaRegistrationDate: {
    ar: 'سنة تسجيل الأونروا — أربعة أرقام من 1948 فصاعدًا.',
    en: 'UNRWA registration year — four digits from 1948 onward.',
  },
  unrwaRegistrationStatus: {
    ar: 'حالة التسجيل لدى الأونروا: نشط، غير نشط، أو من نسل مسجّل.',
    en: 'UNRWA registration status: active, inactive, or descendant.',
  },
  unrwaServicesArea: {
    ar: 'منطقة تلقي خدمات الأونروا إن اختلفت عن مجال العمليات.',
    en: 'Area where UNRWA services are received, if different from the field.',
  },
  hostTravelDocumentNumber: {
    ar: 'رقم وثيقة السفر الصادرة من بلد اللجوء.',
    en: 'Travel document number issued by the host country.',
  },
  hostIdResidencyNumber: {
    ar: 'رقم الهوية أو الإقامة في بلد اللجوء.',
    en: 'Host-country national ID or residency number.',
  },
  paIdNumber: {
    ar: 'رقم الهوية الصادرة عن السلطة الفلسطينية.',
    en: 'Palestinian Authority ID number.',
  },
  palestinianPassportNumber: {
    ar: 'رقم جواز السفر الفلسطيني إن وُجد.',
    en: 'Palestinian passport number when available.',
  },
  israeliIdNumber: {
    ar: 'رقم الهوية الإسرائيلية — حساس، يظهر فقط لمن يدير السجل.',
    en: 'Israeli ID number — sensitive; shown only to record managers.',
  },
  otherIdentityDocument: {
    ar: 'وثيقة هوية أخرى لم تُدرج أعلاه — النوع والرقم إن أمكن.',
    en: 'Other identity document not listed above — type and number when known.',
  },
  landRecordReference: {
    ar: 'مرجع سجل الأرض أو رقم القطعة أو الصك.',
    en: 'Land record reference, parcel number, or deed citation.',
  },
  landRegistry: {
    ar: 'جهة السجل العقاري (طابو عثماني، انتداب بريطاني، إسرائيلي، سلطة، أخرى).',
    en: 'Land registry authority (Ottoman tapu, British Mandate, Israeli, PA, other).',
  },
  propertyLocation: {
    ar: 'موقع العقار أو الأرض — القرية، الحي، أو الوصف المعروف.',
    en: 'Property or land location — village, neighborhood, or known description.',
  },
  ownershipNature: {
    ar: 'طبيعة الملكية: مالك، شريك، وريث، أو مستأجر.',
    en: 'Nature of ownership: owner, co-owner, heir, or tenant.',
  },
};
