'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useLocale } from '@/contexts/LocaleContext';

type FaqItem = {
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
};

const FAQ: FaqItem[] = [
  {
    qAr: 'ما الفرق بين شجرة عائلتي والشجرة الفلسطينية؟',
    qEn: 'What is the difference between my tree and the Palestinian Family Tree?',
    aAr: 'شجرتك تبقى ملكك وتُحرَّر فيها. الشجرة الفلسطينية عرض للقراءة فقط يبنى من الروابط المؤكّدة بين الأشخاص في شجرات مختلفة، دون دمج الشجرات نفسها.',
    aEn: 'Your tree stays yours and is where you edit. The Palestinian Family Tree is a read-only view built from confirmed links between people in different trees. The trees themselves are not merged.',
  },
  {
    qAr: 'من يرى بيانات الأشخاص الأحياء؟',
    qEn: 'Who can see living people\'s details?',
    aAr: 'الأحياء يحظون بحماية إضافية. التواريخ الحسّاسة وبيانات التواصل لا تظهر للجميع. التواصل يُعرض فقط بموافقة صاحب السجل أو لمن يدير الشجرة، ويُسجَّل الاطلاع في سجل الوصول.',
    aEn: 'Living people get extra protection. Sensitive dates and contact details are not public. Contact shows only with consent or to tree managers, and those views are written to the access log.',
  },
  {
    qAr: 'كيف يعمل المطابقة بين الشجرات؟',
    qEn: 'How does matching between trees work?',
    aAr: 'يقارن النظام الأسماء والأصول وتواريخ الحياة وفق أوزان محدّدة. التطابق القوي يقترح رابطًا؛ الروابط الأضعف تنتظر موافقة الطرفين أو مراجعة المنصّة. أي رابط يمكن إلغاؤه لاحقًا.',
    aEn: 'The system compares names, origins, and life dates with weighted scores. Strong matches propose a link; weaker ones wait for both sides or platform review. Any link can be revoked later.',
  },
  {
    qAr: 'هل يمكنني رفض رابط أو إيقاف المطابقة لشخص؟',
    qEn: 'Can I reject a link or stop matching for someone?',
    aAr: 'نعم. يمكنك رفض اقتراح أو إلغاء رابط مؤكّد من لوحة الروابط، ووضع «إيقاف مطابقة» على شخص حتى لا يُقترح مجددًا.',
    aEn: 'Yes. You can decline a suggestion or revoke a confirmed link from the connections dashboard, and place a privacy hold so that person is not proposed again.',
  },
  {
    qAr: 'ما أوضاع عرض الشجرة (أفقي / عمودي / مروحي)؟',
    qEn: 'What are the horizontal, vertical, and fan layouts?',
    aAr: 'ثلاثة أوضاع لنفس البيانات: الأفقي هو المخطط الحالي، العمودي يبدّل المحاور، والمروحي يرتّب الأقارب حول الشخص المحوري. اختيارك يُحفظ في الرابط وفي المتصفّح.',
    aEn: 'Three views of the same data: horizontal is the current chart, vertical swaps axes, and fan arranges relatives around the focus person. Your choice is kept in the URL and in the browser.',
  },
  {
    qAr: 'هل جذور مجّانية وهل تُباع البيانات؟',
    qEn: 'Is Juthoor free, and is data sold?',
    aAr: 'المنصّة مجّانية وبلا إعلانات. بيانات العائلات ليست للبيع. راجع سياسة الخصوصية والشروط للتفاصيل.',
    aEn: 'The platform is free and ad-free. Family data is not for sale. See the privacy policy and terms for detail.',
  },
  {
    qAr: 'كيف أوثّق هويتي وماذا يحدث إذا رُفض الطلب؟',
    qEn: 'How do I verify identity, and what if a request is rejected?',
    aAr: 'ارفع وثيقة هوية من صفحة التوثيق. يراجعها فريق المنصّة. إذا رُفض الطلب يمكنك تقديم استئناف بسيط من لوحة المستخدم بعد تفعيل مسار الاستئناف.',
    aEn: 'Upload an ID from the verify page. Platform staff review it. If rejected, you can file a simple appeal once the appeals path is enabled on your account.',
  },
];

export function FaqClient() {
  const { t, dir, locale } = useLocale();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div dir={dir} className="relative bg-[var(--background)] text-[var(--foreground)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(circle_at_top,_var(--jt-olive-100)_0%,_transparent_60%)] opacity-60"
      />
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-24">
        <header className="mb-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--jt-olive-700)]">
            {t('أسئلة', 'FAQ')}
          </p>
          <h1
            className="text-[clamp(2rem,5vw,3rem)] font-bold text-[var(--jt-olive-900)]"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('الأسئلة الشائعة', 'Frequently asked questions')}
          </h1>
          <p className="mt-3 text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.8 }}>
            {t(
              'إجابات قصيرة عن الشجرات، الخصوصية، والمطابقة.',
              'Short answers about trees, privacy, and matching.',
            )}
          </p>
        </header>

        <ul className="space-y-3">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            const q = locale === 'ar' ? item.qAr : item.qEn;
            const a = locale === 'ar' ? item.aAr : item.aEn;
            return (
              <li
                key={item.qEn}
                className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] shadow-[var(--jt-shadow-sm)]"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)]"
                >
                  <span
                    className="text-sm font-semibold text-[var(--jt-olive-900)]"
                    style={{
                      fontFamily:
                        locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)',
                    }}
                  >
                    {q}
                  </span>
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--jt-stone-500)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div
                    className="border-t border-[var(--jt-stone-200)]/80 px-4 py-3 text-sm text-[var(--jt-stone-700)]"
                    style={{ lineHeight: 1.8 }}
                  >
                    {a}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
