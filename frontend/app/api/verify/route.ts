export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  const backend = process.env.BACKEND_URL || 'http://localhost:3001';
  const cookie = req.headers.get('cookie') || undefined;
  const upstream = await fetch(`${backend}/api/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: await req.text(),
    // @ts-expect-error - Node fetch duplex required for streaming request bodies
    duplex: 'half',
    signal: req.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
