import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TRUST_API_URL } from '../lib/identityUrls';
import { SELLER_TOOL_DEFINITIONS, runSellerTool, type SellerToolName } from '../lib/agentTools';
import { extractRealtimeToolCalls } from '../lib/realtimeToolCalls';
import { formatMemoryForPrompt, loadSamanthaMemory } from '../lib/samanthaMemory';
import { subscribeSellerRuntimeJob } from '../lib/samanthaRuntimeHandoff';
import { useSubject } from '../hooks';
import { cn } from '../lib/utils';

const SELLER_ORB_INSTRUCTIONS =
  'You are Samantha, the ONDC Seller operations companion. Speak briefly. Keep every user-facing reply to at most two short sentences unless the user asks for detail. ' +
  "Interpret the user's intent, then act. " +
  'Greetings or chitchat: reply briefly with no tools. Do not volunteer work they did not ask for. ' +
  'Actionable short asks: choose and call the right tool(s). Chain several short tools in one turn when one request needs multiple steps. ' +
  'Continue after each function_call_output until the short request is done. Never claim an action without a successful tool call. ' +
  'Long or multi-step ops: call delegate_to_runtime_agent once. When it returns started, say you started and will let them know when done — ' +
  'never mention another agent, Cursor, or /agent. Never claim longer work finished unless a later update says so. ' +
  'Never invent work the user did not ask for. Report AgentGuard allow / need_approval / deny honestly. Do not send users to /agent. ' +
  'Short tools: navigate_to, catalog_publish, refund_issue, remember_preference.';

type OrbState = 'idle' | 'connecting' | 'listening' | 'error';

function replyForDisplay(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line))
    .join('\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createSilentAudioTrack(): MediaStreamTrack {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain);
  const dest = ctx.createMediaStreamDestination();
  gain.connect(dest);
  oscillator.start();
  const track = dest.stream.getAudioTracks()[0];
  track.enabled = true;
  return track;
}

/**
 * Seller Samantha orb — voice + compact text for ops (refunds, navigate, publish).
 */
