export const PROGRESS_STEPS = [
  {
    id: 'prompts-ready',
    title: 'Prompts ready',
    description: 'Preparing the text and image prompts.',
  },
  {
    id: 'generate-card',
    title: 'Card ready',
    description: 'Generating the postcard image and message.',
  },
  {
    id: 'send-rsvps',
    title: 'RSVP emails sent',
    description: 'Sending preview emails to invited guests.',
  },
  {
    id: 'collect-rsvps',
    title: 'All RSVPs received',
    description: 'Waiting for guests to respond to the invitation.',
  },
  {
    id: 'wait-for-birthday',
    title: 'Waiting for birthday',
    description: 'Holding the postcard until the selected birthday.',
  },
  {
    id: 'send-postcard',
    title: 'Postcard sent',
    description: 'Delivering the final postcard to the recipient.',
  },
] as const;

export type ProgressStepId =
  | (typeof PROGRESS_STEPS)[number]['id']
  | 'generate-image'
  | 'generate-message';

export type ProgressEventStatus = 'in_progress' | 'completed' | 'failed';

export type BirthdayCardResult = {
  image: string;
  text: string;
};

export type BirthdayCardProgressEvent =
  | {
      type: 'progress';
      step: ProgressStepId;
      status: ProgressEventStatus;
      message: string;
      image?: string;
      text?: string;
    }
  | {
      type: 'error';
      message: string;
      step?: ProgressStepId;
    };

export type WorkflowRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const serializeProgressEvent = (
  event: BirthdayCardProgressEvent
) => `${JSON.stringify(event)}\n`;
