import { NextRequest } from 'next/server';
import { mockAsk } from '../mock';

const encoder = new TextEncoder();

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

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      if (req.signal?.aborted) {
        controller.close();
        return;
      }
      await delay(120);

      const completed = Date.now();
      payload.metrics = {
        ...payload.metrics,
        ttft_ms: payload.metrics?.ttft_ms ?? completed - started,
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
