import type { Prisma } from '@prisma/client';
import { askClaude } from '../ai/claudeClient.js';
import { prisma } from '../db/client.js';
import { imageQueue } from '../jobs/queues.js';
import {
  STEP_MESSAGES,
  STEP_QUICK_REPLIES,
  DEFAULT_LOCALE,
  parseSubjectType,
  parseTimeExpression,
  buildSightingSummary,
  type ConversationStep,
  type ConversationState,
  type CollectedInfo,
  type BotResponse,
  type ChatPlatform,
  type Locale,
  type SubjectType,
} from '@findthem/shared';

// ── 다국어 키워드 맵 ──

const CHATBOT_KEYWORDS: Record<Locale, {
  confirm: string[];
  skip: string[];
  subjectType: Record<string, SubjectType>;
}> = {
  ko: {
    confirm: ['확인', '맞', '네'],
    skip: ['없', '스킵', '건너'],
    subjectType: { '사람': 'PERSON', '미아': 'PERSON', '강아지': 'DOG', '개': 'DOG', '고양이': 'CAT' },
  },
  en: {
    confirm: ['yes', 'confirm', 'ok', 'correct'],
    skip: ['none', 'skip', 'no'],
    subjectType: { 'person': 'PERSON', 'human': 'PERSON', 'dog': 'DOG', 'puppy': 'DOG', 'cat': 'CAT', 'kitten': 'CAT' },
  },
  ja: {
    confirm: ['確認', 'はい', 'そうです'],
    skip: ['なし', 'スキップ', 'ない'],
    subjectType: { '人': 'PERSON', '犬': 'DOG', '猫': 'CAT' },
  },
  'zh-TW': {
    confirm: ['確認', '是', '對'],
    skip: ['沒有', '跳過', '無'],
    subjectType: { '人': 'PERSON', '狗': 'DOG', '貓': 'CAT' },
  },
};

// ── 엔진 하드코딩 메시지 다국어 맵 ──

const ENGINE_MESSAGES: Record<Locale, {
  sessionExpired: string;
  selectSubjectType: string;
  photoRegistered: string;
  sendPhotoOrNone: string;
  describeMore: string;
  locationMore: string;
  confirmPrompt: string;
  confirmActions: string;
  restartFromBeginning: string;
  startNewReport: string;
  photoAttach: string;
}> = {
  ko: {
    sessionExpired: '세션이 만료되었습니다. 새로 시작해주세요.',
    selectSubjectType: '사람, 강아지, 고양이 중 선택해주세요.',
    photoRegistered: '사진이 등록되었습니다!',
    sendPhotoOrNone: '사진을 보내주시거나 "없음"을 입력해주세요.',
    describeMore: '좀 더 자세히 설명해주세요. (색상, 크기, 특징 등)',
    locationMore: '목격 장소를 좀 더 구체적으로 알려주세요.',
    confirmPrompt: '제보 내용을 확인해주세요:',
    confirmActions: '맞으면 "확인", 수정하려면 "수정"을 입력해주세요.',
    restartFromBeginning: '처음부터 다시 시작합니다.',
    startNewReport: '새로운 제보를 시작하시려면 "시작"을 입력해주세요.',
    photoAttach: '사진 첨부',
  },
  en: {
    sessionExpired: 'Session expired. Please start again.',
    selectSubjectType: 'Please choose: Person, Dog, or Cat.',
    photoRegistered: 'Photo registered!',
    sendPhotoOrNone: 'Please send a photo or type "none".',
    describeMore: 'Please describe in more detail. (color, size, features, etc.)',
    locationMore: 'Please provide a more specific location.',
    confirmPrompt: 'Please confirm your report:',
    confirmActions: 'Type "confirm" to submit, or "edit" to start over.',
    restartFromBeginning: 'Starting over from the beginning.',
    startNewReport: 'Type "start" to begin a new report.',
    photoAttach: 'Photo attached',
  },
  ja: {
    sessionExpired: 'セッションが期限切れです。最初からやり直してください。',
    selectSubjectType: '人、犬、猫から選んでください。',
    photoRegistered: '写真が登録されました！',
    sendPhotoOrNone: '写真を送るか「なし」と入力してください。',
    describeMore: 'もう少し詳しく説明してください。（色、大きさ、特徴など）',
    locationMore: '目撃場所をもう少し具体的に教えてください。',
    confirmPrompt: '情報を確認してください：',
    confirmActions: '「確認」で送信、修正する場合は「修正」と入力してください。',
    restartFromBeginning: '最初からやり直します。',
    startNewReport: '「開始」と入力して新しい情報提供を始めてください。',
    photoAttach: '写真添付',
  },
  'zh-TW': {
    sessionExpired: '會話已過期，請重新開始。',
    selectSubjectType: '請選擇：人、狗或貓。',
    photoRegistered: '照片已登記！',
    sendPhotoOrNone: '請傳送照片或輸入「沒有」。',
    describeMore: '請更詳細地描述。（顏色、大小、特徵等）',
    locationMore: '請提供更具體的地點。',
    confirmPrompt: '請確認您的報告：',
    confirmActions: '輸入「確認」提交，或「修改」重新開始。',
    restartFromBeginning: '從頭開始。',
    startNewReport: '輸入「開始」以開始新的報告。',
    photoAttach: '照片附件',
  },
};

