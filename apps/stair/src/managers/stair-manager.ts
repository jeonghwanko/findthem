import { type Direction } from "../lib/types";
import { Stair } from "../game-objects/objects/stair";

export type StairValidationResult = {
  isValid: boolean;
  nextStair?: Stair;
  reasonKey?: string; // Changed from 'reason' to 'reasonKey' to indicate it's a translation key
  hasEnemy?: boolean;
};

export type StairPosition = {
  x: number;
  y: number;
};

export type EnemyAtStair = {
  destroy: () => void;
  takeDamage: (attackDirection?: Direction) => void;
  x: number;
  y: number;
  stairIndex: number;
};

export class StairManager {
  #stairs: Stair[] = [];
  #enemies: Map<number, EnemyAtStair[]> = new Map();

  constructor(stairs: Stair[] = []) {
    this.#stairs = stairs;
  }

  public updateStairs(stairs: Stair[]): void {
    this.#stairs = stairs;
  }

  public addEnemyAtStair(stairIndex: number, enemy: EnemyAtStair): void {
    if (!this.#enemies.has(stairIndex)) {
      this.#enemies.set(stairIndex, []);
    }
    this.#enemies.get(stairIndex)!.push(enemy);
  }

  public removeEnemyAtStair(stairIndex: number, enemy: EnemyAtStair): void {
    const enemies = this.#enemies.get(stairIndex);
    if (enemies) {
      const index = enemies.indexOf(enemy);
      if (index > -1) {
        enemies.splice(index, 1);
      }
      if (enemies.length === 0) {
        this.#enemies.delete(stairIndex);
      }
    }
  }

  public getEnemiesAtStair(stairIndex: number): EnemyAtStair[] {
    return this.#enemies.get(stairIndex) || [];
  }

  public hasEnemyAtStair(stairIndex: number): boolean {
    return this.#enemies.has(stairIndex) && this.#enemies.get(stairIndex)!.length > 0;
  }

  public canMoveToNextStair(direction: Direction, currentStairIndex: number): StairValidationResult {
    const nextStairIndex = currentStairIndex + 1;
    const nextStair = this.#stairs.find((stair) => stair.index === nextStairIndex);

    if (!nextStair) {
      return {
        isValid: false,
        reasonKey: "noNextStairAvailable",
      };
    }

    if (nextStair.direction !== direction) {
      return {
        isValid: false,
        reasonKey: "wrongDirection",
        nextStair,
      };
    }

    // Check if there's an enemy at the next stair
    const hasEnemy = this.hasEnemyAtStair(nextStairIndex);
    if (hasEnemy) {
      return {
        isValid: false,
        reasonKey: "enemyBlockingWay",
        nextStair,
        hasEnemy: true,
      };
    }

    return {
      isValid: true,
      nextStair,
      hasEnemy: false,
    };
  }

  public getNextStairPosition(currentStairIndex: number): StairPosition | null {
    const nextStairIndex = currentStairIndex + 1;
    const nextStair = this.#stairs.find((stair) => stair.index === nextStairIndex);

    if (!nextStair) {
      return null;
    }

    return {
      x: nextStair.x,
      y: nextStair.y,
    };
  }

  public getCurrentStair(stairIndex: number): Stair | undefined {
    return this.#stairs.find((stair) => stair.index === stairIndex);
  }

  public getStairCount(): number {
    return this.#stairs.length;
  }
}
