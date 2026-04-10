import { NextResponse } from 'next/server';
import { getRun } from 'workflow/api';

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) => {
  const { runId } = await params;
  const run = getRun(runId);

  if (!(await run.exists)) {
    return NextResponse.json(
      { error: 'Workflow run not found' },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startIndexParam = searchParams.get('startIndex');
  const parsedStartIndex =
    startIndexParam === null ? undefined : Number.parseInt(startIndexParam, 10);
  const startIndex = Number.isNaN(parsedStartIndex)
    ? undefined
    : parsedStartIndex;
  const stream = run.getReadable<string>({ startIndex });
  const tailIndex = await stream.getTailIndex();

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'x-workflow-stream-tail-index': String(tailIndex),
    },
  });
};
