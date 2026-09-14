import { Heart, Info, Mail, Route as RouteIcon, type LucideIcon } from 'lucide-react';

export type Village = { id: string; name_ar: string; name_en: string | null; district_ar: string | null };

export type FlowSection = {
  ref: string;
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href: string;
};

/** FRS Appendix 2, Module 2.0 — the four narrative anchors of the home page. */
export const FLOW_SECTIONS: FlowSection[] = [
  {
    ref: '2.1',
    icon: Info,
    titleAr: 'هويتنا',
    titleEn: 'Who We Are',
    bodyAr: 'منصّة غير ربحية بناها المجتمع، تربط 15.2 مليون فلسطيني حول العالم عبر شجرة عائلة واحدة موحّدة.',
    bodyEn: 'A non-profit, community-built platform connecting the 15.2 million Palestinians scattered across the world through one unified family tree.',
    href: '/about',
  },
  {
    ref: '2.2',
    icon: Heart,
    titleAr: 'أهدافنا',
    titleEn: 'Why Are We Doing This',
    bodyAr: 'الهوية، وحقّ العودة، ولماذا توثيق تاريخ العائلة مهمّ الآن أكثر من أي وقت مضى.',
    bodyEn: 'Identity, the right of return, and why documenting family history matters now more than ever.',
    href: '/why',
  },
  {
    ref: '2.3',
    icon: RouteIcon,
    titleAr: 'كيف نحقق أهدافنا',
    titleEn: 'How Does This Work',
    bodyAr: 'بناء شجرتك، والخصوصية وضوابط الوصول، وكيف ترتبط الأشجار الفردية بشجرة العائلة الفلسطينية.',
    bodyEn: 'Building your tree, privacy and access controls, and how individual trees link into the Palestinian Family Tree.',
    href: '/how',
  },
  {
    ref: '2.4',
    icon: Mail,
    titleAr: 'تواصل معنا',
    titleEn: 'Contact Us',
    bodyAr: 'أسئلة، شراكات، تصحيحات، ودعم — تواصل مع الفريق القائم على هذه المنصّة.',
    bodyEn: 'Questions, partnerships, corrections, and support — reach the team behind the platform.',
    href: '/contact',
  },
];

export type Stat = { value: number; decimals: number; suffix: string; labelAr: string; labelEn: string };

export const STATS: Stat[] = [
  { value: 15.2, decimals: 1, suffix: 'M', labelAr: 'فلسطيني في الشتات', labelEn: 'Palestinians in the diaspora' },
  {
    value: 530,
    decimals: 0,
    suffix: '+',
    labelAr: 'قرية فلسطينية دُمِّرت بالكامل على يد إسرائيل عام 1948',
    labelEn: 'Palestinian villages completely demolished by Israel in 1948',
  },
];

export const FALLBACK_VILLAGES: Village[] = [
  { id: '1', name_ar: 'اللد', name_en: 'Lydda', district_ar: 'الرملة' },
  { id: '2', name_ar: 'يافا', name_en: 'Jaffa', district_ar: 'يافا' },
  { id: '3', name_ar: 'حيفا', name_en: 'Haifa', district_ar: 'حيفا' },
  { id: '4', name_ar: 'صفد', name_en: 'Safad', district_ar: 'صفد' },
  { id: '5', name_ar: 'الطنطورة', name_en: 'Al-Tantura', district_ar: 'حيفا' },
  { id: '6', name_ar: 'دير ياسين', name_en: 'Deir Yassin', district_ar: 'القدس' },
  { id: '7', name_ar: 'عكا', name_en: 'Acre', district_ar: 'عكا' },
  { id: '8', name_ar: 'بيسان', name_en: 'Beisan', district_ar: 'بيسان' },
];

/** Shared layout primitives so every section sits on the same 12-column grid. */
export const CONTAINER = 'mx-auto w-full max-w-7xl px-6 md:px-8';
export const GRID = 'grid grid-cols-12 gap-x-6';
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const INK = '#0a0a0a';
export const PAPER = '#F8F4EE';
