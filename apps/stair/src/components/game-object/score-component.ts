import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export type ScoreComponentConfig = {
  pointsPerStair: number;
  onScoreUpdate: (score: number) => void;
};

export class ScoreComponent extends BaseGameObjectComponent {
  #config: ScoreComponentConfig;
  #currentScore: number = 0;
  #multiplier: number = 1;

  constructor(gameObject: GameObject, config: ScoreComponentConfig) {
    super(gameObject);
    this.#config = config;
  }

  public addStairPoints(): void {
    const points = this.#config.pointsPerStair * this.#multiplier;
    this.#currentScore += points;
    this.#config.onScoreUpdate(this.#currentScore);
  }

  public addBonusPoints(points: number): void {
    this.#currentScore += points;
    this.#config.onScoreUpdate(this.#currentScore);
  }

  public setMultiplier(multiplier: number): void {
    this.#multiplier = multiplier;
  }

  public getMultiplier(): number {
    return this.#multiplier;
  }

  public getCurrentScore(): number {
    return this.#currentScore;
  }

  public resetScore(): void {
    this.#currentScore = 0;
    this.#multiplier = 1;
    this.#config.onScoreUpdate(this.#currentScore);
  }

  // Called when player successfully lands on a stair
  public onStairLanded(): void {
    this.addStairPoints();
  }

  // Called when player performs special actions
  public onSpecialAction(bonusPoints: number): void {
    this.addBonusPoints(bonusPoints);
  }
}
