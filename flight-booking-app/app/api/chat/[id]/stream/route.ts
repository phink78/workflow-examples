import { createUIMessageStreamResponse } from 'ai';
import { getRun } from 'workflow/api';

// Uncomment to simulate a long running Vercel Function timing
// out due to a long running agent. The client-side will
// automatically reconnect to the stream.
//export const maxDuration = 5;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[route] GET start, signal.aborted:', request.signal.aborted);
  request.signal.addEventListener('abort', () => {
    console.log(
      '[route] request.signal aborted event, reason:',
      (request.signal.reason as Error)?.message ??
        (request.signal.reason as unknown)
    );
  });

  // Poll signal.aborted every 2s so we can see when (if ever) it flips.
  const pollStart = Date.now();
  const pollInterval = setInterval(() => {
    const elapsed = ((Date.now() - pollStart) / 1000).toFixed(0);
    console.log(
      `[route] poll t+${elapsed}s signal.aborted=${request.signal.aborted}`
    );
    if (request.signal.aborted) {
      clearInterval(pollInterval);
    }
    if (Date.now() - pollStart > 60_000) clearInterval(pollInterval);
  }, 2_000);

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const startIndexParam = searchParams.get('startIndex');
  const startIndex =
    startIndexParam !== null ? parseInt(startIndexParam, 10) : undefined;
  const run = getRun(id);
  const stream = run.getReadable({ startIndex });

  // Wrap the stream to observe whether Next.js cancels it on client
  // disconnect. If cancel fires here, the chain IS propagating and my
  // world-vercel fix will be exercised. If it never fires, Vercel's
  // runtime isn't plumbing the disconnect through to the Response body.
  const wrapped = new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('[route] wrapped: upstream done');
              controller.close();
              return;
            }
            controller.enqueue(value);
          }
        } catch (err) {
          console.log(
            '[route] wrapped: upstream read err:',
            (err as Error)?.message ?? err
          );
          controller.error(err);
        }
      })();
    },
    async cancel(reason) {
      console.log(
        '[route] wrapped.cancel called, reason:',
        (reason as Error)?.message ?? reason
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: wrapped as any,
  });
}