export function SamanthaOrb() {
  const navigate = useNavigate();
  const { subjectId, walletAddress } = useSubject();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OrbState>('idle');
  const [hint, setHint] = useState('Tap for Samantha (voice or text)');
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState('');
  /** null = status not loaded yet (do not treat as missing OpenAI key). */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const handledCallsRef = useRef<Set<string>>(new Set());
  const replyBufRef = useRef('');
  /** Queued while connecting — flushed when Realtime is listening. */
  const pendingTextRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeSellerRuntimeJob((update) => {
      const w = window as Window & {
        __samanthaRuntimeJobs?: Array<Record<string, unknown>>;
      };
      w.__samanthaRuntimeJobs = w.__samanthaRuntimeJobs || [];
      w.__samanthaRuntimeJobs.push({ ...update, at: new Date().toISOString() });
      w.__samanthaRuntimeJobs = w.__samanthaRuntimeJobs.slice(-20);
      if (update.status === 'started') {
        setHint(update.summary || "I've started that — I'll let you know when it's done.");
        setOpen(true);
        return;
      }
      if (update.status === 'busy') {
        setHint(update.error || "I'm still working on that.");
        setOpen(true);
        return;
      }
      const note =
        update.status === 'completed'
          ? update.summary || 'All done.'
          : update.summary || update.error || "Sorry — that didn't finish.";
      setHint(
        update.status === 'completed'
          ? 'Background task complete'
          : 'Background task could not finish'
      );
      setReply(note);
      setOpen(true);
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') return;
      try {
        dc.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    update.status === 'completed'
                      ? `[Internal] Background work finished. Tell the user briefly: ${note}`
                      : `[Internal] Background work failed. Tell the user briefly: ${note}`,
                },
              ],
            },
          })
        );
        dc.send(JSON.stringify({ type: 'response.create' }));
      } catch {
        /* channel closed */
      }
    });
  }, []);

  async function probeRealtimeConfigured(retries = 3): Promise<boolean> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const res = await fetch(`${TRUST_API_URL}/api/realtime/status`);
        const body = await res.json();
        const ok = Boolean(body?.data?.configured);
        setConfigured(ok);
        if (body?.data?.model) {
          setHint(`Samantha · ${body.data.model}`);
        }
        return ok;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    setConfigured(false);
    if (lastErr) {
      setHint('Gateway unreachable — retry in a moment');
    }
    return false;
  }

  useEffect(() => {
    void probeRealtimeConfigured();
    return () => {
      stopSession();
    };
  }, []);

  const handleToolCall = useCallback(
    async (name: string, callId: string, argsJson: string) => {
      if (handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      const result = await runSellerTool(name as SellerToolName, args, {
        walletAddress: walletAddress || '',
        subjectId: subjectId || '',
      });
      setHint(result.message);
      // Evidence for Hermes / operators — tool applied in the UI host.
      try {
        const w = window as Window & {
          __samanthaTools?: Array<Record<string, unknown>>;
        };
        w.__samanthaTools = w.__samanthaTools || [];
        w.__samanthaTools.push({
          at: Date.now(),
          name,
          callId,
          ok: result.ok,
          message: result.message,
          navigateTo: result.navigateTo ?? null,
        });
      } catch {
        /* ignore */
      }
      if (result.navigateTo) navigate(result.navigateTo);
      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') return;
      dc.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({
              ok: result.ok,
              tool: result.tool,
              message: result.message,
              navigateTo: result.navigateTo,
              decision: result.decision,
              receiptId: result.receiptId,
              data: result.data,
            }),
          },
        })
      );
      dc.send(JSON.stringify({ type: 'response.create' }));
    },
    [navigate, subjectId, walletAddress]
  );

  function stopSession() {
    const pc = pcRef.current;
    pcRef.current = null;
    dcRef.current = null;
    handledCallsRef.current.clear();
    replyBufRef.current = '';
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    try {
      pc?.getSenders().forEach((sender) => sender.track?.stop());
      pc?.close();
    } catch {
      /* already closed */
    }
    setState('idle');
  }

  function appendReply(chunk: string) {
    replyBufRef.current += chunk;
    setReply(replyBufRef.current.slice(0, 1200));
  }

  function wireDataChannel(dc: RTCDataChannel, model: string, usedMic: boolean) {
    dcRef.current = dc;
    dc.onopen = () => {
      if (pcRef.current == null) return;
      // GA Realtime: output_modalities is ["audio"] OR ["text"], not both.
      // Silent placeholder tracks must disable VAD or they auto-fire ghost turns.
      const session: Record<string, unknown> = {
        type: 'realtime',
        model,
        output_modalities: usedMic ? ['audio'] : ['text'],
        tools: SELLER_TOOL_DEFINITIONS,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        instructions: SELLER_ORB_INSTRUCTIONS,
        audio: {
          input: {
            turn_detection: usedMic ? { type: 'semantic_vad' } : null,
          },
        },
      };
      dc.send(JSON.stringify({ type: 'session.update', session }));
      setHint(usedMic ? 'Connecting tools…' : 'Connecting text mode…');
    };
    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          delta?: string;
          transcript?: string;
          text?: string;
          error?: { message?: string; code?: string };
          message?: string;
        };
        try {
          const w = window as Window & {
            __samanthaEvents?: string[];
            __samanthaErrors?: unknown[];
          };
          w.__samanthaEvents = w.__samanthaEvents || [];
          w.__samanthaErrors = w.__samanthaErrors || [];
          if (msg.type && w.__samanthaEvents.length < 120) {
            w.__samanthaEvents.push(msg.type);
          }
          if (msg.type === 'error') {
            w.__samanthaErrors.push(msg);
          }
        } catch {
          /* ignore */
        }
        if (msg.type === 'session.updated') {
          setState('listening');
          setHint(usedMic ? 'Listening + text ready' : 'Text mode ready (no mic)');
          const pending = pendingTextRef.current;
          if (pending && dc.readyState === 'open') {
            pendingTextRef.current = null;
            replyBufRef.current = '';
            setReply('');
            setDraft('');
            dc.send(
              JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text: pending }],
                },
              })
            );
            dc.send(JSON.stringify({ type: 'response.create' }));
            setHint('Samantha is thinking…');
          }
        }
        if (msg.type === 'error') {
          const detail = msg.error?.message || msg.message || msg.error?.code || 'session error';
          setState('error');
          setHint(`Samantha error: ${String(detail).slice(0, 160)}`);
        }
        if (
          msg.type === 'response.created' &&
          replyBufRef.current &&
          !/\s$/.test(replyBufRef.current)
        ) {
          replyBufRef.current += ' ';
        }
        if (
          msg.type === 'response.output_audio_transcript.delta' ||
          msg.type === 'response.audio_transcript.delta' ||
          msg.type === 'response.output_text.delta' ||
          msg.type === 'response.text.delta'
        ) {
          appendReply(String(msg.delta || msg.transcript || msg.text || ''));
        }
        if (
          msg.type === 'response.output_audio_transcript.done' ||
          msg.type === 'response.audio_transcript.done' ||
          msg.type === 'response.done'
        ) {
          // Do not clobber tool result hints.
          if (replyBufRef.current.trim() && handledCallsRef.current.size === 0) {
            setHint('Samantha replied');
          }
        }
        const calls = extractRealtimeToolCalls(msg);
        if (calls.length === 0) return;
        void (async () => {
          for (const call of calls) {
            await handleToolCall(call.name, call.call_id, call.arguments);
          }
        })();
      } catch {
        /* ignore */
      }
    };
  }

  async function startSession() {
    if (state === 'listening' || state === 'connecting') return;
    setState('connecting');
    setHint('Connecting Samantha…');
    // Re-probe on open: avoids false "not configured" while status is still loading
    // or after a Free-tier cold start failed the mount-time fetch.
    const ready = configured === true ? true : await probeRealtimeConfigured();
    if (!ready) {
      setState('error');
      setHint('Realtime not configured on gateway');
      return;
    }
    setReply('');
    replyBufRef.current = '';
    const memory = loadSamanthaMemory(subjectId);
    const secretRes = await fetch(`${TRUST_API_URL}/api/realtime/client-secret`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'seller',
        agent_name: 'Samantha',
        memory_prompt: formatMemoryForPrompt(memory),
      }),
    });
    const secretBody = await secretRes.json();
    if (!secretRes.ok || secretBody.success === false) {
      setState('error');
      setHint(String(secretBody.detail || 'Failed to start Samantha'));
      return;
    }
    const clientSecret =
      secretBody.data?.client_secret?.value ||
      secretBody.data?.client_secret ||
      secretBody.data?.raw?.value;
    if (!clientSecret || typeof clientSecret !== 'string') {
      setState('error');
      setHint('Bad client secret payload');
      return;
    }

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    const stillActive = () => pcRef.current === pc;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audioRef.current = audio;
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      void audio.play().catch(() => {
        setHint('Tap Send again if audio is blocked');
      });
    };

    let usedMic = false;
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!stillActive()) {
        ms.getTracks().forEach((t) => t.stop());
        return;
      }
      pc.addTrack(ms.getTracks()[0]);
      usedMic = true;
    } catch {
      if (!stillActive()) return;
      try {
        pc.addTrack(createSilentAudioTrack());
        setHint('Connecting text mode…');
      } catch {
        setState('error');
        setHint('Could not start audio channel');
        stopSession();
        return;
      }
    }

    const dc = pc.createDataChannel('oai-events');
    wireDataChannel(dc, secretBody.data?.model || 'gpt-realtime-2.1-mini', usedMic);

    const offer = await pc.createOffer();
    if (!stillActive()) return;
    await pc.setLocalDescription(offer);
    const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!stillActive()) return;
    if (!sdpResponse.ok) {
      setState('error');
      setHint(`WebRTC failed (${sdpResponse.status})`);
      stopSession();
      return;
    }
    const answerSdp = await sdpResponse.text();
    if (!stillActive()) return;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch {
      if (!stillActive()) return;
      setState('error');
      setHint('Samantha connection aborted');
      stopSession();
    }
  }

  function sendText(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open' || state !== 'listening') {
      pendingTextRef.current = text;
      setHint('Connecting… I’ll send that as soon as Samantha is ready');
      if (state === 'idle' || state === 'error') {
        void startSession();
      }
      return;
    }
    replyBufRef.current = '';
    setReply('');
    pendingTextRef.current = null;
    dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
    );
    dc.send(JSON.stringify({ type: 'response.create' }));
    setDraft('');
    setHint('Samantha is thinking…');
  }

  function toggle() {
    if (open && (state === 'listening' || state === 'connecting')) {
      stopSession();
      setOpen(false);
      setHint('Samantha paused');
      setReply('');
      return;
    }
    if (open && state === 'idle') {
      setOpen(false);
      return;
    }
    setOpen(true);
    void startSession();
  }

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3"
      data-testid="samantha-orb-root"
    >
      {open ? (
        <div
          className="pointer-events-auto w-[340px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border/70 bg-card/95 px-4 py-3 text-sm shadow-[var(--surface-lift)] backdrop-blur-xl"
          data-testid="samantha-orb-panel"
        >
          <p className="text-base font-semibold tracking-tight text-foreground">Samantha</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          {reply ? (
            <div
              className="mt-2 max-h-40 whitespace-pre-wrap overflow-y-auto border-t border-border/50 pt-2 text-xs leading-relaxed text-foreground"
              data-testid="samantha-orb-reply"
            >
              {replyForDisplay(reply)}
            </div>
          ) : null}
          <form className="mt-3 flex gap-2" onSubmit={sendText}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={state === 'connecting' ? 'Type while Samantha connects' : 'Ask Samantha'}
              data-testid="samantha-orb-text"
              className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-2 text-xs outline-none transition focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="submit"
              data-testid="samantha-orb-send"
              disabled={!draft.trim()}
              className="rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <button
            type="button"
            className="mt-2 text-xs text-primary hover:underline"
            onClick={() => navigate('/agentguard')}
          >
            AgentGuard and memory
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={state === 'listening' ? 'Stop Samantha' : 'Open Samantha'}
        data-testid="samantha-orb"
        onClick={toggle}
        className={cn(
          'pointer-events-auto flex size-14 items-center justify-center rounded-full text-sm font-semibold transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          state === 'listening' &&
            'bg-primary text-primary-foreground shadow-[0_8px_24px_oklch(0.48_0.07_195_/_0.35)] ring-2 ring-primary/30',
          state === 'connecting' && 'bg-secondary text-foreground ring-2 ring-border',
          state === 'error' && 'bg-destructive/10 text-destructive ring-2 ring-destructive/30',
          state === 'idle' &&
            'bg-primary text-primary-foreground shadow-[0_8px_24px_oklch(0.48_0.07_195_/_0.28)] hover:scale-105 active:scale-[0.98]'
        )}
      >
        S
      </button>
    </div>
  );
}
