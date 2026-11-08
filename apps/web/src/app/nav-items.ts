import {
  FileText,
  Image as ImageIcon,
  MapPin,
  TreeDeciduous,
  Users,
  UserSearch,
} from 'lucide-react';

/**
 * Shared site nav structure, per FRS Appendix 2 (Module 2.0 — Home Page):
 * Home / Trees / Individuals / Families / VCC / Picture Archive / Document
 * Archive. Used by both Navbar.tsx (desktop) and MobileNavigation.tsx
 * (hamburger menu) — kept in its own module so neither imports the other
 * for this data (that circular import previously crashed the app with a
 * "Cannot access 'NAV_ITEMS' before initialization" error).
 */
/** Private Items (Nextbase starter) intentionally omitted - quarantined in Wave 0.5. */
export const NAV_ITEMS = [
  { href: '/', ar: 'الرئيسية', en: 'Home', icon: null, available: true },
  { href: '/tree', ar: 'شجرة العائلة', en: 'Trees', icon: TreeDeciduous, available: true },
  { href: '/search', ar: 'دليل الأفراد', en: 'Individuals', icon: UserSearch, available: true },
  { href: '/families', ar: 'دليل العائلات', en: 'Families', icon: Users, available: true },
  { href: '/villages', ar: 'دليل القرى و المدن', en: 'VCC', icon: MapPin, available: true },
  { href: '/pictures', ar: 'أرشيف الصور', en: 'Picture Archive', icon: ImageIcon, available: true },
  { href: '/documents', ar: 'أرشيف الوثائق', en: 'Document Archive', icon: FileText, available: true },
];
