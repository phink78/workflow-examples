import { getWritable } from 'workflow';
import {
  serializeProgressEvent,
  type BirthdayCardProgressEvent,
} from '@/lib/progress';

export const writeProgressEvent = async (event: BirthdayCardProgressEvent) => {
  'use step';

  const writable = getWritable<string>();
  const writer = writable.getWriter();

  await writer.write(serializeProgressEvent(event));
  writer.releaseLock();
};

export const closeProgressStream = async () => {
  'use step';

  await getWritable<string>().close();
};
