'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { sendMessage, type ThreadMessage } from '@/data/user/messages';
import type { MessageContextType } from '@/types/database';

export function ThreadClient({
  thread,
  initialMessages,
}: {
  thread: { id: string; contextType: MessageContextType; contextId: string };
  initialMessages: ThreadMessage[];
}) {
  const { t, dir } = useLocale();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const msg = await sendMessage({ threadId: thread.id, body: text });
      setMessages((rows) => [...rows, msg]);
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإرسال', 'Send failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 md:p-8">
      <Link
        href="/messages"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('كل المحادثات', 'All threads')}
      </Link>

      <header>
        <h1
          className="text-2xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('محادثة', 'Thread')}
        </h1>
        <p className="text-xs text-[var(--jt-stone-500)]">{thread.contextType}</p>
      </header>

      <div className="flex min-h-[50vh] flex-1 flex-col rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)]">
        <ul className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <li className="py-10 text-center text-sm text-[var(--jt-stone-500)]">
              {t('ابدأ المحادثة.', 'Start the conversation.')}
            </li>
          ) : (
            messages.map((m) => (
              <li
                key={m.id}
                className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.isMine
                      ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                      : 'bg-[var(--jt-stone-100)] text-[var(--jt-stone-800)]'
                  }`}
                >
                  {!m.isMine && m.senderName && (
                    <p className="mb-1 text-[10px] font-semibold opacity-70">{m.senderName}</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="border-t border-[var(--jt-stone-200)] p-3">
          {error && (
            <p className="mb-2 text-xs text-[var(--jt-terra-700)]">{error}</p>
          )}
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={t('اكتب رسالة…', 'Write a message…')}
              className="flex-1 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
            />
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void submit()}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--jt-olive-700)] px-4 text-[var(--jt-stone-50)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
