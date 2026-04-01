import { webhookHook } from '@/workflows/chat/hooks/webhook';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let body: any;
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      body = await request.text();
    }
  } catch {
    body = null;
  }

  await webhookHook.resume(token, {
    method: request.method,
    body,
  });

  return Response.json({ received: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const url = new URL(request.url);
  const body = Object.fromEntries(url.searchParams.entries());

  await webhookHook.resume(token, {
    method: 'GET',
    body: Object.keys(body).length > 0 ? body : null,
  });

  return Response.json({ received: true });
}
