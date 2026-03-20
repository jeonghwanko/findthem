import { QUEUE_NAMES } from '@findthem/shared';
import type { ExternalQuestion } from '@findthem/shared';
import { Prisma } from '@prisma/client';
import { createWorker, qaCrawlQueue, type QaCrawlJobData } from './queues.js';
import { qaFetchers } from './crawl/qa/qaFetcherRegistry.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { answerQuestionWithAgents } from '../services/qaAgentAnswerService.js';
import { dispatchWebhookToAll } from '../services/webhookDispatcher.js';
import type { WebhookPayload } from '../services/webhookDispatcher.js';

const log = createLogger('qaCrawlJob');

const QA_CRAWL_CRON = '0 */4 * * *'; // 4시간마다
const MAX_WEBHOOK_CONTENT = 500;

/**
 * 크롤된 질문을 CommunityPost로 저장.
 * deduplicationKey 인덱스 + P2002 catch로 중복 방지.
 */
export async function saveQuestion(q: ExternalQuestion): Promise<string | null> {
  const dedupKey = `qa_${q.sourceName}_${q.externalId}`;

  // 빠른 사전 체크 (인덱스 활용)
  const existing = await prisma.communityPost.findFirst({
    where: { deduplicationKey: dedupKey },
    select: { id: true },
  });
  if (existing) return null;

  try {
    const post = await prisma.communityPost.create({
      data: {
        title: q.title.slice(0, 200),
        content: q.content.slice(0, 10000),
        sourceUrl: q.sourceUrl,
        deduplicationKey: dedupKey,
      },
    });
    return post.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      log.info({ externalId: q.externalId }, 'Q&A post already exists, skipping');
      return null;
    }
    log.error({ err, externalId: q.externalId }, 'Failed to save Q&A post');
    return null;
  }
}

// ── Worker ──

function startQaCrawlWorker() {
  return createWorker<QaCrawlJobData>(
    QUEUE_NAMES.QA_CRAWL,
    async (job) => {
      const targetSources = job.data.sources ?? qaFetchers.map((f) => f.source);
      log.info({ sources: targetSources, triggeredBy: job.data.triggeredBy }, 'Starting Q&A crawl');

      let totalSaved = 0;

      for (const fetcher of qaFetchers) {
        if (!targetSources.includes(fetcher.source)) continue;

        let questions: ExternalQuestion[];
        try {
          questions = await fetcher.fetch();
        } catch (err) {
          log.error({ err, source: fetcher.source }, 'Q&A fetcher error');
          continue;
        }

        log.info({ source: fetcher.source, fetched: questions.length }, 'Q&A fetcher returned');

        // 일괄 중복 체크 (N+1 방지)
        const dedupKeys = questions.map((q) => `qa_${q.sourceName}_${q.externalId}`);
        const existingPosts = await prisma.communityPost.findMany({
          where: { deduplicationKey: { in: dedupKeys } },
          select: { deduplicationKey: true },
        });
        const existingSet = new Set(existingPosts.map((p) => p.deduplicationKey));
        const newQuestions = questions.filter(
          (q) => !existingSet.has(`qa_${q.sourceName}_${q.externalId}`),
        );

        for (const q of newQuestions) {
          const postId = await saveQuestion(q);
          if (!postId) continue;

          totalSaved++;
          log.info({ postId, title: q.title.slice(0, 50), source: q.sourceName }, 'New Q&A post created');

          // 내부 에이전트 자동 답변 (fire-and-forget)
          void answerQuestionWithAgents(postId, q.title, q.content)
            .catch((err) => log.warn({ err, postId }, 'Agent auto-answer failed'));

          // 외부 에이전트 webhook 알림 (fire-and-forget)
          const payload: WebhookPayload = {
            event: 'new_question',
            postId,
            postTitle: q.title,
            postContent: q.content.slice(0, MAX_WEBHOOK_CONTENT),
            sourceUrl: q.sourceUrl,
            timestamp: new Date().toISOString(),
          };
          void dispatchWebhookToAll(payload)
            .catch((err) => log.warn({ err, postId }, 'Webhook dispatch failed'));
        }
      }

      log.info({ totalSaved, sources: targetSources }, 'Q&A crawl job completed');
    },
    { concurrency: 1 },
  );
}

// ── Cron 등록 + Worker 시작 ──

export function initQaCrawlJob() {
  // 반복 스케줄 등록 (이미 있으면 무시)
  void qaCrawlQueue.upsertJobScheduler(
    'qa-crawl-scheduler',
    { pattern: QA_CRAWL_CRON },
    {
      name: 'qa-crawl-run',
      data: { triggeredBy: 'scheduler' },
      opts: { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
    },
  ).catch((err) => log.error({ err }, 'Failed to register Q&A crawl cron'));

  return startQaCrawlWorker();
}
