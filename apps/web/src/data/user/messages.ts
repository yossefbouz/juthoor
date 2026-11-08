'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import type { MessageContextType } from '@/types/database';

export type MessageThreadSummary = {
  id: string;
  contextType: MessageContextType;
  contextId: string;
  createdAt: string;
  lastBody: string | null;
  lastAt: string | null;
  counterpartName: string | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  senderName: string | null;
  isMine: boolean;
};

const OpenSchema = z.object({
  contextType: z.enum([
    'relationship_dispute',
    'picture_link',
    'document_link',
    'contact_relay',
  ]),
  contextId: z.string().uuid(),
  counterpartUserId: z.string().uuid().optional(),
  initialBody: z.string().trim().max(4000).optional(),
});

/** Open or create a thread for a known context. Returns thread id. */
export async function openOrCreateMessageThread(
  input: z.input<typeof OpenSchema>,
): Promise<string> {
  const parsed = OpenSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('open_or_create_message_thread', {
    p_context_type: parsed.contextType,
    p_context_id: parsed.contextId,
    p_counterpart_user_id: parsed.counterpartUserId ?? null,
    p_initial_body: parsed.initialBody ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** After accepting a connection, ensure contact_relay + open a messaging thread. */
export async function openThreadFromContactAccept(input: {
  matchId: string;
  counterpartUserId: string;
}): Promise<string> {
  const matchId = z.string().uuid().parse(input.matchId);
  const counterpartUserId = z.string().uuid().parse(input.counterpartUserId);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();

  const { data: relayId, error: relayErr } = await supabase.rpc('ensure_contact_relay', {
    p_match_id: matchId,
    p_counterpart_user_id: counterpartUserId,
  });
  if (relayErr) throw new Error(relayErr.message);

  const { data: threadId, error: threadErr } = await supabase.rpc(
    'open_or_create_message_thread',
    {
      p_context_type: 'contact_relay',
      p_context_id: relayId as string,
      p_counterpart_user_id: counterpartUserId,
      p_initial_body: 'Contact request accepted. You can message here.',
    },
  );
  if (threadErr) throw new Error(threadErr.message);
  return threadId as string;
}

/** Dispute a relationship (family): notify via messaging with IFT Admin. */
export async function openThreadFromRelationshipDispute(input: {
  familyId: string;
  counterpartUserId?: string;
  note?: string;
}): Promise<string> {
  const familyId = z.string().uuid().parse(input.familyId);
  const note = input.note?.trim() || 'Relationship disputed.';
  return openOrCreateMessageThread({
    contextType: 'relationship_dispute',
    contextId: familyId,
    counterpartUserId: input.counterpartUserId,
    initialBody: note,
  });
}

export async function listMyMessageThreads(): Promise<MessageThreadSummary[]> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return [];
  const supabase = await createJuthoorSupabaseClient();

  const { data: parts, error: pErr } = await supabase
    .from('message_thread_participants')
    .select('thread_id, joined_at')
    .eq('user_id', uid)
    .order('joined_at', { ascending: false });
  if (pErr) throw new Error(pErr.message);
  const threadIds = ((parts ?? []) as Array<{ thread_id: string }>).map((p) => p.thread_id);
  if (threadIds.length === 0) return [];

  const { data: threads, error: tErr } = await supabase
    .from('message_threads')
    .select('id, context_type, context_id, created_at')
    .in('id', threadIds);
  if (tErr) throw new Error(tErr.message);

  const { data: allParts } = await supabase
    .from('message_thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', threadIds);

  const counterpartIds = Array.from(
    new Set(
      ((allParts ?? []) as Array<{ thread_id: string; user_id: string }>)
        .filter((p) => p.user_id !== uid)
        .map((p) => p.user_id),
    ),
  );
  const { data: profiles } = counterpartIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, display_name_ar')
        .in('id', counterpartIds)
    : { data: [] as Array<{ id: string; display_name: string | null; display_name_ar: string | null }> };

  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p.display_name_ar || p.display_name || null,
    ]),
  );

  const counterpartByThread = new Map<string, string | null>();
  for (const p of (allParts ?? []) as Array<{ thread_id: string; user_id: string }>) {
    if (p.user_id === uid) continue;
    if (!counterpartByThread.has(p.thread_id)) {
      counterpartByThread.set(p.thread_id, nameById.get(p.user_id) ?? null);
    }
  }

  const { data: msgs } = await supabase
    .from('messages')
    .select('thread_id, body, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });

  const lastByThread = new Map<string, { body: string; created_at: string }>();
  for (const m of (msgs ?? []) as Array<{ thread_id: string; body: string; created_at: string }>) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, { body: m.body, created_at: m.created_at });
    }
  }

  const order = new Map(threadIds.map((id, i) => [id, i]));
  return ((threads ?? []) as Array<{
    id: string;
    context_type: MessageContextType;
    context_id: string;
    created_at: string;
  }>)
    .map((t) => {
      const last = lastByThread.get(t.id);
      return {
        id: t.id,
        contextType: t.context_type,
        contextId: t.context_id,
        createdAt: t.created_at,
        lastBody: last?.body ?? null,
        lastAt: last?.created_at ?? t.created_at,
        counterpartName: counterpartByThread.get(t.id) ?? null,
      };
    })
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function getThreadMessages(threadId: string): Promise<{
  thread: { id: string; contextType: MessageContextType; contextId: string } | null;
  messages: ThreadMessage[];
}> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return { thread: null, messages: [] };
  const id = z.string().uuid().parse(threadId);
  const supabase = await createJuthoorSupabaseClient();

  const { data: thread, error: tErr } = await supabase
    .from('message_threads')
    .select('id, context_type, context_id')
    .eq('id', id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!thread) return { thread: null, messages: [] };

  const { data: rows, error } = await supabase
    .from('messages')
    .select('id, thread_id, sender_id, body, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const senderIds = Array.from(
    new Set(((rows ?? []) as Array<{ sender_id: string }>).map((r) => r.sender_id)),
  );
  const { data: profiles } = senderIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, display_name_ar')
        .in('id', senderIds)
    : { data: [] as Array<{ id: string; display_name: string | null; display_name_ar: string | null }> };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name_ar || p.display_name || null]),
  );

  return {
    thread: {
      id: (thread as { id: string }).id,
      contextType: (thread as { context_type: MessageContextType }).context_type,
      contextId: (thread as { context_id: string }).context_id,
    },
    messages: ((rows ?? []) as Array<{
      id: string;
      thread_id: string;
      sender_id: string;
      body: string;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: r.created_at,
      senderName: nameById.get(r.sender_id) ?? null,
      isMine: r.sender_id === uid,
    })),
  };
}

const SendSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function sendMessage(input: z.input<typeof SendSchema>): Promise<ThreadMessage> {
  const parsed = SendSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: parsed.threadId,
      sender_id: uid,
      body: parsed.body,
    })
    .select('id, thread_id, sender_id, body, created_at')
    .single();
  if (error) throw new Error(error.message);
  const row = data as {
    id: string;
    thread_id: string;
    sender_id: string;
    body: string;
    created_at: string;
  };
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    senderName: null,
    isMine: true,
  };
}
