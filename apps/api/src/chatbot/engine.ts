import { askClaude } from '../ai/claudeClient.js';
import { prisma } from '../db/client.js';
import { imageQueue } from '../jobs/queues.js';
import type {
  ConversationStep,
  ConversationState,
  CollectedInfo,
  BotResponse,
  ChatPlatform,
} from '@findthem/shared';
import {
  STEP_MESSAGES,
  STEP_QUICK_REPLIES,
} from '@findthem/shared';
import {
  parseSubjectType,
  parseTimeExpression,
  buildSightingSummary,
} from '@findthem/shared';

// ── 엔진 ──

export class ChatbotEngine {
  /** 새 세션 시작 */
  async startSession(
    platform: ChatPlatform,
    userId?: string,
    platformUserId?: string,
    reportId?: string,
  ): Promise<{ sessionId: string; response: BotResponse }> {
    const session = await prisma.chatSession.create({
      data: {
        platform,
        userId,
        platformUserId,
        reportId,
        state: { currentStep: 'GREETING' } as object,
        context: (reportId ? { reportId } : {}) as object,
        status: 'ACTIVE',
      },
    });

    const response: BotResponse = {
      text: STEP_MESSAGES.GREETING,
      quickReplies: STEP_QUICK_REPLIES.GREETING,
    };

    await this.saveMessage(session.id, 'assistant', response.text);

    return { sessionId: session.id, response };
  }

