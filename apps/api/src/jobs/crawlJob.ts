import { QUEUE_NAMES } from '@findthem/shared';
import type { Prisma } from '@prisma/client';
import { createWorker, crawlSchedulerQueue, crawlQueue, crawlAgentQueue, imageQueue } from './queues.js';
import type { CrawlDispatchJobData, CrawlSourceJobData } from './queues.js';
import { fetchers, getFetcher } from './crawl/fetcherRegistry.js';
import type { ExternalReport } from './crawl/types.js';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';

const log = createLogger('crawl');

const CRAWL_CRON = '0 */6 * * *';

// ── Dispatcher Worker ──
// crawl-dispatch job: 등록된 모든 Fetcher를 소스별 job으로 분산

function startCrawlSchedulerWorker() {
  return createWorker<CrawlDispatchJobData>(
    QUEUE_NAMES.CRAWL_SCHEDULER,
    async (job) => {
      const targetSources = job.data.sources ?? fetchers.map((f) => f.source);
      log.info({ sources: targetSources }, 'Dispatching crawl jobs');

      await Promise.all(
        targetSources.map((source) =>
          crawlQueue.add(
            'crawl-source',
            { source },
            // RACE-12: jobId로 동일 소스의 중복 crawl job 방지
            { attempts: 2, backoff: { type: 'fixed', delay: 60_000 }, jobId: `crawl-${source}` },
          ),
        ),
      );

      await crawlAgentQueue.add(
        'crawl-agent-run',
        { triggeredBy: 'scheduler' },
        { attempts: 1 },
      );
    },
    { concurrency: 1 },
  );
}

// ── Source Worker ──
// crawl-source job: 소스 fetch → 일괄 중복 체크 → Report 생성 (트랜잭션)

async function saveNewReport(item: ExternalReport, source: string): Promise<boolean> {
  try {
    const report = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.report.create({
        data: {
          userId: null,
          subjectType: item.subjectType,
          status: 'ACTIVE',
          name: item.name,
          features: item.features,
          lastSeenAt: item.lastSeenAt,
          lastSeenAddress: item.lastSeenAddress,
          contactPhone: item.contactPhone ?? '정보 없음',
          contactName: item.contactName ?? source,
          gender: item.gender,
          age: item.age,
          color: item.color,
          weight: item.weight,
          species: item.species,
          externalId: item.externalId,
          externalSource: source,
        },
      });

      if (item.photoUrl) {
        await tx.reportPhoto.create({
          data: {
            reportId: created.id,
            photoUrl: item.photoUrl,
            isPrimary: true,
          },
        });
      }

      return created;
    });

    // 트랜잭션 커밋 후 AI 분석 큐 등록
    // RACE-11: jobId로 동일 report의 중복 image job 방지
    if (item.photoUrl) {
      await imageQueue.add(
        'process-report-photos',
        { type: 'report', reportId: report.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `image-report-${report.id}` },
      );
    }

    return true;
  } catch (err) {
    log.warn({ externalId: item.externalId, source, err }, 'Failed to save report, skipping');
    return false;
  }
}

function startCrawlSourceWorker() {
  return createWorker<CrawlSourceJobData>(
    QUEUE_NAMES.CRAWL,
    async (job) => {
      const { source } = job.data;
      const fetcher = getFetcher(source);
      if (!fetcher) {
        log.warn({ source }, 'Unknown crawl source, skipping');
        return;
      }

      log.info({ source }, 'Starting crawl');
      const items = await fetcher.fetch();
      log.info({ source, count: items.length }, 'Fetched items');

      if (items.length === 0) return;

      // 일괄 중복 체크 (N+1 방지)
      const existingIds = await prisma.report.findMany({
        where: {
          externalSource: source,
          externalId: { in: items.map((i) => i.externalId) },
        },
        select: { externalId: true },
      });
      const existingSet = new Set(existingIds.map((r) => r.externalId));

      const newItems = items.filter((i) => !existingSet.has(i.externalId));
      log.info({ source, new: newItems.length, skipped: items.length - newItems.length }, 'Dedup result');

      let created = 0;
      let failed = 0;

      for (const item of newItems) {
        const ok = await saveNewReport(item, source);
        if (ok) created++;
        else failed++;
      }

      log.info({ source, created, failed, skipped: items.length - newItems.length }, 'Crawl complete');
    },
    { concurrency: 2 },
  );
}

export function startCrawlWorker() {
  startCrawlSchedulerWorker();
  startCrawlSourceWorker();
  log.info('Crawl workers started');
}

// 서버 시작 시 cron 스케줄 등록
// 기존 동일 이름 job을 제거 후 재등록 (cron 변경 시 중복 실행 방지)
export async function scheduleCrawlJob() {
  const existingJobs = await crawlSchedulerQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === 'crawl-dispatch') {
      await crawlSchedulerQueue.removeRepeatableByKey(job.key);
    }
  }

  await crawlSchedulerQueue.add(
    'crawl-dispatch',
    {},
    { repeat: { pattern: CRAWL_CRON } },
  );
  log.info({ cron: CRAWL_CRON }, 'Crawl cron scheduled');
}
