import { ToolLoopAgent, type UIMessage } from 'ai';

import { FLIGHT_ASSISTANT_PROMPT, flightBookingTools } from './steps/tools';

export async function flightBookingAgent(initialMessages: UIMessage[]) {
  const agent = new ToolLoopAgent({
    model: 'bedrock/claude-haiku-4-5-20251001-v1',
    instructions: FLIGHT_ASSISTANT_PROMPT,
    tools: { ...flightBookingTools },
  });
  return agent;
}