// ── enhanceDescription 프롬프트 다국어 맵 ──

const ENHANCE_DESCRIPTION_PROMPTS: Record<Locale, { system: string; userPrefix: string }> = {
  ko: {
    system: '사용자가 실종 동물/사람 목격 설명을 입력했습니다. 원래 설명을 유지하면서, 빠진 정보가 있으면 "불명"으로 보충하여 구조화된 설명으로 정리하세요. 한국어로 2~3문장으로 요약하세요. 원본 내용을 변형하지 마세요.',
    userPrefix: '대상 유형',
  },
  en: {
    system: 'The user has entered a sighting description for a missing animal or person. Maintain the original description while supplementing any missing information with "unknown" in a structured format. Summarize in English in 2-3 sentences. Do not distort the original content.',
    userPrefix: 'Subject type',
  },
  ja: {
    system: 'ユーザーが行方不明の動物・人物の目撃説明を入力しました。元の説明を維持しながら、不足している情報は「不明」で補い、構造化された説明にまとめてください。日本語で2〜3文で要約してください。元の内容を変えないでください。',
    userPrefix: '対象の種類',
  },
  'zh-TW': {
    system: '使用者輸入了關於失蹤動物/人物的目擊描述。請保留原始描述，並將缺少的資訊補充為「不明」，整理成結構化描述。請用繁體中文以2至3句話進行摘要。請勿修改原始內容。',
    userPrefix: '對象類型',
  },
};

// ── 엔진 ──

export class ChatbotEngine {
  /** 새 세션 시작 */
  async startSession(
    platform: ChatPlatform,
    userId?: string,
    platformUserId?: string,
    reportId?: string,
    locale: Locale = DEFAULT_LOCALE,
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
      text: STEP_MESSAGES[locale].GREETING,
      quickReplies: STEP_QUICK_REPLIES[locale]?.GREETING,
    };

    await this.saveMessage(session.id, 'assistant', response.text);

