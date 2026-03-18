import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export type HealthConfig = {
  maxHealth: number;
  currentHealth?: number;
  onHealthChanged?: (health: number, maxHealth: number) => void;
  onHealthDepleted?: () => void;
  onHealthRestored?: (amount: number) => void;
};

export class HealthComponent extends BaseGameObjectComponent {
  #maxHealth: number;
  #currentHealth: number;
  #config: HealthConfig;

  constructor(gameObject: GameObject, config: HealthConfig) {
    super(gameObject);
    this.#config = config;
    this.#maxHealth = config.maxHealth;
    this.#currentHealth = config.currentHealth ?? config.maxHealth;
  }

  public get currentHealth(): number {
    return this.#currentHealth;
  }

  public get maxHealth(): number {
    return this.#maxHealth;
  }

  public get healthPercentage(): number {
    return this.#currentHealth / this.#maxHealth;
  }

  public get isDead(): boolean {
    return this.#currentHealth <= 0;
  }

  public decreaseHealth(amount: number): void {
    const previousHealth = this.#currentHealth;
    this.#currentHealth = Math.max(0, this.#currentHealth - amount);

    if (this.#currentHealth !== previousHealth) {
      this.#config.onHealthChanged?.(this.#currentHealth, this.#maxHealth);

      if (this.#currentHealth <= 0) {
        this.#config.onHealthDepleted?.();
      }
    }
  }

  public restoreHealth(amount: number): void {
    const previousHealth = this.#currentHealth;
    this.#currentHealth = Math.min(this.#maxHealth, this.#currentHealth + amount);

    if (this.#currentHealth !== previousHealth) {
      this.#config.onHealthChanged?.(this.#currentHealth, this.#maxHealth);
      this.#config.onHealthRestored?.(this.#currentHealth - previousHealth);
    }
  }

  public setHealth(amount: number): void {
    const previousHealth = this.#currentHealth;
    this.#currentHealth = Math.max(0, Math.min(this.#maxHealth, amount));

    if (this.#currentHealth !== previousHealth) {
      this.#config.onHealthChanged?.(this.#currentHealth, this.#maxHealth);

      if (this.#currentHealth <= 0) {
        this.#config.onHealthDepleted?.();
      }
    }
  }

  public resetHealth(): void {
    this.setHealth(this.#maxHealth);
  }
}
