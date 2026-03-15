import { simpleGit } from 'simple-git';
import type { DefaultLogFields, ListLogLine } from 'simple-git';
import { createLogger } from '../logger.js';

const log = createLogger('gitDiffService');

const DIFF_SIZE_LIMIT = 50 * 1024; // 50KB
const DIFF_TRUNCATE_SUFFIX = '\n[... diff truncated ...]';

const DEFAULT_EXCLUDE_PATTERNS = ['.env', '*.key', '*.pem', 'package-lock.json'];

export interface CommitSummary {
  sha: string;
  message: string;
  date: string;
}

export interface DiffResult {
  commitsSummary: CommitSummary[];
  diffStats: string;
  diffContent: string;
}

function buildExcludeArgs(patterns: string[]): string[] {
  return patterns.flatMap((p) => [`:(exclude)${p}`]);
}

export async function getRecentDiff(
  repoPath: string,
  commitCount = 5,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS,
): Promise<DiffResult> {
  const git = simpleGit(repoPath);

  log.info({ repoPath, commitCount }, 'git diff 추출 시작');

  // 최근 N개 커밋 로그
  const logResult = await git.log({ maxCount: commitCount });
  const commitsSummary: CommitSummary[] = logResult.all.map(
    (c: DefaultLogFields & ListLogLine) => ({
      sha: c.hash.slice(0, 7),
      message: c.message,
      date: c.date,
    }),
  );

  if (commitsSummary.length === 0) {
    log.warn({ repoPath }, '커밋이 없습니다.');
    return { commitsSummary: [], diffStats: '', diffContent: '' };
  }

  // 기준 커밋: 가장 오래된 커밋의 부모
  const oldestSha = logResult.all[logResult.all.length - 1]?.hash ?? '';
  const baseRef = `${oldestSha}^`;
  const headRef = 'HEAD';

  const excludeArgs = buildExcludeArgs(excludePatterns);

  // --stat 요약
  let diffStats = '';
  try {
    diffStats = await git.raw([
      'diff',
      '--stat',
      baseRef,
      headRef,
      '--',
      ...excludeArgs,
    ]);
  } catch (err) {
    // 첫 번째 커밋인 경우 부모가 없어 실패할 수 있음
    log.warn({ err }, '--stat diff 실패, HEAD만 사용');
    diffStats = await git.raw(['diff', '--stat', 'HEAD~1', 'HEAD', '--', ...excludeArgs]).catch(() => '');
  }

  // 실제 diff 내용
  let diffContent = '';
  try {
    diffContent = await git.raw([
      'diff',
      baseRef,
      headRef,
      '--',
      ...excludeArgs,
    ]);
  } catch {
    log.warn('full diff 실패, HEAD~1..HEAD로 재시도');
    diffContent = await git.raw(['diff', 'HEAD~1', 'HEAD', '--', ...excludeArgs]).catch(() => '');
  }

  // 50KB 초과 시 잘라냄
  if (Buffer.byteLength(diffContent, 'utf8') > DIFF_SIZE_LIMIT) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(diffContent);
    const truncated = new TextDecoder().decode(bytes.slice(0, DIFF_SIZE_LIMIT));
    diffContent = truncated + DIFF_TRUNCATE_SUFFIX;
    log.info('diff 내용이 50KB를 초과하여 잘라냈습니다.');
  }

  log.info({ commitCount: commitsSummary.length }, 'git diff 추출 완료');

  return { commitsSummary, diffStats, diffContent };
}
