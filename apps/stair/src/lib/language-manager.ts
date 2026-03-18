/**
 * Translation data for supported languages
 */
const translations = {
  en: {
    // Game UI
    gameTitle: "Infinite Villain Stairs",
    gameOver: "GAME OVER",
    finalScore: "Final Score",
    score: "Score",
    health: "Health",

    // Buttons
    restart: "Restart",
    home: "Home",
    share: "Share",
    googlePlay: "Google Play",
    appStore: "App Store",

    // Mobile Controls
    turnButton: "A",
    moveButton: "S",
    attackButton: "D",

    // Title Scene
    startInstruction: "Press any key to start",

    // Game Reasons
    noNextStairAvailable: "No next stair available",
    wrongDirection: "Wrong direction!",
    enemyBlockingWay: "Enemy blocking the way",

    // Death Messages
    tooSlow: "You're too slow!",

    // Share text
    shareText: "I reached a score of {score} in Infinite Villain Stairs! Can you beat my score?",
    shareTitle: "Infinite Villain Stairs",

    // Error messages
    sharingNotSupported: "Sharing is not supported on your browser.",

    // Additional text
    teaserText1: "Climbed it alone?",
    teaserText2: "Time to step up, together!",

    // Another Text
    teaserText3: "Congrats! High Score!",
    teaserText4: "Here's a gift for you! \n Download and Play!",
  },
  ko: {
    // Game UI
    gameTitle: "Infinite Villain Stairs",
    gameOver: "게임 오버",
    finalScore: "최종 점수",
    score: "점수",
    health: "체력",

    // Buttons
    restart: "다시하기",
    home: "홈",
    share: "공유하기",
    googlePlay: "구글 플레이",
    appStore: "앱 스토어",

    // Mobile Controls
    turnButton: "A",
    moveButton: "S",
    attackButton: "D",

    // Title Scene
    startInstruction: "아무 키나 눌러서 시작하세요",

    // Game Reasons
    noNextStairAvailable: "다음 계단이 없습니다",
    wrongDirection: "잘못된 방향입니다!",
    enemyBlockingWay: "적이 길을 막고 있습니다",

    // Death Messages
    tooSlow: "너무 느려요!",

    // Share text
    shareText: "Infinite Villain Stairs에서 {score}점을 달성했습니다! 제 점수를 이길 수 있을까요?",
    shareTitle: "Infinite Villain Stairs",

    // Error messages
    sharingNotSupported: "이 브라우저에서는 공유 기능을 지원하지 않습니다.",

    // Additional text
    teaserText1: "혼자 오르셨나요?",
    teaserText2: "이젠 팀으로 정복하세요!",

    // Another Text
    teaserText3: "좀 하네요?!",
    teaserText4: "기념 선물 드립니다! \n 다운로드하고 플레이하세요!",
  },
} as const;

export type SupportedLanguage = "en" | "ko";
export type TranslationKey = keyof typeof translations.en;

/**
 * Language Manager for handling internationalization
 * Uses URL search parameters for language detection
 */
export class LanguageManager {
  private static instance: LanguageManager;
  private currentLanguage: SupportedLanguage;

  private constructor() {
    this.currentLanguage = this.detectLanguage();
  }

  public static getInstance(): LanguageManager {
    if (!LanguageManager.instance) {
      LanguageManager.instance = new LanguageManager();
    }
    return LanguageManager.instance;
  }

  /**
   * Detect language from URL parameters only
   */
  private detectLanguage(): SupportedLanguage {
    // Check URL search parameters
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get("lang");

    if (urlLang === "ko") {
      return "ko";
    }

    // Default to English for all other cases (including no lang parameter)
    return "en";
  }

  /**
   * Get current language
   */
  public getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Translate a key to current language
   */
  public t(key: TranslationKey, variables?: Record<string, string | number>): string {
    let text: string = translations[this.currentLanguage][key];

    // Replace variables in text (e.g., {score} -> actual score)
    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        text = text.replace(`{${varKey}}`, String(varValue));
      });
    }

    return text;
  }

  /**
   * Check if current language is Korean
   */
  public isKorean(): boolean {
    return this.currentLanguage === "ko";
  }

  /**
   * Check if current language is English
   */
  public isEnglish(): boolean {
    return this.currentLanguage === "en";
  }
}
