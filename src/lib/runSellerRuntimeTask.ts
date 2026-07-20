/**
 * Shared Seller agent POST + SSE consume for Samantha background handoff.
 */
import { buildAgentControlPlaneUrl } from './agentControlPlane';

export type AgentStreamHandlers = {
  onDelta?: () => void;
  onResult?: (content: string) => Promise<void> | void;
  onError?: (error: string) => void;
  onDone?: () => void;
};

export async function consumeAgentSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      handlers.onDone?.();
      return;
    }

    const { done, value } = await reader.read();
    if (done) {
      handlers.onDone?.();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.replace(/^data:\s*/, '').trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data) as { type?: string; content?: string; error?: string };
        if (event.type === 'assistant_delta') {
          handlers.onDelta?.();
        } else if (event.type === 'result' && typeof event.content === 'string') {
          await handlers.onResult?.(event.content);
        } else if (event.type === 'error' && typeof event.error === 'string') {
          handlers.onError?.(event.error);
        }
      } catch (error) {
        handlers.onError?.(
          error instanceof Error ? error.message : 'Failed to parse seller agent stream.',
        );
      }
    }
  }
}

export type RunSellerRuntimeTaskParams = {
  prompt: string;
  sessionId: string;
  subjectId: string;
  walletAddress?: string | null;
  context?: Record<string, unknown>;
  signal?: AbortSignal;
} & AgentStreamHandlers;

/** POST /api/agent/seller and consume the SSE stream. */
export async function runSellerRuntimeTask(params: RunSellerRuntimeTaskParams): Promise<void> {
  const response = await fetch(buildAgentControlPlaneUrl('/api/agent/seller'), {
    method: 'POST',
    credentials: 'include',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': params.subjectId,
      ...(params.walletAddress ? { 'X-Wallet-Address': params.walletAddress } : {}),
    },
    body: JSON.stringify({
      prompt: params.prompt,
      sessionId: params.sessionId,
      context: params.context ?? {},
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body returned by the seller agent.');
  }

  await consumeAgentSseStream(reader, params, params.signal);
}
