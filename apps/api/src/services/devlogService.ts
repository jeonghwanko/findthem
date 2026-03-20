import { marked } from 'marked';
import { askClaude } from '../ai/aiClient.js';
import { createLogger } from '../logger.js';
import type { DiffResult, CommitSummary } from './gitDiffService.js';

const log = createLogger('devlogService');

export type { DiffResult };

export interface DevlogInput {
  context: string;
  diffResult: DiffResult;
  locale?: 'ko' | 'en';
}

export interface DevlogOutput {
  title: string;
  markdown: string;
  html: string;
  excerpt: string;
}

function buildSystemPrompt(locale: 'ko' | 'en'): string {
  if (locale === 'en') {
    return `You are the author of a tech blog run by a senior developer.
Write a development blog post based on a git diff and the developer's work intention.

Rules:
- Write in Markdown format (including # title)
- Audience: developers
- Structure: Background/Purpose → Implementation → Key code explanation → Problems encountered and solutions → Conclusion and next steps
- Wrap key code in \`\`\`language blocks
- Keep it concise (1500~3000 characters)
- The first line must be in "# Title" format`;
  }

  return `너는 시니어 개발자가 운영하는 기술 블로그의 작성자야.
git diff와 개발자의 작업 의도를 바탕으로 개발 블로그 포스트를 작성해.

규칙:
- 마크다운 형식으로 작성 (# 제목 포함)
- 독자: 개발자
- 구성: 배경/목적 → 구현 내용 → 핵심 코드 설명 → 마주친 문제와 해결 → 결론 및 다음 단계
- 핵심 코드는 \`\`\`언어 블록으로 감싸기
- 너무 길지 않게 (1500~3000자 수준)
- 첫 번째 줄은 반드시 "# 제목" 형식`;
}

function buildUserMessage(context: string, diffResult: DiffResult, locale: 'ko' | 'en'): string {
  const commitLines = diffResult.commitsSummary
    .map((c: CommitSummary) => `- ${c.sha} ${c.date} ${c.message}`)
    .join('\n');

  if (locale === 'en') {
    return `## Work Intention
${context}

## Recent Commits
${commitLines || '(none)'}

## Change Statistics
${diffResult.diffStats || '(none)'}

## Diff
${diffResult.diffContent || '(none)'}`;
  }

  return `## 작업 의도
${context}

## 최근 커밋
${commitLines || '(없음)'}

## 변경 통계
${diffResult.diffStats || '(없음)'}

## Diff
${diffResult.diffContent || '(없음)'}`;
}

function extractTitle(markdown: string): string {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  return '개발 블로그';
}

function extractExcerpt(markdown: string): string {
  // # 제목 줄 제거 후 첫 번째 단락 추출
  const withoutTitle = markdown.replace(/^#\s+.+(\n|$)/, '').trimStart();
  const firstParagraph = withoutTitle.split(/\n\n/)[0] ?? '';
  // 마크다운 기호 제거 (간단 처리)
  const plain = firstParagraph
    .replace(/[#*`_~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, 200);
}

export async function generateDevlogArticle(input: DevlogInput): Promise<DevlogOutput> {
  const locale = input.locale ?? 'ko';

  log.info({ locale, contextLength: input.context.length }, '데브로그 아티클 생성 시작');

  const systemPrompt = buildSystemPrompt(locale);
  const userMessage = buildUserMessage(input.context, input.diffResult, locale);

  const markdown = await askClaude(systemPrompt, userMessage, { maxTokens: 8192, agentId: 'devlog' });

  const title = extractTitle(markdown);
  const excerpt = extractExcerpt(markdown);
  const html = await marked.parse(markdown);

  log.info({ title }, '데브로그 아티클 생성 완료');

  return { title, markdown, html, excerpt };
}

// ── Twitter 공유 ──

import { TwitterAdapter } from '../platforms/twitter.js';

const twitterAdapter = new TwitterAdapter();

/** Twitter 280자 제한을 맞춰 데브로그 트윗 문구 생성 */
function buildDevlogTweet(title: string, excerpt: string, url: string): string {
  const URL_LENGTH = 23;
  const SUFFIX = '\n\n#FindThem #데브로그';
  const maxTextLen = 280 - URL_LENGTH - SUFFIX.length - 3; // 3 = "\n\n" + margin
  let text = `📝 ${title}`;
  if (excerpt && text.length + excerpt.length + 3 <= maxTextLen) {
    text += `\n\n${excerpt}`;
  }
  if (text.length > maxTextLen) {
    text = text.slice(0, maxTextLen - 1) + '…';
  }
  return `${text}\n\n${url}${SUFFIX}`;
}

export interface TweetResult {
  tweetId: string | null;
  tweetUrl: string | null;
  text: string;
}

export async function shareDevlogToTwitter(
  title: string,
  excerpt: string,
  url: string,
): Promise<TweetResult> {
  const tweetText = buildDevlogTweet(title, excerpt, url);
  const result = await twitterAdapter.post(tweetText, []);
  return {
    tweetId: result.postId,
    tweetUrl: result.postUrl ?? null,
    text: tweetText,
  };
}