    return { sessionId: session.id, response };
  }

  /** 메시지 처리 */
  async processMessage(
    sessionId: string,
    userMessage: string,
    photoUrl?: string,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<BotResponse> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });

    if (!session || session.status !== 'ACTIVE') {
      return { text: ENGINE_MESSAGES[locale].sessionExpired };
    }

    // RACE-06: 낙관적 잠금용으로 현재 updatedAt 저장
    const sessionUpdatedAt = session.updatedAt;

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
      locale,
      sessionUpdatedAt,
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
    photoUrl: string | undefined,
    locale: Locale,
    sessionUpdatedAt?: Date,
  ): Promise<BotResponse> {
    const step = state.currentStep;
    const msgs = ENGINE_MESSAGES[locale];
    const keywords = CHATBOT_KEYWORDS[locale];
    const lower = userMessage.toLowerCase();

    switch (step) {
      case 'GREETING':
      case 'SUBJECT_TYPE': {
        const type = parseSubjectType(userMessage, locale);
        if (!type) {
          return {
            text: msgs.selectSubjectType,
            quickReplies: STEP_QUICK_REPLIES[locale]?.SUBJECT_TYPE,
          };
        }
        context.subjectType = type;
        await this.updateSession(sessionId, 'PHOTO', context, sessionUpdatedAt);
        return {
          text: STEP_MESSAGES[locale].PHOTO,
          quickReplies: STEP_QUICK_REPLIES[locale]?.PHOTO,
        };
      }

      case 'PHOTO': {
        if (photoUrl) {
          context.photoUrls = [...(context.photoUrls || []), photoUrl];
          await this.updateSession(sessionId, 'DESCRIPTION', context, sessionUpdatedAt);
          return { text: `${msgs.photoRegistered}\n${STEP_MESSAGES[locale].DESCRIPTION}` };
        }
        if (keywords.skip.some((kw) => lower.includes(kw))) {
          await this.updateSession(sessionId, 'DESCRIPTION', context, sessionUpdatedAt);
          return { text: STEP_MESSAGES[locale].DESCRIPTION };
        }
        return {
          text: msgs.sendPhotoOrNone,
          quickReplies: STEP_QUICK_REPLIES[locale]?.PHOTO,
        };
      }

      case 'DESCRIPTION': {
        if (userMessage.length < 3) {
          return { text: msgs.describeMore };
        }
        // Claude로 설명 보강
        const enhanced = await this.enhanceDescription(userMessage, context.subjectType || 'DOG', locale);
        context.description = enhanced;
        await this.updateSession(sessionId, 'LOCATION', context, sessionUpdatedAt);
        return { text: STEP_MESSAGES[locale].LOCATION };
      }

      case 'LOCATION': {
        if (userMessage.length < 3) {
          return { text: msgs.locationMore };
        }
        context.address = userMessage;
        await this.updateSession(sessionId, 'TIME', context, sessionUpdatedAt);
        return { text: STEP_MESSAGES[locale].TIME };
      }

      case 'TIME': {
        const parsed = parseTimeExpression(userMessage, locale);
        context.sightedAt = parsed;
        await this.updateSession(sessionId, 'CONTACT', context, sessionUpdatedAt);
        return {
          text: STEP_MESSAGES[locale].CONTACT,
          quickReplies: STEP_QUICK_REPLIES[locale]?.CONTACT,
        };
      }

      case 'CONTACT': {
        if (!keywords.skip.some((kw) => lower.includes(kw))) {
          // 전화번호 또는 이름 추출
          const phoneMatch = userMessage.match(/01[016789]\d{7,8}/);
          if (phoneMatch) {
            context.tipsterPhone = phoneMatch[0];
            context.tipsterName = userMessage.replace(phoneMatch[0], '').trim() || undefined;
          } else {
            context.tipsterName = userMessage;
          }
        }
        await this.updateSession(sessionId, 'CONFIRM', context, sessionUpdatedAt);

        const summary = buildSightingSummary(context, locale);
        return {
          text: `${msgs.confirmPrompt}\n\n${summary}\n\n${msgs.confirmActions}`,
          quickReplies: STEP_QUICK_REPLIES[locale]?.CONFIRM ?? keywords.confirm.slice(0, 2),
        };
      }

      case 'CONFIRM': {
        if (keywords.confirm.some((kw) => lower.includes(kw))) {
          // 제보 생성
          await this.createSighting(sessionId, context);
          await this.updateSession(sessionId, 'SUBMITTED', context, sessionUpdatedAt);

          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { status: 'COMPLETED' },
          });

          return {
            text: STEP_MESSAGES[locale].SUBMITTED,
            completed: true,
          };
        }
        // 수정 요청 → 처음부터
        await this.updateSession(sessionId, 'SUBJECT_TYPE', {}, sessionUpdatedAt);
        return {
          text: `${msgs.restartFromBeginning}\n${STEP_MESSAGES[locale].SUBJECT_TYPE}`,
          quickReplies: STEP_QUICK_REPLIES[locale]?.SUBJECT_TYPE,
        };
      }

      default:
        return { text: msgs.startNewReport };
    }
  }

  // ── 헬퍼 ──

  private async enhanceDescription(
    rawDesc: string,
    subjectType: string,
    locale: Locale,
  ): Promise<string> {
    const prompt = ENHANCE_DESCRIPTION_PROMPTS[locale];
    try {
      const result = await askClaude(
        prompt.system,
        `${prompt.userPrefix}: ${subjectType}\n${rawDesc}`,
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

    // 챗봇에서 받은 사진이 있으면 연결 — createMany로 일괄 삽입
    if (context.photoUrls?.length) {
      await prisma.sightingPhoto.createMany({
        data: context.photoUrls.map((url) => ({ sightingId: sighting.id, photoUrl: url })),
      });

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
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    // RACE-06: 낙관적 잠금 — updatedAt이 일치하는 경우에만 업데이트
    if (expectedUpdatedAt) {
      const result = await prisma.chatSession.updateMany({
        where: { id: sessionId, updatedAt: expectedUpdatedAt },
        data: {
          state: { currentStep: nextStep } as object,
          context: context as object,
        },
      });
      if (result.count === 0) {
        // 다른 요청이 먼저 세션을 변경함 — 현재 메시지 무시
        const log = (await import('../logger.js')).createLogger('chatbot-engine');
        log.warn({ sessionId }, 'Session optimistic lock conflict — skipping current message');
      }
      return;
    }
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
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

// 싱글턴
export const chatbotEngine = new ChatbotEngine();
