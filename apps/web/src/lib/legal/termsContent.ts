import type { LegalDocument } from './types';

/**
 * Palestinian Roots Platform — Terms & Conditions v1.0.
 * Source of record: partner-supplied "Palestinian_Roots_Terms_and_Conditions" document.
 * Full Arabic translation added by Claude — DRAFT, pending legal review before
 * publishing (Arabic is the controlling version per Section importantNotice,
 * so this draft must be checked by counsel/a native-legal reviewer before the
 * "under legal review" notice in LegalDocumentView is removed).
 */
export const TERMS_AND_CONDITIONS: LegalDocument = {
  kind: 'terms',
  titleEn: 'Terms & Conditions',
  titleAr: 'الشروط والأحكام',
  subtitleEn: 'The rules that govern use of this platform — and why they exist',
  subtitleAr: 'القواعد التي تحكم استخدام هذه المنصّة — ولماذا وُجدت',
  versionEn: 'Version 1.0',
  versionAr: 'الإصدار 1.0',
  effectiveEn: 'Effective upon platform launch',
  effectiveAr: 'سارية عند إطلاق المنصّة',
  importantNoticeEn:
    'This document is available in Arabic and English. In the event of any inconsistency between the two versions, the Arabic version shall prevail, as Arabic is the official language of this platform. Each article includes a plain-language summary in a shaded box; these summaries are provided to help you understand the section and are not legally binding — the full text governs in all cases.',
  importantNoticeAr:
    'هذه الوثيقة متوفّرة بالعربية والإنجليزية. في حال وجود أي تعارض بين النسختين، تُعتمد النسخة العربية، لأنّ العربية هي اللغة الرسمية لهذه المنصّة. يتضمّن كلّ بند ملخّصًا بلغة مبسّطة في إطار مظلّل؛ هذه الملخّصات للمساعدة على الفهم فقط وليست مُلزِمة قانونيًا — النصّ الكامل هو الحاكم في جميع الأحوال.',
  contactEn:
    'Questions about these Terms: legal@juthoor.app (placeholder — to be confirmed upon launch).',
  contactAr:
    'للأسئلة حول هذه الشروط: legal@juthoor.app (مؤقّت — يُؤكَّد عند الإطلاق).',
  sections: [
    {
      id: 'terms-art-1',
      numberEn: 'Article 1',
      numberAr: 'البند 1',
      titleEn: 'Definitions',
      titleAr: 'التعريفات',
      blocks: [
        {
          type: 'defs',
          rows: [
            { termEn: 'Platform', termAr: 'المنصّة', defEn: 'The Palestinian Roots Platform website, application, and all associated services.', defAr: 'موقع منصّة الجذور الفلسطينية وتطبيقها وجميع الخدمات المرتبطة بها.' },
            { termEn: 'We / Us / Our', termAr: 'نحن', defEn: 'The operators and administrators of the Palestinian Roots Platform.', defAr: 'الجهة المشغّلة والمديرة لمنصّة الجذور الفلسطينية.' },
            { termEn: 'You / User', termAr: 'أنت / المستخدم', defEn: 'Any person who creates an account and uses the Platform.', defAr: 'أي شخص ينشئ حسابًا ويستخدم المنصّة.' },
            { termEn: 'Individual Family Tree', termAr: 'شجرة العائلة الفردية', defEn: 'A family tree created and managed by a registered User.', defAr: 'شجرة عائلة ينشئها ويديرها مستخدم مسجَّل.' },
            { termEn: 'Master Family Tree', termAr: 'الشجرة العائلية الأم', defEn: 'The unified Palestine Family Tree formed by linking all connected Individual Family Trees.', defAr: 'شجرة فلسطين العائلية الموحّدة، المتكوّنة من ربط جميع شجرات العائلات الفردية المتّصلة.' },
            { termEn: 'Administrator', termAr: 'المسؤول', defEn: 'The designated person with overall management authority and sole write access to the Master Family Tree.', defAr: 'الشخص المعيَّن صاحب سلطة الإدارة العامة، وهو الوحيد الذي يملك صلاحية الكتابة على الشجرة العائلية الأم.' },
            { termEn: 'Content', termAr: 'المحتوى', defEn: 'All data, text, photographs, documents, and other material submitted to the Platform by Users.', defAr: 'جميع البيانات والنصوص والصور والوثائق والمواد الأخرى التي يقدّمها المستخدمون إلى المنصّة.' },
            { termEn: 'GEDCOM', termAr: 'GEDCOM', defEn: 'Genealogy Data Communication — a standard file format for genealogical data.', defAr: 'اختصار لعبارة Genealogy Data Communication — صيغة ملفّات معيارية للبيانات النَّسَبية.' },
            { termEn: 'EOD Processing', termAr: 'معالجة نهاية اليوم', defEn: 'End-of-day automated processing, including duplicate detection and tree-linking operations.', defAr: 'معالجة آلية تُجرى في نهاية كلّ يوم، وتشمل عمليات كشف التكرار وربط الأشجار.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-2',
      numberEn: 'Article 2',
      numberAr: 'البند 2',
      titleEn: 'Who Can Use the Platform',
      titleAr: 'من يمكنه استخدام المنصّة',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '2.1 The Platform is open to all individuals of Palestinian heritage or who have a genuine connection to or interest in Palestinian families and history.', ar: '2.1 المنصّة مفتوحة لجميع الأفراد من أصل فلسطيني، أو من لديهم صلة حقيقية بالعائلات والتاريخ الفلسطيني أو اهتمام فعلي بهما.' },
            { en: '2.2 To create an account, you must be at least 16 years of age.', ar: '2.2 يجب أن يكون عمرك 16 عامًا على الأقلّ لإنشاء حساب.' },
            { en: '2.3 To obtain Read / Write / Edit access to a specific Individual Family Tree, you must provide satisfactory evidence of your belonging to that family, as determined by the Administrator.', ar: '2.3 للحصول على صلاحية القراءة / الكتابة / التعديل على شجرة عائلة فردية معيّنة، يجب أن تقدّم دليلًا مُقنعًا على انتمائك إلى تلك العائلة، وفق تقدير المسؤول.' },
            { en: '2.4 View / Read-Only access to the Master Family Tree is available to all registered Users with valid credentials, regardless of family affiliation.', ar: '2.4 صلاحية العرض / القراءة فقط على الشجرة العائلية الأم متاحة لجميع المستخدمين المسجَّلين ممّن لديهم بيانات دخول صالحة، بغضّ النظر عن انتمائهم العائلي.' },
            { en: '2.5 You may only register one account. Creating multiple accounts is prohibited and may result in suspension.', ar: '2.5 يجوز لك تسجيل حساب واحد فقط. يُمنع إنشاء حسابات متعدّدة، وقد يؤدّي ذلك إلى إيقاف الحساب.' },
          ],
        },
      ],
      summary: {
        en: 'Anyone can join and browse the Palestine Family Tree. To add or edit your family’s records, you need to show that you actually belong to that family.',
        ar: 'يمكن لأي شخص الانضمام وتصفّح شجرة عائلة فلسطين. ولإضافة سجلّات عائلتك أو تعديلها، عليك إثبات انتمائك الفعلي إلى تلك العائلة.',
      },
    },
    {
      id: 'terms-art-3',
      numberEn: 'Article 3',
      numberAr: 'البند 3',
      titleEn: 'Your Account',
      titleAr: 'حسابك',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '3.1 You are responsible for keeping your login credentials secure. Do not share your password.', ar: '3.1 أنت مسؤول عن الحفاظ على سرّية بيانات تسجيل دخولك. لا تشارك كلمة مرورك مع أحد.' },
            { en: '3.2 You are responsible for all activity under your account. If you believe it has been compromised, notify us immediately.', ar: '3.2 أنت مسؤول عن جميع الأنشطة التي تجري تحت حسابك. إن اعتقدت أنّ حسابك تعرّض للاختراق، أبلغنا فورًا.' },
            { en: '3.3 You must provide accurate information when registering and keep it up to date.', ar: '3.3 يجب أن تقدّم معلومات دقيقة عند التسجيل، وأن تحافظ على تحديثها.' },
            { en: '3.4 You may close your account at any time by contacting us. Genealogical data contributed to the Master Tree may be retained in anonymised form per the Privacy Policy.', ar: '3.4 يمكنك إغلاق حسابك في أي وقت بالتواصل معنا. قد تُحفظ البيانات النَّسَبية المساهَم بها في الشجرة الأم بصيغة مجهّلة وفقًا لسياسة الخصوصية.' },
            { en: '3.5 We reserve the right to suspend or close accounts that violate these Terms, that we have reason to believe contain false or fraudulent information, or that are used harmfully.', ar: '3.5 نحتفظ بالحقّ في إيقاف أو إغلاق أي حساب يخالف هذه الشروط، أو يوجد لدينا سبب للاعتقاد بأنّه يحتوي معلومات كاذبة أو احتيالية، أو يُستخدم بشكل ضارّ.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-4',
      numberEn: 'Article 4',
      numberAr: 'البند 4',
      titleEn: 'The Information You Add to the Platform',
      titleAr: 'المعلومات التي تضيفها إلى المنصّة',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '4.1 You are responsible for ensuring the information you add is, to the best of your knowledge, accurate and truthful. Knowingly submitting false, fabricated, or misleading genealogical information is a serious breach of these Terms.', ar: '4.1 أنت مسؤول عن التأكّد من أنّ المعلومات التي تضيفها دقيقة وصحيحة على حدّ علمك. يُعدّ تقديم معلومات نَسَبية كاذبة أو ملفّقة أو مضلِّلة عن علم مخالفةً جسيمة لهذه الشروط.' },
            { en: '4.2 When you add information about other people — living or deceased — you represent that you have the right to submit it and that doing so does not violate any other person’s rights.', ar: '4.2 عند إضافة معلومات عن أشخاص آخرين — أحياء أو متوفّين — فإنّك تقرّ بأنّ لديك الحقّ في تقديمها، وأنّ ذلك لا يخالف حقوق أي شخص آخر.' },
            { en: '4.3 By submitting Content, you grant us a non-exclusive, worldwide, royalty-free licence to store, process, display, and use it for operating the Platform and fulfilling its mission. You retain ownership of your Content.', ar: '4.3 بتقديمك للمحتوى، فإنّك تمنحنا ترخيصًا غير حصري وعالمي النطاق وخاليًا من أي رسوم، لتخزين المحتوى ومعالجته وعرضه واستخدامه لتشغيل المنصّة وتحقيق رسالتها. تحتفظ بملكية محتواك.' },
          ],
        },
        { type: 'p', en: '4.4 You must not submit Content that is false, misleading, or fabricated; infringes the intellectual property, privacy, or other rights of any third party; is defamatory, abusive, threatening, or hateful; contains malware or harmful code; or is used to impersonate another person.', ar: '4.4 يجب ألّا تقدّم محتوى كاذبًا أو مضلِّلًا أو ملفَّقًا؛ أو ينتهك الملكية الفكرية أو الخصوصية أو أي حقوق أخرى لطرف ثالث؛ أو يكون تشهيريًا أو مسيئًا أو تهديديًا أو يحضّ على الكراهية؛ أو يحتوي برمجيات ضارّة أو أكواد خبيثة؛ أو يُستخدم لانتحال شخصية شخص آخر.' },
        {
          type: 'callout',
          tone: 'olive',
          titleEn: '4.5 The female surname standard',
          titleAr: '4.5 معيار اسم العائلة للإناث',
          en: "In line with the Platform's policy for maintaining family connectivity, all female individuals must be recorded using their maiden (birth) surname, not their married surname. This applies whether the individual is living or deceased.",
          ar: 'حفاظًا على ترابط العائلات، يُسجَّل جميع الأفراد من الإناث باسم العائلة الأصلي (اسم الميلاد)، لا باسم عائلة الزوج. ينطبق هذا سواء كانت على قيد الحياة أم متوفّاة.',
        },
      ],
      summary: {
        en: 'Only add information you genuinely believe to be true. You are responsible for what you put in. Recording a woman’s maiden name is a requirement, not a suggestion — it is how the Platform keeps families connected across generations.',
        ar: 'أضِف فقط المعلومات التي تؤمن حقًا بصحّتها. أنت مسؤول عمّا تُدخله. تسجيل اسم العائلة الأصلي للمرأة شرطٌ لا اقتراح — فهو وسيلة المنصّة لإبقاء العائلات مترابطة عبر الأجيال.',
      },
    },
    {
      id: 'terms-art-5',
      numberEn: 'Article 5',
      numberAr: 'البند 5',
      titleEn: 'Access Rights and Permissions',
      titleAr: 'صلاحيات الوصول والأذونات',
      blocks: [
        { type: 'p', en: '5.1 The Platform operates a structured access rights framework:', ar: '5.1 تعتمد المنصّة إطارًا منظَّمًا لصلاحيات الوصول:' },
        {
          type: 'defs',
          rows: [
            { termEn: 'Anyone (no account)', termAr: 'أي شخص (دون حساب)', defEn: 'Can view public pages and browse general information.', defAr: 'يمكنه عرض الصفحات العامة وتصفّح المعلومات العامة.' },
            { termEn: 'Registered User', termAr: 'مستخدم مسجّل', defEn: 'Can search the Master Family Tree and view individual records (subject to privacy restrictions on living individuals).', defAr: 'يمكنه البحث في الشجرة العائلية الأم وعرض السجلّات الفردية (وفق قيود الخصوصية الخاصة بالأشخاص الأحياء).' },
            { termEn: 'Verified Family Tree Owner', termAr: 'مالك شجرة موثَّق', defEn: 'Can read, write, and edit their own Individual Family Tree.', defAr: 'يمكنه قراءة شجرة عائلته الفردية والكتابة فيها وتعديلها.' },
            { termEn: 'Administrator', termAr: 'المسؤول', defEn: 'Has full read/write/edit access to the Master Family Tree. No other User has write access to the Master Family Tree.', defAr: 'يملك صلاحية كاملة للقراءة والكتابة والتعديل على الشجرة العائلية الأم. لا يملك أي مستخدم آخر صلاحية الكتابة عليها.' },
          ],
        },
        {
          type: 'list',
          items: [
            { en: '5.2 Any privacy restrictions or access controls you apply to your Individual Family Tree also apply to that portion of the Master Family Tree.', ar: '5.2 أي قيود خصوصية أو ضوابط وصول تطبّقها على شجرة عائلتك الفردية تنطبق أيضًا على ذلك الجزء من الشجرة العائلية الأم.' },
            { en: '5.3 Editing of individual records must be carried out within the Individual Family Tree to which they belong. Changes pass to the Master Family Tree during end-of-day processing. No User other than the Administrator may edit records directly in the Master Family Tree.', ar: '5.3 يجب إجراء تعديل السجلّات الفردية داخل شجرة العائلة الفردية التي تنتمي إليها. تنتقل التعديلات إلى الشجرة العائلية الأم خلال معالجة نهاية اليوم. لا يجوز لأي مستخدم سوى المسؤول تعديل السجلّات مباشرة في الشجرة الأم.' },
            { en: '5.4 If you wish to access another family’s tree, you may request permission from that family’s tree owner through the messaging system. The tree owner is not obligated to grant access.', ar: '5.4 إذا رغبت في الوصول إلى شجرة عائلة أخرى، يمكنك طلب إذن من مالك تلك الشجرة عبر نظام المراسلة. مالك الشجرة غير ملزَم بمنح الوصول.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-6',
      numberEn: 'Article 6',
      numberAr: 'البند 6',
      titleEn: 'Rules Governing the Recording of Marriages',
      titleAr: 'قواعد تسجيل الزيجات',
      blocks: [
        { type: 'p', en: '6.1 The Platform enforces the following rules when Users record marriages and spousal relationships. These rules reflect Islamic family law and Palestinian social and cultural norms.', ar: '6.1 تطبّق المنصّة القواعد التالية عند تسجيل المستخدمين للزيجات والعلاقات الزوجية. تعكس هذه القواعد أحكام الأسرة في الشريعة الإسلامية والأعراف الاجتماعية والثقافية الفلسطينية.' },
        { type: 'p', en: '6.2 Restrictions on women: A woman may not be recorded as being married to more than one man at the same time.', ar: '6.2 قيود على النساء: لا يجوز تسجيل امرأة كزوجة لأكثر من رجل واحد في الوقت نفسه.' },
        { type: 'p', en: '6.3 Restrictions on men: A man may not be recorded as being married to:', ar: '6.3 قيود على الرجال: لا يجوز تسجيل رجل كزوج لـ:' },
        {
          type: 'list',
          items: [
            { en: 'More than four women at the same time.', ar: 'أكثر من أربع نساء في الوقت نفسه.' },
            { en: 'His daughter, his sister, his mother, or his grandmother.', ar: 'ابنته، أو أخته، أو أمّه، أو جدّته.' },
            { en: 'His paternal aunt or his maternal aunt.', ar: 'عمّته أو خالته.' },
            { en: 'His mother-in-law while he is married to her daughter.', ar: 'والدة زوجته طالما بقي متزوّجًا من ابنتها.' },
            { en: 'His sister-in-law while he is married to her sister.', ar: 'أخت زوجته طالما بقي متزوّجًا من أختها.' },
            { en: 'His stepsister or his stepmother.', ar: 'أخته غير الشقيقة، أو زوجة أبيه.' },
          ],
        },
        { type: 'p', en: '6.4 The Platform will prevent Users from recording marriages that violate these rules. Attempts to circumvent these restrictions are a breach of these Terms.', ar: '6.4 تمنع المنصّة المستخدمين من تسجيل زيجات تخالف هذه القواعد. تُعدّ محاولات الالتفاف على هذه القيود مخالفة لهذه الشروط.' },
      ],
      summary: {
        en: 'The Platform reflects Palestinian and Islamic family values in the way marriages are recorded. These are not arbitrary rules — they are built into the system to maintain the accuracy and cultural integrity of the family records.',
        ar: 'تعكس المنصّة القيم العائلية الفلسطينية والإسلامية في طريقة تسجيل الزيجات. وهذه ليست قواعد اعتباطية — بل مُضمَّنة في النظام للحفاظ على دقّة السجلّات العائلية وسلامتها الثقافية.',
      },
    },
    {
      id: 'terms-art-7',
      numberEn: 'Article 7',
      numberAr: 'البند 7',
      titleEn: 'Duplicate Detection and Tree Merging',
      titleAr: 'كشف التكرار ودمج الأشجار',
      blocks: [
        { type: 'p', en: '7.1 The Platform runs an automated duplicate detection process at the end of each day, comparing records across all Individual Family Trees using a weighted scoring system. You agree that your submitted records may be compared against other Users’ records for this purpose.', ar: '7.1 تُجري المنصّة عملية آلية لكشف التكرار في نهاية كلّ يوم، تقارن فيها السجلّات عبر جميع شجرات العائلات الفردية باستخدام نظام تقييم مرجَّح. أنت توافق على أنّ سجلّاتك المقدَّمة قد تُقارَن بسجلّات مستخدمين آخرين لهذا الغرض.' },
        { type: 'p', en: '7.2 Where the system identifies a match between records in two different Individual Family Trees, matches above the Platform’s confidence threshold are linked into the Master Family Tree, and matches below the threshold are added to the Administrator’s daily review queue for manual assessment.', ar: '7.2 عندما يحدّد النظام تطابقًا بين سجلّات في شجرتَي عائلة فرديتَين مختلفتَين، تُربط التطابقات التي تتجاوز عتبة الثقة المعتمدة في المنصّة بالشجرة العائلية الأم، وتُضاف التطابقات الأدنى من تلك العتبة إلى قائمة المراجعة اليومية لدى المسؤول للتقييم اليدوي.' },
        { type: 'p', en: '7.3 When two Individual Family Trees are linked, you will be notified. The connected records will be visible in the Master Family Tree and the connected portions of both Individual Family Trees.', ar: '7.3 عند ربط شجرتَي عائلة فرديتَين، سيصلك إشعار بذلك. ستكون السجلّات المرتبطة مرئية في الشجرة العائلية الأم وفي الأجزاء المرتبطة من كلتا الشجرتين الفرديتين.' },
        { type: 'p', en: '7.4 If you believe a link has been made in error, you may contact the Administrator through the messaging system to request a review.', ar: '7.4 إذا اعتقدت أنّ ربطًا ما تمّ بالخطأ، يمكنك التواصل مع المسؤول عبر نظام المراسلة لطلب مراجعته.' },
      ],
    },
    {
      id: 'terms-art-8',
      numberEn: 'Article 8',
      numberAr: 'البند 8',
      titleEn: 'GEDCOM Import and Export',
      titleAr: 'استيراد وتصدير GEDCOM',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '8.1 You may import genealogical data into your Individual Family Tree using GEDCOM files. By importing, you represent that you have the right to submit all the data and that it is accurate to the best of your knowledge.', ar: '8.1 يمكنك استيراد بيانات نَسَبية إلى شجرة عائلتك الفردية باستخدام ملفّات GEDCOM. باستيرادك لها، فإنّك تقرّ بأنّ لديك الحقّ في تقديم جميع هذه البيانات، وأنّها دقيقة على حدّ علمك.' },
            { en: '8.2 You may export your Individual Family Tree as a GEDCOM file at any time for your personal use. You may not use exported data to populate a competing platform or for any commercial purpose without our express written consent.', ar: '8.2 يمكنك تصدير شجرة عائلتك الفردية كملفّ GEDCOM في أي وقت لاستخدامك الشخصي. لا يجوز استخدام البيانات المصدَّرة لتعبئة منصّة منافِسة أو لأي غرض تجاري دون موافقتنا الكتابية الصريحة.' },
            { en: '8.3 Imported GEDCOM files are subject to the same duplicate detection processing as manually entered data.', ar: '8.3 تخضع ملفّات GEDCOM المستوردة لعملية كشف التكرار نفسها التي تخضع لها البيانات المُدخَلة يدويًا.' },
            { en: '8.4 The Platform is not responsible for errors or data loss arising from the import of incorrectly formatted GEDCOM files.', ar: '8.4 لا تتحمّل المنصّة مسؤولية أي أخطاء أو فقدان بيانات ناتج عن استيراد ملفّات GEDCOM بصيغة غير صحيحة.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-9',
      numberEn: 'Article 9',
      numberAr: 'البند 9',
      titleEn: 'What You Must Not Do',
      titleAr: 'ما يجب ألّا تفعله',
      blocks: [
        { type: 'p', en: '9.1 You must not use the Platform in any way that:', ar: '9.1 يجب ألّا تستخدم المنصّة بأي طريقة:' },
        {
          type: 'list',
          items: [
            { en: 'Is unlawful or fraudulent.', ar: 'غير قانونية أو احتيالية.' },
            { en: 'Deliberately introduces false or fabricated genealogical data.', ar: 'تُدخل عمدًا بيانات نَسَبية كاذبة أو ملفَّقة.' },
            { en: 'Attempts to gain unauthorised access to another User’s account or to the Master Family Tree.', ar: 'تحاول الوصول دون إذن إلى حساب مستخدم آخر أو إلى الشجرة العائلية الأم.' },
            { en: 'Harasses, threatens, or intimidates other Users.', ar: 'تتحرّش بمستخدمين آخرين أو تهدّدهم أو تخيفهم.' },
            { en: 'Attempts to circumvent access controls, privacy settings, or marriage validation rules.', ar: 'تحاول الالتفاف على ضوابط الوصول أو إعدادات الخصوصية أو قواعد التحقّق من الزيجات.' },
            { en: 'Uses automated tools, bots, or scripts to extract data at scale without our written permission.', ar: 'تستخدم أدوات آلية أو برامج بوت أو نصوصًا برمجية لاستخراج البيانات على نطاق واسع دون إذننا الكتابي.' },
            { en: 'Attempts to disrupt, damage, or overload the Platform’s infrastructure.', ar: 'تحاول تعطيل بنية المنصّة التحتية أو الإضرار بها أو إثقالها.' },
            { en: 'Uses the Platform for any commercial purpose not expressly authorised by us.', ar: 'تستخدم المنصّة لأي غرض تجاري لم نُصرِّح به صراحة.' },
          ],
        },
        { type: 'p', en: '9.2 Violations may result in immediate suspension or termination of your account, and may be referred to relevant authorities where the violation involves criminal conduct.', ar: '9.2 قد تؤدّي المخالفات إلى إيقاف حسابك أو إنهائه فورًا، وقد تُحال إلى الجهات المختصّة إذا انطوت المخالفة على سلوك إجرامي.' },
      ],
    },
    {
      id: 'terms-art-10',
      numberEn: 'Article 10',
      numberAr: 'البند 10',
      titleEn: 'Intellectual Property',
      titleAr: 'الملكية الفكرية',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '10.1 The Platform’s software, design, structure, and original content (excluding User-submitted genealogical data) are owned by or licensed to us and protected by intellectual property law.', ar: '10.1 برمجيات المنصّة وتصميمها وبنيتها ومحتواها الأصلي (باستثناء البيانات النَّسَبية المقدَّمة من المستخدمين) مملوكة لنا أو مرخَّصة لنا، ومحمية بموجب قانون الملكية الفكرية.' },
            { en: '10.2 You retain ownership of the genealogical data, photographs, and documents you submit. By submitting them, you grant us the licence described in Article 4.3.', ar: '10.2 تحتفظ بملكية البيانات النَّسَبية والصور والوثائق التي تقدّمها. وبتقديمها، فإنّك تمنحنا الترخيص الموصوف في البند 4.3.' },
            { en: '10.3 The Master Family Tree as a whole — a unified, structured, de-duplicated record of the Palestinian people — is a collective work. No individual User has ownership rights over it as a whole.', ar: '10.3 الشجرة العائلية الأم ككلّ — بوصفها سجلًّا موحَّدًا ومنظَّمًا وخاليًا من التكرار للشعب الفلسطيني — عملٌ جماعي. لا يملك أي مستخدم فردي حقوق ملكية عليها ككلّ.' },
            { en: '10.4 You must not reproduce, distribute, or create derivative works from any part of the Platform’s software, design, or original content without our express written permission.', ar: '10.4 يجب ألّا تُعيد إنتاج أي جزء من برمجيات المنصّة أو تصميمها أو محتواها الأصلي أو توزيعه أو إنشاء أعمال مشتقّة منه دون إذننا الكتابي الصريح.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-11',
      numberEn: 'Article 11',
      numberAr: 'البند 11',
      titleEn: 'Our Responsibilities and Limitations',
      titleAr: 'مسؤولياتنا وحدودها',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '11.1 The Platform is provided in good faith to serve the Palestinian people. We do not guarantee it will be available at all times, error-free, or that the genealogical data it contains is always accurate (since it is contributed by Users).', ar: '11.1 تُقدَّم المنصّة بحسن نيّة لخدمة الشعب الفلسطيني. لا نضمن توفّرها في جميع الأوقات، ولا خلوّها من الأخطاء، ولا دقّة البيانات النَّسَبية الواردة فيها دائمًا (لأنّها بيانات يقدّمها المستخدمون).' },
            { en: '11.2 We do not provide legal advice. While the Platform generates records that may be useful in legal contexts — including right of return and land claims — you should always consult a qualified legal professional for your specific situation.', ar: '11.2 نحن لا نقدّم استشارات قانونية. ورغم أنّ المنصّة تُصدر سجلّات قد تكون مفيدة في سياقات قانونية — بما فيها حقّ العودة ومطالبات الأراضي — يجب عليك دائمًا استشارة مختصّ قانوني مؤهَّل بشأن حالتك الخاصة.' },
            { en: '11.3 We are not responsible for disputes between Users about accuracy, for the outcome of any legal claim that uses Platform data as evidence, or for any loss arising from the use of exported data.', ar: '11.3 لا نتحمّل مسؤولية النزاعات بين المستخدمين حول دقّة البيانات، ولا نتيجة أي مطالبة قانونية تستخدم بيانات المنصّة كدليل، ولا أي خسارة ناتجة عن استخدام البيانات المصدَّرة.' },
            { en: '11.4 To the maximum extent permitted by law, our total liability for any loss or damage arising from your use of the Platform shall not exceed the amount you have paid to use the Platform in the 12 months preceding the claim.', ar: '11.4 إلى أقصى حدّ يسمح به القانون، لا تتجاوز مسؤوليتنا الإجمالية عن أي خسارة أو ضرر ناتج عن استخدامك للمنصّة المبلغ الذي دفعتَه مقابل استخدام المنصّة خلال الأشهر الاثني عشر السابقة للمطالبة.' },
          ],
        },
      ],
      summary: {
        en: 'We will always do our best to keep the Platform running well and to protect your data. But we cannot guarantee that every record is correct — that depends on what Users enter. And we cannot give you legal advice. If you are using Platform records for a legal purpose, please consult a lawyer.',
        ar: 'سنبذل دائمًا قصارى جهدنا لإبقاء المنصّة تعمل بكفاءة ولحماية بياناتك. لكن لا يمكننا ضمان صحّة كلّ سجلّ — فذلك يعتمد على ما يُدخله المستخدمون. كما لا يمكننا تقديم استشارة قانونية. إن كنت تستخدم سجلّات المنصّة لغرض قانوني، فاستشر محاميًا.',
      },
    },
    {
      id: 'terms-art-12',
      numberEn: 'Article 12',
      numberAr: 'البند 12',
      titleEn: 'Suspension and Termination',
      titleAr: 'الإيقاف والإنهاء',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '12.1 You may close your account at any time by contacting us.', ar: '12.1 يمكنك إغلاق حسابك في أي وقت بالتواصل معنا.' },
            { en: '12.2 We may suspend or terminate your account, with or without notice, if you breach these Terms; if we have reasonable grounds to believe your account contains false or fraudulent information; if your use harms the Platform, other Users, or the integrity of the genealogical record; or if we are required to do so by law.', ar: '12.2 يجوز لنا إيقاف حسابك أو إنهاؤه، بإشعار أو دونه، إذا خالفتَ هذه الشروط؛ أو إذا كان لدينا سبب معقول للاعتقاد بأنّ حسابك يحتوي معلومات كاذبة أو احتيالية؛ أو إذا كان استخدامك يضرّ بالمنصّة أو بمستخدمين آخرين أو بسلامة السجلّ النَّسَبي؛ أو إذا كان القانون يُلزمنا بذلك.' },
            { en: '12.3 On termination, your access ends immediately. Genealogical data you contributed may be retained in the Master Family Tree per the Privacy Policy.', ar: '12.3 عند الإنهاء، يتوقّف وصولك فورًا. قد تُحفظ البيانات النَّسَبية التي ساهمتَ بها في الشجرة العائلية الأم وفقًا لسياسة الخصوصية.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-13',
      numberEn: 'Article 13',
      numberAr: 'البند 13',
      titleEn: 'Governing Law and Disputes',
      titleAr: 'القانون الحاكم والنزاعات',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '13.1 These Terms are governed by the laws of the jurisdiction in which the Platform is legally registered (to be confirmed upon incorporation).', ar: '13.1 تخضع هذه الشروط لقوانين الجهة القضائية التي تُسجَّل فيها المنصّة قانونيًا (سيُؤكَّد ذلك عند التأسيس).' },
            { en: '13.2 We are committed to resolving disputes fairly and efficiently. If you have a complaint, contact us first and we will try to resolve it informally.', ar: '13.2 نلتزم بحلّ النزاعات بإنصاف وكفاءة. إذا كانت لديك شكوى، تواصل معنا أوّلًا وسنحاول حلّها وديًّا.' },
            { en: '13.3 If a dispute cannot be resolved informally, it shall be referred to mediation before any legal proceedings, unless either party requires urgent injunctive or interim relief.', ar: '13.3 إذا تعذّر حلّ النزاع وديًّا، يُحال إلى الوساطة قبل اللجوء إلى أي إجراءات قانونية، ما لم يحتج أحد الطرفين إلى إجراء عاجل أو مؤقّت.' },
            { en: '13.4 Nothing in these Terms affects your statutory rights as a consumer under the laws of your country of residence.', ar: '13.4 لا يؤثّر أي بند في هذه الشروط على حقوقك القانونية كمستهلك بموجب قوانين بلد إقامتك.' },
          ],
        },
      ],
    },
    {
      id: 'terms-art-14',
      numberEn: 'Article 14',
      numberAr: 'البند 14',
      titleEn: 'General Provisions',
      titleAr: 'أحكام عامّة',
      blocks: [
        {
          type: 'list',
          items: [
            { en: '14.1 Entire agreement: These Terms, with the Privacy Policy, constitute the entire agreement between you and us relating to your use of the Platform.', ar: '14.1 الاتفاق الكامل: تشكّل هذه الشروط، إلى جانب سياسة الخصوصية، الاتفاق الكامل بينك وبيننا بشأن استخدامك للمنصّة.' },
            { en: '14.2 Severability: If any provision is found unenforceable, the remaining provisions continue in full force.', ar: '14.2 قابلية الفصل: إذا تبيَّن أنّ أحد البنود غير قابل للتنفيذ، تبقى بقية البنود سارية المفعول بالكامل.' },
            { en: '14.3 Waiver: Our failure to enforce any provision on any occasion does not waive our right to enforce it later.', ar: '14.3 التنازل: عدم تطبيقنا لأي بند في مناسبة ما لا يعني تنازلنا عن حقّنا في تطبيقه لاحقًا.' },
            { en: '14.4 Changes: We may update these Terms from time to time and will notify registered Users of significant changes by email and a notice on the Platform. Continued use after notification constitutes acceptance.', ar: '14.4 التغييرات: يجوز لنا تحديث هذه الشروط من وقتٍ لآخر، وسنُبلغ المستخدمين المسجَّلين بأي تغييرات جوهرية عبر البريد الإلكتروني وإشعار على المنصّة. استمرار الاستخدام بعد الإشعار يُعدّ قبولًا بها.' },
            { en: '14.5 Language: These Terms are available in Arabic and English. In the event of any inconsistency, the Arabic version shall prevail.', ar: '14.5 اللغة: هذه الشروط متوفّرة بالعربية والإنجليزية. في حال وجود أي تعارض، تُعتمد النسخة العربية.' },
            { en: '14.6 Contact: Questions about these Terms — legal@juthoor.app (placeholder — to be confirmed upon launch).', ar: '14.6 التواصل: للأسئلة حول هذه الشروط — legal@juthoor.app (عنوان مؤقّت — سيُؤكَّد عند الإطلاق).' },
          ],
        },
      ],
    },
  ],
};
