import { createWebhook, sleep } from 'workflow';
import { generateImage } from './generate-image';
import { generateMessage } from './generate-message';
import { generatePrompts } from './generate-prompts';
import { requestRsvp } from './request-rsvp';
import { sendRecipientEmail } from './send-recipient-email';
import { closeProgressStream, writeProgressEvent } from './stream-progress';

export const generateBirthdayCard = async (
  prompt: string,
  recipientEmail: string,
  rsvpEmails: string[],
  birthday?: Date
) => {
  'use workflow';

  try {
    console.log(`Starting birthday card generation for: ${prompt}`);

    console.log('Step 1/5: Generating text and image prompts');
    const { textPrompt, imagePrompt } = await generatePrompts(prompt);
    console.log('Step 1/5 complete. Prompts generated');

    console.log('Step 2/5: Generating image and text.');
    const [image, text] = await Promise.all([
      generateImage(imagePrompt),
      generateMessage(textPrompt),
    ]);
    console.log('Step 2/5 complete. Image and text generated');

    await writeProgressEvent({
      type: 'progress',
      step: 'send-rsvps',
      status: 'in_progress',
      message: rsvpEmails.length
        ? 'Sending RSVP emails.'
        : 'No RSVP guests were added, skipping invitation emails.',
    });

    console.log('Step 3/5: Sending RSVP emails');
    const webhooks = rsvpEmails.map((_) => createWebhook());

    await Promise.all(
      rsvpEmails.map((friend, i) =>
        requestRsvp(friend, webhooks[i].url, image, text)
      )
    );

    console.log('Step 3/5. RSVP emails sent');

    await writeProgressEvent({
      type: 'progress',
      step: 'send-rsvps',
      status: 'completed',
      message: rsvpEmails.length
        ? 'RSVP emails sent.'
        : 'Skipped RSVP emails because no guests were added.',
    });

    let rsvpReplies: Array<{ email: string; reply: string }> = [];

    if (rsvpEmails.length === 0) {
      await writeProgressEvent({
        type: 'progress',
        step: 'collect-rsvps',
        status: 'completed',
        message: 'No RSVPs are needed for this birthday card.',
      });
    } else {
      await writeProgressEvent({
        type: 'progress',
        step: 'collect-rsvps',
        status: 'in_progress',
        message: 'Waiting for RSVP responses.',
      });

      rsvpReplies = await Promise.all(
        webhooks.map(async (webhook) => {
          const request = await webhook;
          const url = new URL(request.url);

          return {
            email: url.searchParams.get('email') || 'unknown',
            reply: url.searchParams.get('reply') || 'no-response',
          };
        })
      );

      console.log('Step 3/5 complete. All RSVPs Received');

      await writeProgressEvent({
        type: 'progress',
        step: 'collect-rsvps',
        status: 'completed',
        message: 'All RSVP responses have been received.',
      });
    }

    await writeProgressEvent({
      type: 'progress',
      step: 'wait-for-birthday',
      status: 'in_progress',
      message: birthday
        ? `Waiting until ${birthday.toLocaleDateString()}.`
        : 'Waiting until the selected birthday.',
    });

    console.log('Step 4/5: Waiting until event date is reached');
    await sleep(birthday!);
    console.log('Step 4/5 complete. Event date reached');

    await writeProgressEvent({
      type: 'progress',
      step: 'wait-for-birthday',
      status: 'completed',
      message: 'Birthday reached. Sending the postcard now.',
    });

    console.log('Step 5/5: Sending birthday card to recipient');
    await sendRecipientEmail({
      recipientEmail,
      cardImage: image,
      cardText: text,
      rsvpReplies,
    });
    console.log('Step 5/5 complete. Birthday card sent to recipient');

    return {
      image,
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('Error:', message);

    try {
      await writeProgressEvent({
        type: 'error',
        message,
      });
    } catch (streamError) {
      console.error('Failed to stream workflow error', streamError);
    }

    throw error;
  } finally {
    try {
      await closeProgressStream();
    } catch (error) {
      console.error('Failed to close progress stream', error);
    }
  }
};
