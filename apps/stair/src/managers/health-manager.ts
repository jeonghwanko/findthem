export type HealthDecayConfig = {
  baseDecayRate: number; // 기본 체력 감소량 (초당)
  maxDecayRate: number; // 최대 체력 감소량 (초당)
  stairMultiplier: number; // 계단당 증가 계수
  decayGrowthRate: number; // 성장률 (로그 기반)
  recoveryAmount: number; // 계단 올라갈 때 회복량
};

export type HealthSystemConfig = {
  maxHealth: number;
  startingHealth: number;
  decayConfig: HealthDecayConfig;
};

export class HealthManager {
  #config: HealthSystemConfig;
  #currentStairIndex: number = 0;
  #isActive: boolean = false;

  constructor(config: HealthSystemConfig) {
    this.#config = config;
  }

  public setActive(active: boolean): void {
    this.#isActive = active;
  }

  public setCurrentStairIndex(stairIndex: number): void {
    this.#currentStairIndex = stairIndex;
  }

  public getCurrentDecayRate(): number {
    if (!this.#isActive) return 0;

    const { baseDecayRate, maxDecayRate, stairMultiplier, decayGrowthRate } = this.#config.decayConfig;

    // 로그 기반 성장 공식: 높이 올라갈수록 빨라지지만 무한정 빨라지지 않음
    // decay = base + (max - base) * (1 - e^(-growth * stairs * multiplier))
    const stairFactor = this.#currentStairIndex * stairMultiplier;
    const exponentialFactor = 1 - Math.exp(-decayGrowthRate * stairFactor);
    const currentDecayRate = baseDecayRate + (maxDecayRate - baseDecayRate) * exponentialFactor;

    return Math.min(currentDecayRate, maxDecayRate);
  }

  public calculateHealthDecay(deltaTimeMs: number): number {
    if (!this.#isActive) return 0;

    const decayRate = this.getCurrentDecayRate();
    return (decayRate * deltaTimeMs) / 1000; // 초당 감소량을 ms로 변환
  }

  public getStairRecoveryAmount(): number {
    return this.#config.decayConfig.recoveryAmount;
  }

  public getHealthDecayInfo() {
    return {
      currentStairIndex: this.#currentStairIndex,
      currentDecayRate: this.getCurrentDecayRate(),
      maxDecayRate: this.#config.decayConfig.maxDecayRate,
      baseDecayRate: this.#config.decayConfig.baseDecayRate,
      isActive: this.#isActive,
    };
  }

  // 기본 설정 제공
  public static createDefault(): HealthManager {
    return new HealthManager({
      maxHealth: 100,
      startingHealth: 100,
      decayConfig: {
        baseDecayRate: 20, // 초당 5체력 감소
        maxDecayRate: 70, // 초당 30 체력 감소
        stairMultiplier: 0.1, // 계단당 0.1씩 곱해짐
        decayGrowthRate: 0.05, // 성장률
        recoveryAmount: 20, // 계단당 30 체력 회복
      },
    });
  }
}
