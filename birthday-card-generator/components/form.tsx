'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  PROGRESS_STEPS,
  type BirthdayCardProgressEvent,
  type BirthdayCardResult,
  type ProgressStepId,
  type WorkflowRunStatus,
} from '@/lib/progress';
import { Textarea } from './ui/textarea';

const formSchema = z.object({
  prompt: z.string().min(1, {
    message: 'Prompt is required.',
  }),
  recipientEmail: z.string().email({
    message: 'Please enter a valid email address.',
  }),
  eventDate: z.date({
    message: 'Please pick a birthday date.',
  }),
  rsvpEmail1: z
    .string()
    .email({
      message: 'Please enter a valid email address.',
    })
    .optional()
    .or(z.literal('')),
  rsvpEmail2: z
    .string()
    .email({
      message: 'Please enter a valid email address.',
    })
    .optional()
    .or(z.literal('')),
  rsvpEmail3: z
    .string()
    .email({
      message: 'Please enter a valid email address.',
    })
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

type StepState = {
  id: ProgressStepId;
  title: string;
  description: string;
  status: StepStatus;
};

type RunState = {
  imageStatus: StepStatus;
  image: string | null;
  messageStatus: StepStatus;
  status: 'idle' | 'starting' | 'streaming' | 'completed' | 'failed';
  steps: StepState[];
  text: string | null;
};

const createInitialSteps = (): StepState[] =>
  PROGRESS_STEPS.map((step) => ({
    ...step,
    status: 'pending',
  }));

const createInitialRunState = (): RunState => ({
  imageStatus: 'pending',
  image: null,
  messageStatus: 'pending',
  status: 'idle',
  steps: createInitialSteps(),
  text: null,
});

const updateStep = (
  steps: StepState[],
  stepId: ProgressStepId,
  status: StepStatus,
  description: string
) =>
  steps.map((step) =>
    step.id === stepId ? { ...step, description, status } : step
  );

const markAllCompleted = (steps: StepState[]) =>
  steps.map((step) =>
    step.status === 'failed' ? step : { ...step, status: 'completed' as const }
  );

const deriveCardPreviewStep = (
  steps: StepState[],
  imageStatus: StepStatus,
  messageStatus: StepStatus,
  image: string | null,
  text: string | null
) => {
  const hasStarted =
    imageStatus === 'in_progress' ||
    imageStatus === 'completed' ||
    messageStatus === 'in_progress' ||
    messageStatus === 'completed';
  const isReady =
    imageStatus === 'completed' &&
    messageStatus === 'completed' &&
    Boolean(image) &&
    Boolean(text);

  if (isReady) {
    return updateStep(
      steps,
      'generate-card',
      'completed',
      'Birthday card ready for preview.'
    );
  }

  if (hasStarted) {
    const partials = [];

    if (image) {
      partials.push('image ready');
    }

    if (text) {
      partials.push('message ready');
    }

    return updateStep(
      steps,
      'generate-card',
      'in_progress',
      partials.length
        ? `${partials.join(', ')}. Waiting for the rest of the card.`
        : 'Generating the postcard image and message.'
    );
  }

  return steps;
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || 'Something went wrong.';
  } catch {
    return 'Something went wrong.';
  }
};

const StepIcon = ({ status }: { status: StepStatus }) => {
  if (status === 'completed') {
    return <CheckCircle2Icon className="size-4 text-emerald-600" />;
  }

  if (status === 'failed') {
    return <AlertCircleIcon className="size-4 text-red-600" />;
  }

  if (status === 'in_progress') {
    return <Loader2Icon className="size-4 animate-spin text-sky-600" />;
  }

  return <CircleIcon className="size-4 text-muted-foreground/60" />;
};

const previewText = (text: string | null, maxLength = 140) => {
  if (!text) {
    return 'The birthday message will appear here as soon as it is ready.';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
};

export const BirthdayCardForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>(() =>
    createInitialRunState()
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextStartIndexRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema as never),
    defaultValues: {
      prompt: '',
      recipientEmail: '',
      rsvpEmail1: '',
      rsvpEmail2: '',
      rsvpEmail3: '',
    },
  });

  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const stopStreaming = () => {
    clearReconnectTimeout();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const syncRunIdInUrl = (runId: string | null) => {
    const url = new URL(window.location.href);

    if (runId) {
      url.searchParams.set('runId', runId);
    } else {
      url.searchParams.delete('runId');
    }

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const applyCompletedResult = (result: BirthdayCardResult) => {
    setRunState((current) => ({
      ...current,
      imageStatus: 'completed',
      image: result.image,
      messageStatus: 'completed',
      status: 'completed',
      steps: markAllCompleted(
        deriveCardPreviewStep(
          current.steps,
          'completed',
          'completed',
          result.image,
          result.text
        )
      ),
      text: result.text,
    }));
  };

  const applyEvent = (event: BirthdayCardProgressEvent) => {
    if (event.type === 'error') {
      setError(event.message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
        steps: event.step
          ? updateStep(
              current.steps,
              event.step === 'generate-image' || event.step === 'generate-message'
                ? 'generate-card'
                : event.step,
              'failed',
              event.message
            )
          : current.steps,
      }));
      return;
    }

    setRunState((current) => {
      const nextImage = event.image ?? current.image;
      const nextText = event.text ?? current.text;
      const nextImageStatus =
        event.step === 'generate-image' ? event.status : current.imageStatus;
      const nextMessageStatus =
        event.step === 'generate-message' ? event.status : current.messageStatus;
      const mappedStep =
        event.step === 'generate-image' || event.step === 'generate-message'
          ? 'generate-card'
          : event.step;
      const nextSteps = deriveCardPreviewStep(
        updateStep(current.steps, mappedStep, event.status, event.message),
        nextImageStatus,
        nextMessageStatus,
        nextImage,
        nextText
      );

      return {
        ...current,
        imageStatus: nextImageStatus,
        image: nextImage,
        messageStatus: nextMessageStatus,
        status:
          event.step === 'send-postcard' && event.status === 'completed'
            ? 'completed'
            : 'streaming',
        steps: nextSteps,
        text: nextText,
      };
    });
  };

  const fetchRunStatus = async (runId: string) => {
    const response = await fetch(`/api/generate/${runId}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    return (await response.json()) as {
      result?: BirthdayCardResult;
      status: WorkflowRunStatus;
    };
  };

  const handleStreamClosure = async (runId: string) => {
    if (abortControllerRef.current?.signal.aborted) {
      return;
    }

    try {
      const payload = await fetchRunStatus(runId);

      if (payload.status === 'running') {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          void resumeRun(runId);
        }, 1000);
        return;
      }

      if (payload.status === 'completed' && payload.result) {
        applyCompletedResult(payload.result);
        setError(null);
        return;
      }

      const message =
        payload.status === 'cancelled'
          ? 'The workflow was cancelled before it finished.'
          : 'The workflow stopped before it could finish.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    } catch (streamError) {
      const message =
        streamError instanceof Error
          ? streamError.message
          : 'Unable to resume the workflow stream.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    }
  };

  const consumeStream = async (response: Response, runId: string) => {
    if (!response.body) {
      throw new Error('The workflow did not return a readable stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          nextStartIndexRef.current += 1;
          applyEvent(JSON.parse(line) as BirthdayCardProgressEvent);
        }
      }

      if (buffer.trim()) {
        nextStartIndexRef.current += 1;
        applyEvent(JSON.parse(buffer) as BirthdayCardProgressEvent);
      }
    } finally {
      reader.releaseLock();
    }

    await handleStreamClosure(runId);
  };

  const resumeRun = async (runId: string) => {
    clearReconnectTimeout();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `/api/generate/${runId}/stream?startIndex=${nextStartIndexRef.current}`,
        {
          cache: 'no-store',
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await consumeStream(response, runId);
    } catch (streamError) {
      if (controller.signal.aborted) {
        return;
      }

      const message =
        streamError instanceof Error
          ? streamError.message
          : 'Unable to reconnect to the workflow stream.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    }
  };

  const restoreRun = async (runId: string) => {
    stopStreaming();
    nextStartIndexRef.current = 0;
    setError(null);
    setRunState({
      ...createInitialRunState(),
      status: 'streaming',
    });

    try {
      const payload = await fetchRunStatus(runId);

      if (payload.status === 'completed' && payload.result) {
        applyCompletedResult(payload.result);
        return;
      }

      if (payload.status === 'running') {
        await resumeRun(runId);
        return;
      }

      const message =
        payload.status === 'cancelled'
          ? 'The workflow was cancelled before it finished.'
          : 'The workflow stopped before it could finish.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    } catch (restoreError) {
      const message =
        restoreError instanceof Error
          ? restoreError.message
          : 'Unable to restore the workflow run.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    }
  };

  useEffect(() => {
    const runId = new URLSearchParams(window.location.search).get('runId');

    if (runId) {
      void restoreRun(runId);
    }

    return stopStreaming;
  }, []);

  const onSubmit = async (values: FormValues) => {
    stopStreaming();
    setError(null);
    nextStartIndexRef.current = 0;
    setRunState({
      ...createInitialRunState(),
      status: 'starting',
      steps: updateStep(
        createInitialSteps(),
        'prompts-ready',
        'in_progress',
        'Generating the text and image prompts.'
      ),
    });

    try {
      const rsvpEmails = [
        values.rsvpEmail1,
        values.rsvpEmail2,
        values.rsvpEmail3,
      ].filter((email) => email && email.trim().length > 0);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch('/api/generate', {
        body: JSON.stringify({
          eventDate: values.eventDate.toISOString(),
          prompt: values.prompt,
          recipientEmail: values.recipientEmail,
          rsvpEmails,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const runId = response.headers.get('x-workflow-run-id');

      if (!runId) {
        throw new Error('The workflow started without returning a run ID.');
      }

      syncRunIdInUrl(runId);
      setRunState((current) => ({
        ...current,
        status: 'streaming',
      }));

      await consumeStream(response, runId);
    } catch (submitError) {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Unable to start the birthday card workflow.';

      setError(message);
      setRunState((current) => ({
        ...current,
        status: 'failed',
      }));
    }
  };

  const hasPrompt = form.watch('prompt').trim().length > 0;
  const isBusy = runState.status === 'starting' || runState.status === 'streaming';
  const isModalOpen = runState.status !== 'idle';
  const resetRun = () => {
    stopStreaming();
    nextStartIndexRef.current = 0;
    setError(null);
    setRunState(createInitialRunState());
    syncRunIdInUrl(null);
  };

  return (
    <>
      <div className="w-full space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="recipientEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="recipient@example.com"
                      className="bg-background"
                      disabled={isBusy}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Birthday</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                          disabled={isBusy}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto size-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Describe the birthday card you want to create
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="I want a beach image with a message that says 'Happy Birthday!' and something nice."
                      disabled={isBusy}
                      className="bg-background min-h-32"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormLabel>RSVP Email</FormLabel>
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="rsvpEmail1"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="guest1@example.com"
                          className="bg-background"
                          disabled={isBusy}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rsvpEmail2"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="guest2@example.com"
                          className="bg-background"
                          disabled={isBusy}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rsvpEmail3"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="guest3@example.com"
                          className="bg-background"
                          disabled={isBusy}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={isBusy || !hasPrompt}
              className="w-full"
            >
              {isBusy ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Workflow running
                </>
              ) : (
                'Generate and send'
              )}
            </Button>
          </form>
        </Form>

        {error && !isModalOpen && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Workflow Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetRun();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:p-6">
          <DialogHeader className="pr-8">
            <DialogTitle>Live Workflow</DialogTitle>
            <DialogDescription>
              Follow the postcard from generation to delivery.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Workflow Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-5">
            {runState.steps.map((step, index) => (
              <div
                key={step.id}
                className="grid grid-cols-[auto_1fr] gap-3"
              >
                <div className="flex flex-col items-center">
                  <div className="rounded-full border bg-background p-2">
                    <StepIcon status={step.status} />
                  </div>
                  {index !== runState.steps.length - 1 && (
                    <div
                      className={cn(
                        'mt-2 h-full min-h-8 w-px',
                        step.status === 'completed'
                          ? 'bg-emerald-300'
                          : step.status === 'failed'
                            ? 'bg-red-300'
                            : 'bg-border'
                      )}
                    />
                  )}
                </div>

                <div className="space-y-2 pb-5">
                  <p className="font-medium text-sm">{step.title}</p>
                  <p className="text-muted-foreground text-sm leading-6">
                    {step.description}
                  </p>

                  {step.id === 'generate-card' &&
                    (runState.image || runState.text) && (
                      <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
                        {runState.image ? (
                          <img
                            alt="Generated birthday card preview"
                            className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                            src={runState.image}
                          />
                        ) : null}
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-sm">Card preview</p>
                          <p className="text-muted-foreground text-sm leading-6">
                            {previewText(runState.text)}
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
