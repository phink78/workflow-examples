import { defineHook } from 'workflow';
import { z } from 'zod';

export const webhookHook = defineHook({
  schema: z.object({
    method: z.string(),
    body: z.any(),
  }),
});
