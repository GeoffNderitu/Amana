import { api, type Transaction } from './api';

export interface QueuedTransaction {
  localId: string;
  date: string;
  payee: string;
  amount: number;
  categoryId: string;
  refundExpected: boolean;
  queuedAt: string;
}

function key(userId: string) {
  return `amana:offline-queue:${userId}`;
}

export function getQueue(userId: string): QueuedTransaction[] {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(userId: string, queue: QueuedTransaction[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(queue));
  } catch {
    // localStorage can be unavailable (private mode / quota) — the entry is simply lost,
    // same as it would be if we never attempted to queue it at all.
  }
}

export function enqueueTransaction(userId: string, t: Omit<QueuedTransaction, 'localId' | 'queuedAt'>): QueuedTransaction {
  const entry: QueuedTransaction = {
    ...t,
    localId: 'pending_' + Math.random().toString(36).slice(2, 10),
    queuedAt: new Date().toISOString(),
  };
  const queue = getQueue(userId);
  queue.push(entry);
  saveQueue(userId, queue);
  return entry;
}

function removeFromQueue(userId: string, localId: string) {
  saveQueue(userId, getQueue(userId).filter((q) => q.localId !== localId));
}

/** True only for a genuine connectivity failure (fetch couldn't even reach the server) —
 * never for a real HTTP error response, which should surface to the user as usual rather
 * than silently queueing something the server actively rejected. */
export function isNetworkError(e: unknown): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine ? true : e instanceof TypeError;
}

/**
 * Replays every queued transaction against the real API in order. Stops and keeps the rest
 * queued if a request still fails for network reasons (so a flaky reconnect doesn't drop
 * data), but drops an entry and reports it if the server rejects it outright (e.g. the
 * category was deleted while offline) rather than retrying forever.
 */
export async function flushQueue(
  userId: string
): Promise<{ synced: number; failed: number; transactions?: Transaction[] }> {
  const queue = getQueue(userId);
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  let lastTransactions: Transaction[] | undefined;

  for (const entry of queue) {
    try {
      const result = await api.addTransaction({
        date: entry.date,
        payee: entry.payee,
        amount: entry.amount,
        categoryId: entry.categoryId,
        refundExpected: entry.refundExpected,
      });
      lastTransactions = result.transactions;
      removeFromQueue(userId, entry.localId);
      synced++;
    } catch (e) {
      if (isNetworkError(e)) break; // still offline — leave the rest queued for next time
      removeFromQueue(userId, entry.localId); // server rejected it — don't retry forever
      failed++;
    }
  }

  return { synced, failed, transactions: lastTransactions };
}
