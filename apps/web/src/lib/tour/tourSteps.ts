import {
  FileText,
  FileUp,
  Image as ImageIcon,
  Inbox,
  Languages,
  Link2,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Network,
  Rows3,
  ShieldCheck,
  Sparkles,
  TreeDeciduous,
  Users,
  UserSearch,
} from 'lucide-react';

/**
 * First-run guided tour: one step per main area of the site, in the order a
 * new member meets them (build the tree, look at it, prove who you are,
 * explore, connect, archives, import/export, preferences).
 *
 * `href` is the "Take me there" link. It must be a static route that exists
 * under src/app (checked by src/test/onboardingTour.test.tsx); `/tree`
 * redirects to the member's own tree, which is where the chart, the people
 * list and the GEDCOM buttons live.
 */
export type TourStep = {
  id: string;
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href?: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    icon: Sparkles,
    titleAr: 'أهلًا بك في جذور',
    titleEn: 'Welcome to Juthoor',
    bodyAr: 'جولة قصيرة على ما يمكنك فعله في الموقع. تستغرق دقيقة أو دقيقتين، ويمكنك تخطّيها في أي وقت.',
    bodyEn: 'A short look at what you can do here. It takes a minute or two, and you can skip it at any time.',
  },
  {
    id: 'tree',
    icon: TreeDeciduous,
    titleAr: 'شجرة عائلتك',
    titleEn: 'Your family tree',
    bodyAr: 'شجرتك الأولى جاهزة. أضف نفسك أولًا، ثم استخدم «إضافة شخص» لإضافة الوالدين والأزواج والإخوة والأبناء.',
    bodyEn: 'Your first tree is already created. Add yourself first, then use “Add person” for parents, spouses, siblings and children.',
    href: '/tree',
  },
  {
    id: 'chart',
    icon: Rows3,
    titleAr: 'تخطيطات الشجرة وقائمة الأشخاص',
    titleEn: 'Chart layouts and the people list',
    bodyAr: 'بدّل عرض الشجرة بين الأفقي والعمودي والمروحي. وزرّ «كل الأشخاص» يعرض جميع من في الشجرة في قائمة.',
    bodyEn: 'Switch the chart between horizontal, vertical and fan layouts. “All people” shows everyone in the tree as a list.',
    href: '/tree',
  },
  {
    id: 'verify',
    icon: ShieldCheck,
    titleAr: 'توثيق الهوية و«هذا أنا»',
    titleEn: 'Identity verification and “This is me”',
    bodyAr: 'ارفع وثيقة هوية ليراجعها فريق المنصّة؛ التوثيق يمنحك صلاحية التحرير. اختر «هذا أنا» عند إضافة نفسك، أو ابحث باسمك إن كان أحد أقاربك قد أضافك من قبل.',
    bodyEn: 'Upload an ID document for the team to review; verification gives you write access. Choose “This is me” when you add yourself, or search for your name if a relative already added you.',
    href: '/verify',
  },
  {
    id: 'search',
    icon: UserSearch,
    titleAr: 'دليل الأفراد',
    titleEn: 'Individuals',
    bodyAr: 'ابحث عن شخص باسمه بالعربية أو الإنجليزية في الأشجار العامّة والمشتركة. تفاصيل الأحياء تبقى خاصّة.',
    bodyEn: 'Search for a person by name, in Arabic or English, across public and shared trees. Details of living people stay private.',
    href: '/search',
  },
  {
    id: 'families',
    icon: Users,
    titleAr: 'دليل العائلات',
    titleEn: 'Families',
    bodyAr: 'تصفّح العائلات بحسب اللقب، وافتح أي عائلة لترى القرى والأشخاص المرتبطين بها.',
    bodyEn: 'Browse families by surname, and open one to see the villages and people linked to it.',
    href: '/families',
  },
  {
    id: 'villages',
    icon: MapPin,
    titleAr: 'دليل القرى و المدن',
    titleEn: 'Villages and cities (VCC)',
    bodyAr: 'استكشف قرى فلسطين ومدنها. في صفحة كل مكان تجد تاريخه وعائلاته وصوره ووثائقه.',
    bodyEn: 'Explore the villages and cities of Palestine. Each place has a page with its history, families, pictures and documents.',
    href: '/villages',
  },
  {
    id: 'pft',
    icon: Network,
    titleAr: 'الشجرة الفلسطينية',
    titleEn: 'Palestinian Family Tree',
    bodyAr: 'عرض للقراءة فقط يُبنى من الروابط المؤكّدة بين الأشخاص في أشجار مختلفة. شجرتك تبقى ملكك.',
    bodyEn: 'A read-only view built from confirmed links between people in different trees. Your own tree stays yours.',
    href: '/pft',
  },
  {
    id: 'connections',
    icon: Link2,
    titleAr: 'الروابط بين الأشجار',
    titleEn: 'Connections between trees',
    bodyAr: 'حين يبدو أن شخصًا في شجرتك هو نفسه في شجرة أخرى يصلك اقتراح. يمكنك قبوله أو رفضه، وإلغاء أي رابط لاحقًا.',
    bodyEn: 'When someone in your tree looks like the same person in another tree, you get a suggestion. You can accept or decline it, and revoke any link later.',
    href: '/dashboard/connections',
  },
  {
    id: 'requests',
    icon: Inbox,
    titleAr: 'طلبات الوصول',
    titleEn: 'Access requests',
    bodyAr: 'قد يطلب أعضاء آخرون الانضمام إلى شجرتك. وافق على الطلب أو ارفضه من هنا.',
    bodyEn: 'Other members can ask to join your tree. Approve or reject each request here.',
    href: '/dashboard/requests',
  },
  {
    id: 'messages',
    icon: MessageSquare,
    titleAr: 'الرسائل والإشعارات',
    titleEn: 'Messages and notifications',
    bodyAr: 'محادثاتك مع الأعضاء الآخرين تظهر في الرسائل، والجرس أعلى الصفحة ينبّهك إلى كل جديد.',
    bodyEn: 'Your conversations with other members are under Messages, and the bell at the top of the page shows what is new.',
    href: '/messages',
  },
  {
    id: 'pictures',
    icon: ImageIcon,
    titleAr: 'أرشيف الصور',
    titleEn: 'Picture Archive',
    bodyAr: 'الصور التي تُرفق بالأشخاص تُجمع هنا. ابحث فيها بالاسم أو المكان أو التاريخ.',
    bodyEn: 'Pictures attached to people are gathered here. Search them by name, place or date.',
    href: '/pictures',
  },
  {
    id: 'documents',
    icon: FileText,
    titleAr: 'أرشيف الوثائق',
    titleEn: 'Document Archive',
    bodyAr: 'الوثائق المرفقة بالأشخاص تُجمع هنا. ابحث فيها بالعنوان أو الجهة المُصدِرة أو تاريخ الإصدار.',
    bodyEn: 'Documents attached to people are gathered here. Search them by title, issuing authority or issue date.',
    href: '/documents',
  },
  {
    id: 'gedcom',
    icon: FileUp,
    titleAr: 'استيراد وتصدير GEDCOM',
    titleEn: 'GEDCOM import and export',
    bodyAr: 'انقل شجرة من منصّة أخرى بملف GEDCOM، أو نزّل شجرتك بالصيغة نفسها. الزرّان في أعلى صفحة شجرتك.',
    bodyEn: 'Bring a tree in from another platform with a GEDCOM file, or download your own tree in the same format. Both buttons are at the top of your tree page.',
    href: '/tree',
  },
  {
    id: 'language',
    icon: Languages,
    titleAr: 'اللغة',
    titleEn: 'Language',
    bodyAr: 'بدّل بين العربية والإنجليزية في أي وقت من مفتاح «ع / EN» في الشريط الجانبي. ولإعادة هذه الجولة اختر «جولة في الموقع» من القائمة تحت اسمك.',
    bodyEn: 'Switch between Arabic and English at any time with the “ع / EN” toggle in the sidebar. To see this tour again, choose “Take the tour” in the menu under your name.',
  },
];
