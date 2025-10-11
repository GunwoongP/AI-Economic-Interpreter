import { NextRequest } from 'next/server';
import { mockAsk } from '../mock';

const encoder = new TextEncoder();

function toSegments(text: string) {
  return text
    .split(/\r?\n+/)
    .flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((seg) => seg.trim())
        .filter(Boolean),
    );
}

function send(controller: ReadableStreamDefaultController<Uint8Array>, event: unknown) {
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const q = String(body?.q ?? '');
  const payload = mockAsk(q);
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      send(controller, { type: 'start', data: { ts: started } });

      let firstLineTs: number | null = null;
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      for (const card of payload.cards) {
        const lines = toSegments(card.content);
        for (const line of lines) {
          if (req.signal?.aborted) {
            controller.close();
            return;
          }
          await delay(120);
          const now = Date.now();
          if (!firstLineTs) firstLineTs = now;
          send(controller, { type: 'line', data: { role: card.type, title: card.title, text: line } });
        }
        if (Array.isArray(card.points)) {
          for (const point of card.points) {
            if (req.signal?.aborted) {
              controller.close();
              return;
            }
            await delay(80);
            send(controller, { type: 'line', data: { role: card.type, title: card.title, text: `• ${point}` } });
          }
        }
      }

      const completed = Date.now();
      payload.metrics = {
        ...payload.metrics,
        ttft_ms: firstLineTs ? firstLineTs - started : payload.metrics?.ttft_ms,
      };
      payload.meta = {
        ...payload.meta,
        stamp: [new Date(started).toISOString(), new Date(completed).toISOString()],
      };

      if (payload.metrics) {
        send(controller, { type: 'metrics', data: payload.metrics });
      }

      await delay(60);
      send(controller, { type: 'complete', data: payload });
      controller.close();
    },
    cancel() {
      // nothing to clean up in mock mode
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
