import { FaqClient } from './FaqClient';

export const metadata = {
  title: 'الأسئلة الشائعة — FAQ | Juthoor',
  description:
    'Short bilingual answers about family trees, privacy, and matching on Juthoor.',
};

export default function FaqPage() {
  return <FaqClient />;
}
