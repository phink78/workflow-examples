import { createAgentUIStreamResponse, type UIMessage } from 'ai';
import { flightBookingAgent } from '@/workflows/chat';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const sessionId = crypto.randomUUID();
  const agent = await flightBookingAgent(messages);

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    headers: {
      'x-session-id': sessionId,
    },
  });
}
