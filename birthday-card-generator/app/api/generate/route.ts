import { NextResponse } from 'next/server';
import { FatalError } from 'workflow';
import { start } from 'workflow/api';
import { generateBirthdayCard } from '@/app/api/generate/generate-birthday-card';

export const POST = async (request: Request): Promise<Response> => {
  try {
    const body = await request.json();
    const { prompt, recipientEmail, rsvpEmails, eventDate } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      );
    }

    if (!eventDate || typeof eventDate !== 'string') {
      return NextResponse.json(
        { error: 'Event date is required and must be a string' },
        { status: 400 }
      );
    }

    const birthday = new Date(eventDate);

    if (Number.isNaN(birthday.getTime())) {
      return NextResponse.json(
        { error: 'Event date must be a valid date' },
        { status: 400 }
      );
    }

    const run = await start(generateBirthdayCard, [
      prompt,
      recipientEmail,
      rsvpEmails,
      birthday,
    ]);

    return new Response(run.readable, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'x-workflow-run-id': run.runId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isFatal = error instanceof FatalError;

    return NextResponse.json(
      {
        error: message,
        fatal: isFatal,
      },
      { status: isFatal ? 400 : 500 }
    );
  }
};
