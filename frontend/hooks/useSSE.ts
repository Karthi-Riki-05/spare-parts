'use client';

import type {
  SSEProgressEvent,
  SSERowCompleteEvent,
  SSECompleteEvent,
  SSEErrorEvent,
} from '@spare-parts/types';

interface SSEHandlers {
  onProgress: (e: SSEProgressEvent) => void;
  onRowComplete: (e: SSERowCompleteEvent) => void;
  onComplete: (e: SSECompleteEvent) => void;
  onError: (e: SSEErrorEvent) => void;
}

export function useSSE() {
  function connect(
    url: string,
    body: unknown,
    handlers: SSEHandlers,
  ): AbortController {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!res.ok || !res.body) {
          handlers.onError({ type: 'error', rowIndex: -1, message: `HTTP ${res.status}` });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const event = JSON.parse(trimmed.slice(6));
                switch (event.type) {
                  case 'progress':
                    handlers.onProgress(event);
                    break;
                  case 'row_complete':
                    handlers.onRowComplete(event);
                    break;
                  case 'complete':
                    handlers.onComplete(event);
                    break;
                  case 'error':
                    handlers.onError(event);
                    break;
                }
              } catch {
                // skip malformed events
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          handlers.onError({
            type: 'error',
            rowIndex: -1,
            message: (err as Error).message || 'Connection failed',
          });
        }
      }
    })();

    return controller;
  }

  return { connect };
}
