import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { documentQueue } from '../queues/document.queue';
import { deadLetterQueue } from '../queues/dead-letter.queue';

// Queue dashboard: waiting, active, completed and failed jobs, with manual retry.
export const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(documentQueue), new BullMQAdapter(deadLetterQueue)],
  serverAdapter: bullBoardAdapter,
});