  /** 메시지 처리 */
  async processMessage(
    sessionId: string,
    userMessage: string,
    photoUrl?: string,
  ): Promise<BotResponse> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });

    if (!session || session.status !== 'ACTIVE') {
      return { text: '세션이 만료되었습니다. 새로 시작해주세요.' };
    }

    const state = session.state as unknown as ConversationState;
    const context = session.context as unknown as CollectedInfo;

    // 사용자 메시지 저장
    await this.saveMessage(sessionId, 'user', userMessage, photoUrl ? { photoUrl } : undefined);

    // 단계별 처리
    const response = await this.processStep(
      sessionId,
      state,
      context,
      userMessage,
      photoUrl,
    );

    // 봇 응답 저장
    await this.saveMessage(sessionId, 'assistant', response.text);

    return response;
  }

  private async processStep(
    sessionId: string,
    state: ConversationState,
    context: CollectedInfo,
    userMessage: string,
    photoUrl?: string,
  ): Promise<BotResponse> {
    const step = state.currentStep;

    switch (step) {
      case 'GREETING':
      case 'SUBJECT_TYPE': {
        const type = parseSubjectType(userMessage);
        if (!type) {
          return {
            text: '사람, 강아지, 고양이 중 선택해주세요.',
            quickReplies: ['사람', '강아지', '고양이'],
          };
        }
        context.subjectType = type;
        await this.updateSession(sessionId, 'PHOTO', context);
        return {
          text: STEP_MESSAGES.PHOTO,
          quickReplies: STEP_QUICK_REPLIES.PHOTO,
        };
      }

      case 'PHOTO': {
        if (photoUrl) {
          context.photoUrls = [...(context.photoUrls || []), photoUrl];
          await this.updateSession(sessionId, 'DESCRIPTION', context);
          return { text: '사진이 등록되었습니다!\n' + STEP_MESSAGES.DESCRIPTION };
        }
        if (userMessage.includes('없') || userMessage.includes('스킵')) {
          await this.updateSession(sessionId, 'DESCRIPTION', context);
          return { text: STEP_MESSAGES.DESCRIPTION };
        }
        return {
          text: '사진을 보내주시거나 "없음"을 입력해주세요.',
          quickReplies: ['없음'],
        };
      }

      case 'DESCRIPTION': {
        if (userMessage.length < 3) {
          return { text: '좀 더 자세히 설명해주세요. (색상, 크기, 특징 등)' };
        }
        // Claude로 설명 보강
        const enhanced = await this.enhanceDescription(userMessage, context.subjectType || 'DOG');
        context.description = enhanced;
        await this.updateSession(sessionId, 'LOCATION', context);
        return { text: STEP_MESSAGES.LOCATION };
      }

      case 'LOCATION': {
        if (userMessage.length < 3) {
          return { text: '목격 장소를 좀 더 구체적으로 알려주세요.' };
        }
        context.address = userMessage;
        await this.updateSession(sessionId, 'TIME', context);
        return { text: STEP_MESSAGES.TIME };
      }

      case 'TIME': {
        const parsed = parseTimeExpression(userMessage);
        context.sightedAt = parsed;
        await this.updateSession(sessionId, 'CONTACT', context);
        return {
          text: STEP_MESSAGES.CONTACT,
          quickReplies: STEP_QUICK_REPLIES.CONTACT,
        };
      }

      case 'CONTACT': {
        if (!userMessage.includes('건너') && !userMessage.includes('스킵') && !userMessage.includes('없')) {
          // 전화번호 또는 이름 추출
          const phoneMatch = userMessage.match(/01[016789]\d{7,8}/);
          if (phoneMatch) {
            context.tipsterPhone = phoneMatch[0];
            context.tipsterName = userMessage.replace(phoneMatch[0], '').trim() || undefined;
          } else {
            context.tipsterName = userMessage;
          }
        }
        await this.updateSession(sessionId, 'CONFIRM', context);

        const summary = buildSightingSummary(context);
        return {
          text: `제보 내용을 확인해주세요:\n\n${summary}\n\n맞으면 "확인", 수정하려면 "수정"을 입력해주세요.`,
          quickReplies: ['확인', '수정'],
        };
      }

      case 'CONFIRM': {
        if (userMessage.includes('확인') || userMessage.includes('맞') || userMessage === '네') {
          // 제보 생성
          await this.createSighting(sessionId, context);
          await this.updateSession(sessionId, 'SUBMITTED', context);

          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { status: 'COMPLETED' },
          });

          return {
            text: STEP_MESSAGES.SUBMITTED,
            completed: true,
          };
        }
        // 수정 요청 → 처음부터
        await this.updateSession(sessionId, 'SUBJECT_TYPE', {});
        return {
          text: '처음부터 다시 시작합니다.\n' + STEP_MESSAGES.SUBJECT_TYPE,
          quickReplies: ['사람', '강아지', '고양이'],
        };
      }

      default:
        return { text: '새로운 제보를 시작하시려면 "시작"을 입력해주세요.' };
    }
  }

  // ── 헬퍼 ──

  private async enhanceDescription(
    rawDesc: string,
    subjectType: string,
  ): Promise<string> {
    try {
      const result = await askClaude(
        '사용자가 실종 동물/사람 목격 설명을 입력했습니다. 원래 설명을 유지하면서, 빠진 정보가 있으면 "불명"으로 보충하여 구조화된 설명으로 정리하세요. 한국어로 2~3문장으로 요약하세요. 원본 내용을 변형하지 마세요.',
        `대상 유형: ${subjectType}\n원본 설명: ${rawDesc}`,
        { maxTokens: 256 },
      );
      return result;
    } catch {
      return rawDesc;
    }
  }

  private async createSighting(
    sessionId: string,
    context: CollectedInfo,
  ): Promise<string> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    const sighting = await prisma.sighting.create({
      data: {
        reportId: context.reportId || session?.reportId || undefined,
        userId: session?.userId || undefined,
        source: session?.platform === 'KAKAO' ? 'KAKAO_CHATBOT' : 'WEB',
        description: context.description || '',
        sightedAt: context.sightedAt ? new Date(context.sightedAt) : new Date(),
        address: context.address || '',
        tipsterName: context.tipsterName,
        tipsterPhone: context.tipsterPhone,
      },
    });

    // 챗봇에서 받은 사진이 있으면 연결
    if (context.photoUrls?.length) {
      for (const url of context.photoUrls) {
        await prisma.sightingPhoto.create({
          data: { sightingId: sighting.id, photoUrl: url },
        });
      }

      // 이미지 분석 + 매칭 큐
      await imageQueue.add(
        'process-sighting-photos',
        { type: 'sighting', sightingId: sighting.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
    }

    return sighting.id;
  }

  private async updateSession(
    sessionId: string,
    nextStep: ConversationStep,
    context: CollectedInfo,
  ): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state: { currentStep: nextStep } as object,
        context: context as object,
      },
    });
  }

  private async saveMessage(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.chatMessage.create({
      data: {
        sessionId,
        role,
        content,
        metadata: metadata ? (metadata as object) : undefined,
      },
    });
  }
}

// 싱글턴
export const chatbotEngine = new ChatbotEngine();
