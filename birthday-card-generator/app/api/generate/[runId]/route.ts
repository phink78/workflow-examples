import { NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import type { BirthdayCardResult, WorkflowRunStatus } from '@/lib/progress';

export const GET = async (
  _request: Request,
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

  const status = (await run.status) as WorkflowRunStatus;

  if (status === 'completed') {
    const result = (await run.returnValue) as BirthdayCardResult;
    return NextResponse.json({ status, result });
  }

  return NextResponse.json({ status });
};
