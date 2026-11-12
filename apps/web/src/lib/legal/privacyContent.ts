import type { LegalDocument } from './types';

/** Public privacy inbox. Override with NEXT_PUBLIC_PRIVACY_EMAIL in env. */
export const PRIVACY_EMAIL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim()) ||
  'privacy@juthoor.app';

/** Clickable href only. Never put the mailto: prefix into visible copy. */
export const PRIVACY_MAILTO = `mailto:${PRIVACY_EMAIL}`;

/**
 * Palestinian Roots Platform — Privacy Policy v1.0.
 * Source of record: partner-supplied "Palestinian_Roots_Privacy_Policy" document.
 * Full Arabic translation added by Claude — DRAFT, pending legal review before
 * publishing (Arabic is the controlling version per Section importantNotice,
 * so this draft must be checked by counsel/a native-legal reviewer before the
 * "under legal review" notice in LegalDocumentView is removed).
 */
export const PRIVACY_POLICY: LegalDocument = {
  kind: 'privacy',
  titleEn: 'Privacy Policy',
  titleAr: 'سياسة الخصوصية',
  subtitleEn: 'How we collect, use, protect, and respect your personal information',
  subtitleAr: 'كيف نجمع معلوماتك الشخصية ونستخدمها ونحميها ونحترمها',
  versionEn: 'Version 1.0',
  versionAr: 'الإصدار 1.0',
  effectiveEn: 'Effective upon platform launch',
  effectiveAr: 'سارية عند إطلاق المنصّة',
  importantNoticeEn:
    'This document is available in Arabic and English. In the event of any inconsistency between the two versions, the Arabic version shall prevail, as Arabic is the official language of this platform.',
  importantNoticeAr:
    'هذه الوثيقة متوفّرة بالعربية والإنجليزية. في حال وجود أي تعارض بين النسختين، تُعتمد النسخة العربية، لأنّ العربية هي اللغة الرسمية لهذه المنصّة.',
  contactEn: `Questions, rights requests, or complaints: ${PRIVACY_EMAIL}. We aim to respond within 30 days.`,
  contactAr: `للأسئلة أو طلبات ممارسة حقوقك أو الشكاوى: ${PRIVACY_EMAIL}. نسعى للردّ خلال 30 يومًا.`,
  sections: [
    {
      id: 'privacy-1',
      numberEn: '1',
      numberAr: '1',
      titleEn: 'Introduction',
      titleAr: 'مقدّمة',
      blocks: [
        {
          type: 'p',
          en: 'The Palestinian Roots Platform (referred to as "the Platform", "we", or "us") is committed to protecting the privacy of every person who uses it. We understand that the information you share with us is not ordinary data — it is your family history, your heritage, and in many cases deeply personal details about yourself, your relatives, and your ancestors. We treat it with the seriousness and respect that it deserves.',
          ar: 'تلتزم منصّة الجذور الفلسطينية ("المنصّة"، أو "نحن") بحماية خصوصية كلّ شخص يستخدمها. نُدرك أنّ المعلومات التي تشاركها معنا ليست بيانات عادية — إنّها تاريخ عائلتك وإرثها، وفي كثير من الأحيان تفاصيل شخصية عميقة عنك وعن أقاربك وأجدادك. نتعامل معها بما تستحقّه من جدّية واحترام.',
        },
        {
          type: 'p',
          en: 'This Privacy Policy explains what personal information we collect, why we collect it, how we use and protect it, who we share it with, and what rights you have over it. It applies to all users of the Platform, regardless of where in the world they are located.',
          ar: 'توضّح سياسة الخصوصية هذه ما هي المعلومات الشخصية التي نجمعها، ولماذا نجمعها، وكيف نستخدمها ونحميها، ومع من نشاركها، وما هي حقوقك عليها. تنطبق هذه السياسة على جميع مستخدمي المنصّة، بغضّ النظر عن مكان تواجدهم في العالم.',
        },
        {
          type: 'p',
          en: 'By registering for and using the Platform, you confirm that you have read and understood this Privacy Policy. If you do not agree with any part of it, you should not use the Platform.',
          ar: 'بتسجيلك واستخدامك للمنصّة، فإنّك تؤكّد أنّك قرأت سياسة الخصوصية هذه وفهمتها. إذا كنت لا توافق على أي جزء منها، فلا يجب أن تستخدم المنصّة.',
        },
        {
          type: 'callout',
          tone: 'olive',
          titleEn: 'Our core commitment',
          titleAr: 'التزامنا الجوهري',
          en: "Your family's information belongs to your family. We are the custodians of your data, not its owners. We will never sell it, profit from it, or use it for any purpose other than running this Platform in service of the Palestinian people.",
          ar: 'معلومات عائلتك ملكٌ لعائلتك. نحن أُمناء على بياناتك، لا مالكون لها. لن نبيعها أبدًا، ولن نربح منها، ولن نستخدمها لأي غرض سوى تشغيل هذه المنصّة في خدمة الشعب الفلسطيني.',
        },
      ],
    },
    {
      id: 'privacy-2',
      numberEn: '2',
      numberAr: '2',
      titleEn: 'Definitions',
      titleAr: 'التعريفات',
      blocks: [
        {
          type: 'defs',
          rows: [
            {
              termEn: 'Personal Data',
              termAr: 'البيانات الشخصية',
              defEn: 'Any information that can identify a living individual, directly or indirectly — names, dates of birth, contact details, photographs, and family relationship data.',
              defAr: 'أي معلومة يمكن أن تحدّد هوية شخص حيّ، بشكل مباشر أو غير مباشر — كالأسماء، وتواريخ الميلاد، وبيانات التواصل، والصور، وبيانات العلاقات العائلية.',
            },
            {
              termEn: 'Genealogical Data',
              termAr: 'البيانات النَّسَبية',
              defEn: "Information about an individual's family history, ancestry, lineage, and family relationships, including details of deceased relatives.",
              defAr: 'معلومات عن تاريخ عائلة الشخص، ونسبه، وسلالته، وعلاقاته العائلية، بما في ذلك تفاصيل عن أقارب متوفّين.',
            },
            {
              termEn: 'Sensitive Data',
              termAr: 'البيانات الحسّاسة',
              defEn: "A subset of personal data requiring heightened protection, including living individuals' whereabouts, contact details, and identity documents.",
              defAr: 'فئة من البيانات الشخصية تتطلّب حماية إضافية، وتشمل أماكن تواجد الأشخاص الأحياء، وبيانات التواصل الخاصة بهم، ووثائق إثبات الهوية.',
            },
            {
              termEn: 'Individual Family Tree',
              termAr: 'شجرة العائلة الفردية',
              defEn: 'A family tree submitted and managed by a registered user, relating to their specific family.',
              defAr: 'شجرة عائلة يُنشئها ويديرها مستخدم مسجَّل، وتخصّ عائلته تحديدًا.',
            },
            {
              termEn: 'Master Family Tree',
              termAr: 'الشجرة العائلية الأم',
              defEn: 'The unified Palestine Family Tree, formed by linking all connected Individual Family Trees.',
              defAr: 'شجرة فلسطين العائلية الموحّدة، المتكوّنة من ربط جميع شجرات العائلات الفردية المتّصلة.',
            },
            {
              termEn: 'User',
              termAr: 'المستخدم',
              defEn: 'Any person who has registered an account on the Platform.',
              defAr: 'أي شخص أنشأ حسابًا على المنصّة.',
            },
            {
              termEn: 'Administrator',
              termAr: 'المسؤول',
              defEn: 'The designated platform manager with exclusive write access to the Master Family Tree.',
              defAr: 'مدير المنصّة المعيَّن، وهو الوحيد الذي يملك صلاحية الكتابة على الشجرة العائلية الأم.',
            },
            {
              termEn: 'GEDCOM',
              termAr: 'GEDCOM',
              defEn: 'A standard file format for exchanging genealogical data between systems.',
              defAr: 'صيغة ملفّات معيارية لتبادل البيانات النَّسَبية بين الأنظمة.',
            },
            {
              termEn: 'Processing',
              termAr: 'المعالجة',
              defEn: 'Any operation performed on personal data, including collection, storage, use, and deletion.',
              defAr: 'أي عملية تُجرى على البيانات الشخصية، بما في ذلك الجمع والتخزين والاستخدام والحذف.',
            },
          ],
        },
      ],
    },
    {
      id: 'privacy-3',
      numberEn: '3',
      numberAr: '3',
      titleEn: 'What Information We Collect',
      titleAr: 'ما المعلومات التي نجمعها',
      blocks: [
        {
          type: 'p',
          en: '3.1 Information you give us directly. When you register and use the Platform, you provide us with:',
          ar: '3.1 المعلومات التي تزوّدنا بها مباشرة. عند التسجيل واستخدام المنصّة، تزوّدنا بما يلي:',
        },
        {
          type: 'list',
          items: [
            { en: 'Account information: your name, email address, and password when you create an account.', ar: 'معلومات الحساب: اسمك، وبريدك الإلكتروني، وكلمة المرور عند إنشاء حسابك.' },
            { en: 'Identity verification documents: copies of identity documents you upload to confirm your eligibility to access or manage a specific family tree.', ar: 'وثائق التحقّق من الهوية: نسخ من وثائق إثبات الهوية التي ترفعها لتأكيد أهليتك للوصول إلى شجرة عائلة معيّنة أو إدارتها.' },
            { en: 'Family tree data: names, dates of birth and death, places of birth and death, village and clan affiliations, family relationships, and other genealogical details.', ar: 'بيانات شجرة العائلة: الأسماء، وتواريخ الميلاد والوفاة، وأماكن الميلاد والوفاة، والانتماء إلى القرية أو العشيرة، والعلاقات العائلية، وتفاصيل نَسَبية أخرى.' },
            { en: 'Photographs and documents: images and files you upload to the picture gallery or document archive.', ar: 'الصور والوثائق: الصور والملفّات التي ترفعها إلى معرض الصور أو أرشيف الوثائق.' },
            { en: 'Messages: communications you send to other users or to the Administrator through the internal messaging system.', ar: 'الرسائل: المراسلات التي ترسلها إلى مستخدمين آخرين أو إلى المسؤول عبر نظام المراسلة الداخلي.' },
            { en: 'GEDCOM files: genealogical data files you import into or export from the Platform.', ar: 'ملفّات GEDCOM: ملفّات البيانات النَّسَبية التي تستوردها إلى المنصّة أو تصدّرها منها.' },
          ],
        },
        {
          type: 'p',
          en: '3.2 Information we collect automatically: log data (IP address, browser type, pages visited, time and date of visits), device information, and your language preference (Arabic or English).',
          ar: '3.2 المعلومات التي نجمعها تلقائيًا: بيانات السجلّ (عنوان IP، ونوع المتصفّح، والصفحات التي تمّت زيارتها، ووقت الزيارة وتاريخها)، ومعلومات الجهاز، وتفضيل اللغة لديك (عربي أو إنجليزي).',
        },
        {
          type: 'p',
          en: '3.3 Information about other people. When you add individuals to your family tree, you provide personal data about people other than yourself — relatives both living and deceased. You must ensure you have the right to share this information and that doing so is consistent with the privacy expectations of the people concerned.',
          ar: '3.3 معلومات عن أشخاص آخرين. عند إضافة أفراد إلى شجرة عائلتك، فإنّك تزوّدنا ببيانات شخصية عن أشخاص غيرك — أقارب أحياء ومتوفّين. يجب أن تتأكّد من أنّ لديك الحقّ في مشاركة هذه المعلومات، وأنّ ذلك يتوافق مع توقّعات الخصوصية لدى الأشخاص المعنيّين.',
        },
        {
          type: 'callout',
          tone: 'terra',
          titleEn: 'Special note on living individuals',
          titleAr: 'ملاحظة خاصّة بالأشخاص الأحياء',
          en: 'We apply additional protections to the personal data of living individuals. Certain details — including contact information, exact dates of birth, and current location — are restricted from public view by default and may only be accessed in accordance with the access rights set by the family tree owner.',
          ar: 'نطبّق حمايات إضافية على البيانات الشخصية للأشخاص الأحياء. بعض التفاصيل — كمعلومات الاتصال وتواريخ الميلاد الدقيقة والموقع الحالي — مُقيَّدة عن العرض العام افتراضيًا، ولا يُتاح الوصول إليها إلا وفق صلاحيات الوصول التي يحدّدها مالك شجرة العائلة.',
        },
      ],
    },
    {
      id: 'privacy-4',
      numberEn: '4',
      numberAr: '4',
      titleEn: 'How We Use Your Information',
      titleAr: 'كيف نستخدم معلوماتك',
      blocks: [
        { type: 'p', en: 'We use the information we collect to:', ar: 'نستخدم المعلومات التي نجمعها من أجل:' },
        {
          type: 'list',
          items: [
            { en: 'Run the Platform: create and manage your account; let you build, edit, and view family trees; link Individual Trees into the Master Tree; run end-of-day duplicate detection and merge processing; process GEDCOM import/export; and enable messaging.', ar: 'تشغيل المنصّة: إنشاء حسابك وإدارته؛ وتمكينك من بناء شجرات العائلة وتعديلها وعرضها؛ وربط الشجرات الفردية بالشجرة الأم؛ وتشغيل عملية كشف التكرار والدمج اليومية؛ ومعالجة استيراد وتصدير ملفّات GEDCOM؛ وتفعيل نظام المراسلة.' },
            { en: 'Verify identity and access: verify your eligibility to manage a specific tree; review and approve or deny access requests; and maintain the security and integrity of the Platform.', ar: 'التحقّق من الهوية والوصول: التحقّق من أهليتك لإدارة شجرة معيّنة؛ ومراجعة طلبات الوصول والموافقة عليها أو رفضها؛ والحفاظ على أمن المنصّة وسلامتها.' },
            { en: 'Improve the Platform: understand how it is used, fix technical problems, and generate anonymised statistical data about the Palestinian diaspora (see Section 6).', ar: 'تحسين المنصّة: فهم كيفية استخدامها، وإصلاح المشاكل التقنية، وإصدار بيانات إحصائية مجهّلة عن الشتات الفلسطيني (انظر القسم 6).' },
            { en: 'Communicate with you: send notifications about activity on your tree; inform you of changes to the Platform, this Policy, or the Terms; and respond to your questions and support requests.', ar: 'التواصل معك: إرسال إشعارات حول النشاط على شجرتك؛ وإعلامك بأي تغييرات على المنصّة أو هذه السياسة أو الشروط؛ والردّ على أسئلتك وطلبات الدعم.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-5',
      numberEn: '5',
      numberAr: '5',
      titleEn: 'Our Legal Basis for Processing Your Data',
      titleAr: 'الأساس القانوني لمعالجة بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Consent: where you have given clear consent for a specific purpose — for example, uploading a photograph or document.', ar: 'الموافقة: عندما تمنحنا موافقة واضحة لغرض محدّد — كرفع صورة أو وثيقة، على سبيل المثال.' },
            { en: 'Contract: where processing is necessary to fulfil the agreement between you and us when you register for and use the Platform.', ar: 'العقد: عندما تكون المعالجة ضرورية للوفاء بالاتفاق بينك وبيننا عند تسجيلك واستخدامك للمنصّة.' },
            { en: 'Legitimate interests: where processing is necessary for our legitimate interest in operating a secure, accurate, and meaningful genealogical record for the Palestinian people, provided your rights are not overridden.', ar: 'المصلحة المشروعة: عندما تكون المعالجة ضرورية لمصلحتنا المشروعة في تشغيل سجلّ نَسَبي آمن ودقيق وذي معنى للشعب الفلسطيني، شريطة ألّا تطغى هذه المصلحة على حقوقك.' },
            { en: 'Legal obligation: where we are required to process data to comply with a legal requirement.', ar: 'الالتزام القانوني: عندما يكون علينا معالجة البيانات امتثالًا لمتطلّب قانوني.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-6',
      numberEn: '6',
      numberAr: '6',
      titleEn: 'Anonymised and Aggregated Data',
      titleAr: 'البيانات المجهّلة والمجمّعة',
      blocks: [
        {
          type: 'p',
          en: 'We may generate statistical and demographic reports from the data held on the Platform — for example, the number of documented Palestinians by country, by district of origin within historic Palestine, or by generation. These reports are anonymised and aggregated: they will not identify any individual and cannot be traced back to a specific person.',
          ar: 'قد نُصدر تقارير إحصائية وديموغرافية من البيانات الموجودة على المنصّة — مثل عدد الفلسطينيين الموثَّقين حسب الدولة، أو حسب القضاء الأصلي داخل فلسطين التاريخية، أو حسب الجيل. هذه التقارير مجهّلة ومجمّعة: لن تحدّد هوية أي فرد، ولا يمكن تتبّعها للوصول إلى شخص بعينه.',
        },
        {
          type: 'p',
          en: 'Such reports may be shared with Palestinian civil society organisations, legal teams, advocacy groups, academic researchers, and intergovernmental bodies for purposes consistent with the Platform’s mission of documenting and supporting the Palestinian people.',
          ar: 'قد تُشارَك هذه التقارير مع منظّمات المجتمع المدني الفلسطيني، والفرق القانونية، وجماعات المناصرة، والباحثين الأكاديميين، والهيئات الحكومية الدولية، لأغراض تتّسق مع رسالة المنصّة في توثيق الشعب الفلسطيني ودعمه.',
        },
        {
          type: 'callout',
          tone: 'olive',
          titleEn: 'What this means in practice',
          titleAr: 'ماذا يعني هذا عمليًا',
          en: 'A report might say: "There are 2,340 documented descendants of families from a specific district, now living in 18 countries." It will never say who those individuals are, where they live today, or how to contact them.',
          ar: 'قد يقول تقرير: «يوجد 2,340 من ذرية عائلات من منطقة معيّنة، يعيشون اليوم في 18 دولة.» لكنّه لن يذكر أبدًا هويّة هؤلاء الأفراد، أو أين يعيشون اليوم، أو كيفية التواصل معهم.',
        },
      ],
    },
    {
      id: 'privacy-7',
      numberEn: '7',
      numberAr: '7',
      titleEn: 'Who We Share Your Information With',
      titleAr: 'مع من نشارك معلوماتك',
      blocks: [
        { type: 'p', en: 'We do not sell your personal data. We do not share it with advertisers. We share it only in these limited circumstances:', ar: 'نحن لا نبيع بياناتك الشخصية، ولا نشاركها مع المعلنين. لا نشاركها إلّا في هذه الحالات المحدودة:' },
        {
          type: 'list',
          items: [
            { en: 'Other Platform users: information you add to your tree may be visible to other users, subject to the access rights and privacy settings you choose. You control what others can see.', ar: 'مستخدمو المنصّة الآخرون: قد تكون المعلومات التي تضيفها إلى شجرتك مرئية لمستخدمين آخرين، وفقًا لصلاحيات الوصول وإعدادات الخصوصية التي تختارها. أنت من يتحكّم بما يراه الآخرون.' },
            { en: 'The Administrator: has access to all data for verifying accounts, resolving duplicate records, managing the Master Tree, and maintaining security — bound by the same confidentiality obligations as all users.', ar: 'المسؤول: يملك صلاحية الوصول إلى جميع البيانات للتحقّق من الحسابات، وحلّ السجلّات المكرّرة، وإدارة الشجرة الأم، والحفاظ على الأمن — وهو ملتزم بواجبات السرّية نفسها التي يلتزم بها جميع المستخدمين.' },
            { en: 'Service providers: a small number of trusted providers (cloud hosting and security) process your data only on our instructions and are contractually required to protect it.', ar: 'مزوّدو الخدمات: عدد محدود من المزوّدين الموثوقين (الاستضافة السحابية والأمن) يعالجون بياناتك بناءً على تعليماتنا فقط، وهم ملزَمون تعاقديًا بحمايتها.' },
            { en: 'Legal requirements: where required by law, or in good faith to protect the rights, safety, or property of any person, or to comply with a legal process.', ar: 'المتطلّبات القانونية: عندما يقتضي القانون ذلك، أو بحسن نيّة لحماية حقوق أي شخص أو سلامته أو ممتلكاته، أو للامتثال لإجراء قانوني.' },
            { en: 'With your consent: in any other circumstances where you have given explicit, informed consent.', ar: 'بموافقتك: في أي حالات أخرى تمنحنا فيها موافقة صريحة ومستنيرة.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-8',
      numberEn: '8',
      numberAr: '8',
      titleEn: 'How Long We Keep Your Data',
      titleAr: 'مدّة احتفاظنا ببياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Account data: retained for as long as your account remains open.', ar: 'بيانات الحساب: تُحفظ طالما بقي حسابك مفتوحًا.' },
            { en: 'Family tree data: retained indefinitely as part of the Platform’s permanent record. If you delete your account, genealogical data already linked to the Master Tree may be retained in anonymised or de-identified form, as removing it could disrupt other families’ records.', ar: 'بيانات شجرة العائلة: تُحفظ إلى أجل غير مسمّى كجزء من السجلّ الدائم للمنصّة. في حال حذفت حسابك، قد تُحفظ البيانات النَّسَبية المرتبطة مسبقًا بالشجرة الأم بصيغة مجهّلة أو منزوعة الهوية، لأنّ إزالتها قد يخلّ بسجلّات عائلات أخرى.' },
            { en: 'Photographs and documents: retained for as long as they remain linked to active records.', ar: 'الصور والوثائق: تُحفظ طالما بقيت مرتبطة بسجلّات نشطة.' },
            { en: 'Identity verification documents: retained only as long as necessary to complete verification, after which they are securely deleted.', ar: 'وثائق التحقّق من الهوية: تُحفظ فقط للمدّة اللازمة لإتمام التحقّق، ثمّ تُحذف بشكل آمن.' },
            { en: 'Log data: retained for a maximum of 12 months.', ar: 'بيانات السجلّ: تُحفظ لمدّة أقصاها 12 شهرًا.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-9',
      numberEn: '9',
      numberAr: '9',
      titleEn: 'How We Protect Your Data',
      titleAr: 'كيف نحمي بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'All data is transmitted over encrypted connections (HTTPS/TLS).', ar: 'تُنقل جميع البيانات عبر اتصالات مشفّرة (HTTPS/TLS).' },
            { en: 'Passwords are stored using industry-standard hashing and never in plain text.', ar: 'تُخزَّن كلمات المرور باستخدام تشفير هاش وفق المعايير المعتمدة في الصناعة، ولا تُخزَّن أبدًا كنصّ عادي.' },
            { en: 'Access to personal data is restricted to Platform staff and administrators on a need-to-know basis.', ar: 'يقتصر الوصول إلى البيانات الشخصية على فريق المنصّة والمسؤولين، وفق مبدأ «الحاجة إلى المعرفة».' },
            { en: 'We conduct regular security audits and vulnerability assessments.', ar: 'نُجري بشكل دوري تدقيقات أمنية وتقييمات لنقاط الضعف.' },
            { en: 'Identity verification documents are stored in a separately secured, access-logged environment.', ar: 'تُخزَّن وثائق التحقّق من الهوية في بيئة آمنة منفصلة، يُسجَّل فيها كلّ وصول إليها.' },
            { en: 'We maintain a data breach response procedure and will notify affected users and relevant authorities in accordance with applicable law.', ar: 'نحتفظ بإجراء للاستجابة لأي اختراق للبيانات، وسنُبلغ المستخدمين المتأثّرين والجهات المختصّة وفقًا للقانون المعمول به.' },
          ],
        },
        {
          type: 'callout',
          tone: 'terra',
          titleEn: 'No system is perfectly secure',
          titleAr: 'لا يوجد نظام آمن تمامًا',
          en: 'While we take every reasonable precaution, no online platform can guarantee absolute security. Please use a strong, unique password and notify us immediately if you suspect any unauthorised access.',
          ar: 'رغم اتّخاذنا كلّ الاحتياطات المعقولة، لا يمكن لأي منصّة على الإنترنت أن تضمن أمانًا مطلقًا. الرجاء استخدام كلمة مرور قوية وفريدة، وإبلاغنا فورًا عند الاشتباه بأي وصول غير مصرّح به.',
        },
      ],
    },
    {
      id: 'privacy-10',
      numberEn: '10',
      numberAr: '10',
      titleEn: 'Your Rights Over Your Data',
      titleAr: 'حقوقك على بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Right of access: request a copy of the personal data we hold about you.', ar: 'الحقّ في الاطّلاع: طلب نسخة من البيانات الشخصية التي نحتفظ بها عنك.' },
            { en: 'Right to rectification: ask us to correct inaccurate or incomplete data.', ar: 'الحقّ في التصحيح: طلب تصحيح أي بيانات غير دقيقة أو ناقصة.' },
            { en: 'Right to erasure: ask us to delete your personal data in certain circumstances. Genealogical data already incorporated into the Master Tree may be retained in anonymised form (see Section 8).', ar: 'الحقّ في المحو: طلب حذف بياناتك الشخصية في حالات معيّنة. قد تُحفظ البيانات النَّسَبية المدمجة مسبقًا في الشجرة الأم بصيغة مجهّلة (انظر القسم 8).' },
            { en: 'Right to restrict processing: ask us to restrict how we use your data in certain circumstances.', ar: 'الحقّ في تقييد المعالجة: طلب تقييد كيفية استخدامنا لبياناتك في حالات معيّنة.' },
            { en: 'Right to data portability: receive a copy of your data in a portable, machine-readable format — including as a GEDCOM file for your family tree data.', ar: 'الحقّ في نقل البيانات: الحصول على نسخة من بياناتك بصيغة قابلة للنقل وقراءة الآلة — بما في ذلك بصيغة ملفّ GEDCOM لبيانات شجرة عائلتك.' },
            { en: 'Right to object: object to certain types of processing, including processing based on legitimate interests.', ar: 'الحقّ في الاعتراض: الاعتراض على أنواع معيّنة من المعالجة، بما فيها المعالجة القائمة على المصلحة المشروعة.' },
            { en: 'Right to withdraw consent: where we process your data based on consent, withdraw it at any time.', ar: 'الحقّ في سحب الموافقة: سحب موافقتك في أي وقت عندما تكون معالجتنا لبياناتك قائمة عليها.' },
          ],
        },
        { type: 'p', en: 'To exercise any of these rights, contact us using the details in Section 14. We will respond to all requests within 30 days.', ar: 'لممارسة أي من هذه الحقوق، تواصل معنا عبر البيانات الواردة في القسم 14. سنردّ على جميع الطلبات خلال 30 يومًا.' },
      ],
    },
    {
      id: 'privacy-11',
      numberEn: '11',
      numberAr: '11',
      titleEn: "Children's Privacy",
      titleAr: 'خصوصية الأطفال',
      blocks: [
        {
          type: 'p',
          en: 'The Platform is not intended for use by persons under the age of 16. We do not knowingly collect personal data directly from children under 16. If a child’s details are entered into a family tree by an adult user, those details receive the same protections as all other personal data, with the additional protection that the details of children will not be displayed publicly.',
          ar: 'لا تهدف المنصّة إلى الاستخدام من قِبل أشخاص دون سنّ 16 عامًا. نحن لا نجمع عن قصد بيانات شخصية مباشرة من أطفال دون سنّ 16 عامًا. إذا أُدخلت تفاصيل طفل إلى شجرة عائلة من قبل مستخدم بالغ، فإنّ تلك التفاصيل تحظى بالحماية نفسها التي تحظى بها سائر البيانات الشخصية، مع حماية إضافية تتمثّل في عدم عرض تفاصيل الأطفال للعامة.',
        },
        {
          type: 'p',
          en: 'If we become aware that we have inadvertently collected personal data directly from a child under 16, we will take steps to delete it promptly.',
          ar: 'إذا علمنا أنّنا جمعنا عن غير قصد بيانات شخصية مباشرة من طفل دون سنّ 16 عامًا، فسنتّخذ خطوات لحذفها فورًا.',
        },
      ],
    },
    {
      id: 'privacy-12',
      numberEn: '12',
      numberAr: '12',
      titleEn: 'International Data Transfers',
      titleAr: 'نقل البيانات دوليًا',
      blocks: [
        {
          type: 'p',
          en: 'The Platform serves users in many countries. Your data may be transferred to and stored on servers located in countries other than the one in which you live. We ensure all such transfers comply with applicable data protection law and that appropriate safeguards are in place wherever your data is held.',
          ar: 'تخدم المنصّة مستخدمين في دول عديدة. قد تُنقَل بياناتك وتُخزَّن على خوادم تقع في دول غير الدولة التي تقيم فيها. نحرص على أن تتوافق جميع عمليات النقل هذه مع قوانين حماية البيانات المعمول بها، وعلى وجود ضمانات ملائمة أينما احتُفظ ببياناتك.',
        },
      ],
    },
    {
      id: 'privacy-13',
      numberEn: '13',
      numberAr: '13',
      titleEn: 'Changes to This Privacy Policy',
      titleAr: 'التغييرات على سياسة الخصوصية',
      blocks: [
        {
          type: 'p',
          en: 'We may update this Privacy Policy from time to time. When we make significant changes, we will notify all registered users by email and by a prominent notice on the Platform. The date at the top indicates when it was last updated. Your continued use after notification constitutes acceptance of the updated Policy.',
          ar: 'قد نُحدِّث سياسة الخصوصية هذه من وقتٍ لآخر. عند إجراء تغييرات جوهرية، سنُبلغ جميع المستخدمين المسجَّلين عبر البريد الإلكتروني وبإشعار بارز على المنصّة. يشير التاريخ أعلى الوثيقة إلى آخر تحديث لها. استمرارك في استخدام المنصّة بعد الإشعار يُعدّ قبولًا بالسياسة المحدَّثة.',
        },
      ],
    },
    {
      id: 'privacy-14',
      numberEn: '14',
      numberAr: '14',
      titleEn: 'How to Contact Us',
      titleAr: 'كيفية التواصل معنا',
      blocks: [
        {
          type: 'p',
          en: `If you have questions about this Policy, wish to exercise your rights, or wish to make a complaint, contact the Data Protection Contact at ${PRIVACY_EMAIL}. We aim to respond to all enquiries within 30 days.`,
          ar: `إذا كانت لديك أسئلة حول هذه السياسة، أو ترغب في ممارسة حقوقك، أو تقديم شكوى، تواصل مع جهة الاتصال المعنية بحماية البيانات عبر ${PRIVACY_EMAIL}. نسعى للردّ على جميع الاستفسارات خلال 30 يومًا.`,
        },
      ],
    },
  ],
};
