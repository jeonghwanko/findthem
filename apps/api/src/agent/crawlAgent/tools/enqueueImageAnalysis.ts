import { imageQueue } from '../../../jobs/queues.js';

interface EnqueueImageAnalysisInput {
  reportId: string;
}

interface EnqueueImageAnalysisResult {
  enqueued: boolean;
  jobId: string | undefined;
}

export async function enqueueImageAnalysis(input: unknown): Promise<EnqueueImageAnalysisResult> {
  const { reportId } = input as EnqueueImageAnalysisInput;

  const job = await imageQueue.add(
    'process-report-photos',
    { type: 'report', reportId },
    { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  );

  return { enqueued: true, jobId: job.id };
}
