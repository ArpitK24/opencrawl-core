import {isSessionHarness, type Principal} from '../sessions/types.mjs';
import {encodeSessionReference, parseSessionReference} from '../sessions/session-reference.mjs';
import type {createRecentSessions} from '../sessions/recent.mjs';
import type {BoardRepository} from '../state/board.mjs';
import type {Participant, BoardMessage} from './types.mjs';
import {boardIdentity} from './identity.mjs';

/** Preserve exact coordinates if a later poll provides only the native session ID. */
export function bindPresenceSession(p: Participant, principal: Principal, session?: string, installation?: string, harness = p.harness) {
  if (!session) return false;
  if (![principal.tenantId, principal.userId, session, installation].every(part => part === undefined || /^[A-Za-z0-9_.:-]{1,200}$/.test(part))) return false;
  let previous;
  try { previous = p.captureRef ? parseSessionReference(p.captureRef, true) : undefined; }
  catch { /* Rebuild a stale reference from the authenticated registration. */ }
  const same = previous && previous[0] === principal.tenantId && previous[1] === principal.userId && previous[4] === session ? previous : undefined;
  const ref = encodeSessionReference([principal.tenantId, principal.userId,
    isSessionHarness(harness) ? harness : same?.[2] ?? null,
    installation ?? same?.[3] ?? null, session]);
  if (p.captureRef === ref) return false;
  p.captureRef = ref;
  return true;
}

export function presencePreviews(repository: BoardRepository, recent: ReturnType<typeof createRecentSessions> | undefined, timeoutMs: number) {
  return (principal: Principal, key: string) => {
    const pending = new Map<string, {agent: string; apply: Array<(prompt: string) => void>}>();
    const promptHeader = '\n\nOpening user prompt\n';
    const sized: Array<object> = [];
    let cap: number | undefined, total = 0;
    const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
    // Prompts load after page budgets were measured; the enrichment must fit the
    // remaining room so delivery counts, cursors and receipts stay untouched.
    function boundedAppend(current: string, prompt: string) {
      if (cap === undefined) return promptHeader + prompt;
      const room = cap - total - (jsonBytes(promptHeader) - 2);
      if (room <= 0) return undefined;
      let text = prompt;
      if (jsonBytes(prompt) - 2 > room) {
        const points = Array.from(prompt), roomForText = room - 3;
        let used = 0, count = 0;
        for (const point of points) {
          const cost = jsonBytes(point) - 2;
          if (used + cost > roomForText) break;
          used += cost; count++;
        }
        if (!count) return undefined;
        text = points.slice(0, count).join('') + '…';
      }
      const append = promptHeader + text;
      total += jsonBytes(current + append) - jsonBytes(current);
      return append;
    }
    function add(agent: string, ref: string | undefined, apply: (prompt: string) => void) {
      if (!ref || !recent) return;
      try {
        const [tenant, owner, , , session] = parseSessionReference(ref, true);
        if (tenant !== principal.tenantId || boardIdentity(owner, session) !== agent) return;
      } catch { return; }
      const item = pending.get(ref);
      if (item) item.apply.push(apply);
      else pending.set(ref, {agent, apply: [apply]});
    }
    return {
      peer(source: {agent: string; name: string; task: string; captureRef?: string}) {
        const peer: {name: string; task: string; firstUserPrompt?: string} = {name: source.name, task: source.task};
        add(source.agent, source.captureRef, prompt => { peer.firstUserPrompt = prompt; });
        return peer;
      },
      message<T extends {text?: string; preview?: string}>(view: T, source: Pick<BoardMessage, 'agent' | 'captureRef' | 'onlineAudience'>) {
        if (source.onlineAudience && typeof view.text === 'string') {
          const target = view as {text: string};
          sized.push(target);
          add(source.agent, source.captureRef, prompt => {
            const append = boundedAppend(target.text, prompt);
            if (append !== undefined) target.text += append;
          });
        } else if (source.onlineAudience && typeof view.preview === 'string') {
          const target = view as {preview: string};
          sized.push(target);
          add(source.agent, source.captureRef, prompt => {
            const append = boundedAppend(target.preview, prompt);
            if (append !== undefined) target.preview += append;
          });
        }
        return view;
      },
      async finish<T>(operation: Promise<T>, capBytes?: number) {
        const result = await operation;
        if (!recent || !pending.size) return result;
        const agents = [...new Set(Array.from(pending.values(), item => item.agent))];
        const blockedAgents = async () => new Set(await repository.read(key, tx => tx.blockedPublications(agents)));
        const entries = pending.entries(), found = new Map<string, string>();
        const controller = new AbortController();
        // The board transaction has committed. Bound optional capture work for the
        // entire response, including backends that do not honor cancellation.
        async function load() {
          const blocked = await blockedAgents();
          async function worker() {
            for (const [ref, item] of entries) {
              if (controller.signal.aborted) return;
              if (blocked.has(item.agent)) continue;
              try {
                const [session] = await recent!.read(principal, {id: ref, field: 'firstUserMessage', openingPrompt: true, signal: controller.signal});
                const prompt = session?.firstUserMessage?.text;
                if (prompt && !controller.signal.aborted) found.set(ref, prompt);
              } catch { /* One unavailable capture must not suppress other introductions. */ }
            }
          }
          await Promise.all(Array.from({length: Math.min(4, pending.size)}, worker));
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([load(), new Promise<void>(resolve => {
            timer = setTimeout(() => { controller.abort(); resolve(); }, timeoutMs);
          })]);
          if (found.size) {
            const hidden = await blockedAgents();
            if (capBytes !== undefined) {
              cap = capBytes;
              total = sized.reduce((bytes, view) => bytes + jsonBytes(view), 0);
            }
            for (const [ref, prompt] of found) {
              const item = pending.get(ref)!;
              if (!hidden.has(item.agent)) for (const apply of item.apply) apply(prompt);
            }
          }
        } catch { /* If privacy checks are unavailable, return only the task. */ }
        finally { clearTimeout(timer); }
        return result;
      },
    };
  };
}
export type PreviewFactory = ReturnType<typeof presencePreviews>;
