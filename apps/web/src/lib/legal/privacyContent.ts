import type { LegalDocument } from './types';

/**
 * Palestinian Roots Platform — Privacy Policy v1.1.
 * Source of record: partner-supplied "Palestinian_Roots_Privacy_Policy" document,
 * extended with three new sections (Data Controller, Cookies & Local Storage,
 * Openness) drafted for this Platform specifically and verified against the actual
 * codebase (cookie/localStorage usage, absence of analytics/ad trackers).
 * English body is transcribed faithfully; Arabic titles/summaries localised.
 */
export const PRIVACY_POLICY: LegalDocument = {
  kind: 'privacy',
  titleEn: 'Privacy Policy',
  titleAr: 'سياسة الخصوصية',
  subtitleEn: 'How we collect, use, protect, and respect your personal information',
  subtitleAr: 'كيف نجمع معلوماتك الشخصية ونستخدمها ونحميها ونحترمها',
  versionEn: 'Version 1.1',
  versionAr: 'الإصدار 1.1',
  effectiveEn: 'Effective upon platform launch',
  effectiveAr: 'سارية عند إطلاق المنصّة',
  importantNoticeEn:
    'This document is available in Arabic and English. In the event of any inconsistency between the two versions, the Arabic version shall prevail, as Arabic is the official language of this platform.',
  importantNoticeAr:
    'هذه الوثيقة متوفّرة بالعربية والإنجليزية. في حال وجود أي تعارض بين النسختين، تُعتمد النسخة العربية، لأنّ العربية هي اللغة الرسمية لهذه المنصّة.',
  contactEn:
    'Questions, rights requests, or complaints: privacy@palestinianroots.org (placeholder — to be confirmed). We aim to respond within 30 days.',
  contactAr:
    'للأسئلة أو طلبات ممارسة حقوقك أو الشكاوى: privacy@palestinianroots.org (مؤقّت — يُؤكَّد لاحقًا). نسعى للردّ خلال 30 يومًا.',
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
        },
        {
          type: 'p',
          en: 'This Privacy Policy explains what personal information we collect, why we collect it, how we use and protect it, who we share it with, and what rights you have over it. It applies to all users of the Platform, regardless of where in the world they are located.',
        },
        {
          type: 'p',
          en: 'By registering for and using the Platform, you confirm that you have read and understood this Privacy Policy. If you do not agree with any part of it, you should not use the Platform.',
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
      titleEn: 'Who We Are, and Who Controls Your Data',
      titleAr: 'من نحن، ومن يتحكّم ببياناتك',
      blocks: [
        {
          type: 'p',
          en: 'The Palestinian Roots Platform is an independent, non-profit, community-built initiative. We are not affiliated with any government, political party, or commercial genealogy company. There are no shareholders and no advertisers — the Platform is not, and will never be, a product built to be sold.',
        },
        {
          type: 'p',
          en: 'For the purposes of this Privacy Policy, Juthoor is the data controller: the entity responsible for deciding why and how your personal data is processed. [Legal entity name and registered address — placeholder, to be confirmed before launch.]',
        },
        {
          type: 'p',
          en: "The Platform's source code is public, so that any user — or any independent expert — can verify for themselves how personal data is actually handled, rather than having to take our word for it. Publishing the code does not mean publishing any user's personal data; your family tree, documents, and account details are never included in the public repository.",
        },
      ],
    },
    {
      id: 'privacy-3',
      numberEn: '3',
      numberAr: '3',
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
            },
            {
              termEn: 'Genealogical Data',
              termAr: 'البيانات النَّسَبية',
              defEn: "Information about an individual's family history, ancestry, lineage, and family relationships, including details of deceased relatives.",
            },
            {
              termEn: 'Sensitive Data',
              termAr: 'البيانات الحسّاسة',
              defEn: "A subset of personal data requiring heightened protection, including living individuals' whereabouts, contact details, and identity documents.",
            },
            {
              termEn: 'Individual Family Tree',
              termAr: 'شجرة العائلة الفردية',
              defEn: 'A family tree submitted and managed by a registered user, relating to their specific family.',
            },
            {
              termEn: 'Master Family Tree',
              termAr: 'الشجرة العائلية الأم',
              defEn: 'The unified Palestine Family Tree, formed by linking all connected Individual Family Trees.',
            },
            {
              termEn: 'User',
              termAr: 'المستخدم',
              defEn: 'Any person who has registered an account on the Platform.',
            },
            {
              termEn: 'Administrator',
              termAr: 'المسؤول',
              defEn: 'The designated platform manager with exclusive write access to the Master Family Tree.',
            },
            {
              termEn: 'GEDCOM',
              termAr: 'GEDCOM',
              defEn: 'A standard file format for exchanging genealogical data between systems.',
            },
            {
              termEn: 'Processing',
              termAr: 'المعالجة',
              defEn: 'Any operation performed on personal data, including collection, storage, use, and deletion.',
            },
          ],
        },
      ],
    },
    {
      id: 'privacy-4',
      numberEn: '4',
      numberAr: '4',
      titleEn: 'What Information We Collect',
      titleAr: 'ما المعلومات التي نجمعها',
      blocks: [
        { type: 'p', en: '4.1 Information you give us directly. When you register and use the Platform, you provide us with:' },
        {
          type: 'list',
          items: [
            { en: 'Account information: your name, email address, and password when you create an account.' },
            { en: 'Identity verification documents: copies of identity documents you upload to confirm your eligibility to access or manage a specific family tree.' },
            { en: 'Family tree data: names, dates of birth and death, places of birth and death, village and clan affiliations, family relationships, and other genealogical details.' },
            { en: 'Photographs and documents: images and files you upload to the picture gallery or document archive.' },
            { en: 'Messages: communications you send to other users or to the Administrator through the internal messaging system.' },
            { en: 'GEDCOM files: genealogical data files you import into or export from the Platform.' },
          ],
        },
        { type: 'p', en: '4.2 Information we collect automatically: log data (IP address, browser type, pages visited, time and date of visits) and your language preference (Arabic or English). See Section 9 for the small number of cookies and local-storage items involved.' },
        {
          type: 'p',
          en: '4.3 Information about other people. When you add individuals to your family tree, you provide personal data about people other than yourself — relatives both living and deceased. You must ensure you have the right to share this information and that doing so is consistent with the privacy expectations of the people concerned.',
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
      id: 'privacy-5',
      numberEn: '5',
      numberAr: '5',
      titleEn: 'How We Use Your Information',
      titleAr: 'كيف نستخدم معلوماتك',
      blocks: [
        { type: 'p', en: 'We use the information we collect to:' },
        {
          type: 'list',
          items: [
            { en: 'Run the Platform: create and manage your account; let you build, edit, and view family trees; link Individual Trees into the Master Tree; run end-of-day duplicate detection and merge processing; process GEDCOM import/export; and enable messaging.' },
            { en: 'Verify identity and access: verify your eligibility to manage a specific tree; review and approve or deny access requests; and maintain the security and integrity of the Platform.' },
            { en: 'Improve the Platform: understand how it is used, fix technical problems, and generate anonymised statistical data about the Palestinian diaspora (see Section 7).' },
            { en: 'Communicate with you: send notifications about activity on your tree; inform you of changes to the Platform, this Policy, or the Terms; and respond to your questions and support requests.' },
          ],
        },
        {
          type: 'p',
          en: 'We do not use your personal data for advertising, and we do not build advertising profiles. We do not make decisions about you based solely on automated processing that would have a significant effect on you.',
        },
      ],
    },
    {
      id: 'privacy-6',
      numberEn: '6',
      numberAr: '6',
      titleEn: 'Our Legal Basis for Processing Your Data',
      titleAr: 'الأساس القانوني لمعالجة بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Consent: where you have given clear consent for a specific purpose — for example, uploading a photograph or document.' },
            { en: 'Contract: where processing is necessary to fulfil the agreement between you and us when you register for and use the Platform.' },
            { en: 'Legitimate interests: where processing is necessary for our legitimate interest in operating a secure, accurate, and meaningful genealogical record for the Palestinian people, provided your rights are not overridden.' },
            { en: 'Legal obligation: where we are required to process data to comply with a legal requirement.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-7',
      numberEn: '7',
      numberAr: '7',
      titleEn: 'Anonymised and Aggregated Data',
      titleAr: 'البيانات المجهّلة والمجمّعة',
      blocks: [
        {
          type: 'p',
          en: 'We may generate statistical and demographic reports from the data held on the Platform — for example, the number of documented Palestinians by country, by district of origin within historic Palestine, or by generation. These reports are anonymised and aggregated: they will not identify any individual and cannot be traced back to a specific person.',
        },
        {
          type: 'p',
          en: 'Such reports may be shared with Palestinian civil society organisations, legal teams, advocacy groups, academic researchers, and intergovernmental bodies for purposes consistent with the Platform’s mission of documenting and supporting the Palestinian people.',
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
      id: 'privacy-8',
      numberEn: '8',
      numberAr: '8',
      titleEn: 'Who We Share Your Information With',
      titleAr: 'مع من نشارك معلوماتك',
      blocks: [
        { type: 'p', en: 'We do not sell your personal data. We do not share it with advertisers, and we do not use any third-party advertising or analytics trackers on the Platform. We share it only in these limited circumstances:' },
        {
          type: 'list',
          items: [
            { en: 'Other Platform users: information you add to your tree may be visible to other users, subject to the access rights and privacy settings you choose. You control what others can see.' },
            { en: 'The Administrator: has access to all data for verifying accounts, resolving duplicate records, managing the Master Tree, and maintaining security — bound by the same confidentiality obligations as all users.' },
            { en: 'Infrastructure providers: a small number of trusted providers host the Platform’s database, file storage, and authentication. They process your data only on our instructions, under a data processing agreement, and are contractually required to protect it. They do not use your data for their own purposes.' },
            { en: 'Legal requirements: where required by law, or in good faith to protect the rights, safety, or property of any person, or to comply with a legal process.' },
            { en: 'With your consent: in any other circumstances where you have given explicit, informed consent.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-9',
      numberEn: '9',
      numberAr: '9',
      titleEn: 'Cookies and Local Storage',
      titleAr: 'ملفّات تعريف الارتباط والتخزين المحلّي',
      blocks: [
        {
          type: 'p',
          en: 'We keep this section short because the Platform keeps its use of cookies short. We do not run advertising or analytics trackers of any kind, so there is no cross-site tracking or ad-profiling cookie to opt out of. The Platform uses only:',
        },
        {
          type: 'list',
          items: [
            { en: 'Authentication cookies: set when you sign in, so the Platform recognises your session. These are strictly necessary — without them you cannot stay signed in.' },
            { en: 'A UI-preference cookie: remembers whether your sidebar is open or collapsed. It stores no personal data and does not identify you.' },
            { en: "Local storage for language preference: your choice of Arabic or English is saved in your browser's local storage (not a cookie), so the Platform opens in the language you last used." },
          ],
        },
        {
          type: 'p',
          en: 'You can clear cookies and local storage at any time through your browser settings. Doing so will sign you out and reset the language preference, but will not affect the data stored in your account.',
        },
      ],
    },
    {
      id: 'privacy-10',
      numberEn: '10',
      numberAr: '10',
      titleEn: 'How Long We Keep Your Data',
      titleAr: 'مدّة احتفاظنا ببياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Account data: retained for as long as your account remains open.' },
            { en: 'Family tree data: retained indefinitely as part of the Platform’s permanent record. If you delete your account, genealogical data already linked to the Master Tree may be retained in anonymised or de-identified form, as removing it could disrupt other families’ records.' },
            { en: 'Photographs and documents: retained for as long as they remain linked to active records.' },
            { en: 'Identity verification documents: retained only as long as necessary to complete verification, after which they are securely deleted.' },
            { en: 'Log data: retained for a maximum of 12 months.' },
          ],
        },
      ],
    },
    {
      id: 'privacy-11',
      numberEn: '11',
      numberAr: '11',
      titleEn: 'How We Protect Your Data',
      titleAr: 'كيف نحمي بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'All data is transmitted over encrypted connections (HTTPS/TLS).' },
            { en: 'Passwords are stored using industry-standard hashing and never in plain text.' },
            { en: 'Access to personal data is restricted at the database level (row-level security policies), and further restricted to Platform staff and administrators on a need-to-know basis.' },
            { en: 'We conduct regular security review as the Platform evolves.' },
            { en: 'Identity verification documents are stored in a separately secured, access-logged environment.' },
            { en: 'We maintain a data breach response procedure and will notify affected users and relevant authorities in accordance with applicable law.' },
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
      id: 'privacy-12',
      numberEn: '12',
      numberAr: '12',
      titleEn: 'Your Rights Over Your Data',
      titleAr: 'حقوقك على بياناتك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: 'Right of access: request a copy of the personal data we hold about you.' },
            { en: 'Right to rectification: ask us to correct inaccurate or incomplete data.' },
            { en: 'Right to erasure: ask us to delete your personal data in certain circumstances. Genealogical data already incorporated into the Master Tree may be retained in anonymised form (see Section 10).' },
            { en: 'Right to restrict processing: ask us to restrict how we use your data in certain circumstances.' },
            { en: 'Right to data portability: receive a copy of your data in a portable, machine-readable format — including as a GEDCOM file for your family tree data.' },
            { en: 'Right to object: object to certain types of processing, including processing based on legitimate interests.' },
            { en: 'Right to withdraw consent: where we process your data based on consent, withdraw it at any time.' },
            { en: 'Right to lodge a complaint: you may lodge a complaint with a data protection supervisory authority in your country of residence, place of work, or where you believe an incident took place.' },
          ],
        },
        { type: 'p', en: 'To exercise any of these rights, contact us using the details in Section 17. We will respond to all requests within 30 days.' },
      ],
    },
    {
      id: 'privacy-13',
      numberEn: '13',
      numberAr: '13',
      titleEn: "Children's Privacy",
      titleAr: 'خصوصية الأطفال',
      blocks: [
        {
          type: 'p',
          en: 'The Platform is not intended for use by persons under the age of 16. We do not knowingly collect personal data directly from children under 16. If a child’s details are entered into a family tree by an adult user, those details receive the same protections as all other personal data, with the additional protection that the details of children will not be displayed publicly.',
        },
        {
          type: 'p',
          en: 'If we become aware that we have inadvertently collected personal data directly from a child under 16, we will take steps to delete it promptly.',
        },
      ],
    },
    {
      id: 'privacy-14',
      numberEn: '14',
      numberAr: '14',
      titleEn: 'International Data Transfers',
      titleAr: 'نقل البيانات دوليًا',
      blocks: [
        {
          type: 'p',
          en: 'The Platform serves users in many countries. Your data may be transferred to and stored on servers located in countries other than the one in which you live. We ensure all such transfers comply with applicable data protection law and that appropriate safeguards are in place wherever your data is held.',
        },
      ],
    },
    {
      id: 'privacy-15',
      numberEn: '15',
      numberAr: '15',
      titleEn: 'Openness and Community Trust',
      titleAr: 'الانفتاح وثقة المجتمع',
      blocks: [
        {
          type: 'p',
          en: "Juthoor is built and maintained in the open. The application's source code is publicly available, so that users, journalists, researchers, and independent security reviewers can examine exactly how data is stored, protected, and processed — rather than relying solely on this document.",
        },
        {
          type: 'p',
          en: 'Making the code public does not make your data public. Your family tree, uploaded documents, identity verification files, and messages are never included in the public repository, and access to the live database remains restricted as described in Section 11.',
        },
      ],
    },
    {
      id: 'privacy-16',
      numberEn: '16',
      numberAr: '16',
      titleEn: 'Changes to This Privacy Policy',
      titleAr: 'التغييرات على سياسة الخصوصية',
      blocks: [
        {
          type: 'p',
          en: 'We may update this Privacy Policy from time to time. When we make significant changes, we will notify all registered users by email and by a prominent notice on the Platform. The date at the top indicates when it was last updated. Your continued use after notification constitutes acceptance of the updated Policy.',
        },
      ],
    },
    {
      id: 'privacy-17',
      numberEn: '17',
      numberAr: '17',
      titleEn: 'How to Contact Us',
      titleAr: 'كيفية التواصل معنا',
      blocks: [
        {
          type: 'p',
          en: 'If you have questions about this Policy, wish to exercise your rights, or wish to make a complaint, contact the Data Protection Contact at privacy@palestinianroots.org (placeholder — to be confirmed). We aim to respond to all enquiries within 30 days.',
        },
      ],
    },
  ],
};
