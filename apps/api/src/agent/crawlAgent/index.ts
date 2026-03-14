import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import { CRAWL_AGENT_MAX_ROUNDS, type CrawlAgentJobData } from '@findthem/shared';
import { CRAWL_AGENT_SYSTEM_PROMPT } from './systemPrompt.js';
import { CRAWL_TOOL_DEFINITIONS } from './toolDefinitions.js';
import { TOOL_HANDLERS } from './tools/index.js';

const log = createLogger('crawlAgent');

const CLAUDE_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 4096;

interface CrawlAgentRunResult {
  summary: string;
  rounds: number;
}

export class CrawlAgentService {
  async run(data: CrawlAgentJobData): Promise<CrawlAgentRunResult> {
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    const sourcesHint =
      data.sources && data.sources.length > 0
        ? `이번 실행에서 수집할 소스: ${data.sources.join(', ')}`
        : '모든 소스(safe182-amber, safe182, animal-api)에서 수집한다.';

    const initialMessage = `데이터 수집을 시작한다. ${sourcesHint} triggeredBy=${data.triggeredBy ?? 'manual'}`;

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: initialMessage },
    ];

    let rounds = 0;
    let lastResponse!: Anthropic.Messages.Message;

    while (rounds < CRAWL_AGENT_MAX_ROUNDS) {
      let response: Anthropic.Messages.Message;

      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), CLAUDE_TIMEOUT_MS);

        try {
          response = await anthropic.messages.create(
            {
              model: config.claudeModel,
              max_tokens: MAX_TOKENS,
              system: CRAWL_AGENT_SYSTEM_PROMPT,
              tools: CRAWL_TOOL_DEFINITIONS,
              messages,
            },
            { signal: abort.signal },
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        log.error({ err, rounds }, 'crawlAgent: Claude API call failed');
        return { summary: 'Claude API 호출 실패로 수집 중단', rounds };
      }

      lastResponse = response;

      if (response.stop_reason !== 'tool_use') {
        break;
      }

      // assistant 응답 히스토리 추가
      messages.push({ role: 'assistant', content: response.content });

      // tool_use 블록 처리
      const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const handler = TOOL_HANDLERS[block.name];
        let result: unknown;

        try {
          result = handler
            ? await handler(block.input)
            : { error: `Unknown tool: ${block.name}` };
        } catch (err) {
          log.error({ err, tool: block.name }, 'crawlAgent: tool handler error');
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        log.info({ tool: block.name }, 'crawlAgent: tool executed');

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResultBlocks });
      rounds++;
    }

    // 최종 텍스트 응답 추출
    const summary = lastResponse.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || '수집 완료 (요약 없음)';

    log.info({ rounds, summary }, 'crawlAgent: run complete');

    return { summary, rounds };
  }
}
