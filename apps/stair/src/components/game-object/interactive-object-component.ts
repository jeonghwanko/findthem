import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export type InteractiveObjectType = "stair" | "collectible" | "door" | "button" | "chest" | "general";

export type InteractionCondition = {
  check: () => boolean;
  failureMessage?: string;
  failureCallback?: () => void;
};

export type InteractiveObjectConfig = {
  objectType: InteractiveObjectType;
  callback?: () => void;
  canInteractCheck?: () => boolean;
  cooldownDuration?: number;
  maxInteractions?: number;
  onInteractionAttempt?: (successful: boolean) => void;
  conditions?: InteractionCondition[];
};

export class InteractiveObjectComponent extends BaseGameObjectComponent {
  #objectType: InteractiveObjectType;
  #callback: () => void;
  #canInteractCheck: () => boolean;
  #cooldownDuration: number;
  #maxInteractions: number;
  #currentInteractions: number = 0;
  #lastInteractionTime: number = 0;
  #onInteractionAttempt?: (successful: boolean) => void;
  #conditions: InteractionCondition[];

  constructor(gameObject: GameObject, config: InteractiveObjectConfig) {
    super(gameObject);

    this.#objectType = config.objectType;
    this.#callback = config.callback ?? (() => {});
    this.#canInteractCheck = config.canInteractCheck ?? (() => true);
    this.#cooldownDuration = config.cooldownDuration ?? 0;
    this.#maxInteractions = config.maxInteractions ?? Number.MAX_SAFE_INTEGER;
    this.#onInteractionAttempt = config.onInteractionAttempt;
    this.#conditions = config.conditions ?? [];
  }

  get objectType(): InteractiveObjectType {
    return this.#objectType;
  }

  get canInteractWith(): boolean {
    // Check if max interactions reached
    if (this.#currentInteractions >= this.#maxInteractions) {
      return false;
    }

    // Check cooldown
    if (this.cooldownRemaining > 0) {
      return false;
    }

    // Check custom condition
    if (!this.#canInteractCheck()) {
      return false;
    }

    // Check all conditions
    return this.#conditions.every((condition) => condition.check());
  }

  get cooldownRemaining(): number {
    const currentTime = this.scene.time.now;
    const remaining = this.#cooldownDuration - (currentTime - this.#lastInteractionTime);
    return Math.max(0, remaining);
  }

  get interactionsRemaining(): number {
    return Math.max(0, this.#maxInteractions - this.#currentInteractions);
  }

  get hasInteractionsLeft(): boolean {
    return this.#currentInteractions < this.#maxInteractions;
  }

  public interact(): boolean {
    this.#onInteractionAttempt?.(false); // Assume failure initially

    if (!this.canInteractWith) {
      this.#handleFailedInteraction();
      return false;
    }

    // Success! Execute interaction
    this.#lastInteractionTime = this.scene.time.now;
    this.#currentInteractions++;

    this.#callback();
    this.#onInteractionAttempt?.(true); // Update to success

    return true;
  }

  public reset(): void {
    this.#currentInteractions = 0;
    this.#lastInteractionTime = 0;
  }

  public addCondition(condition: InteractionCondition): void {
    this.#conditions.push(condition);
  }

  public removeCondition(conditionCheck: () => boolean): void {
    this.#conditions = this.#conditions.filter((condition) => condition.check !== conditionCheck);
  }

  #handleFailedInteraction(): void {
    // Check which condition failed and provide specific feedback
    if (this.#currentInteractions >= this.#maxInteractions) {
      return;
    }

    if (this.cooldownRemaining > 0) {
      return;
    }

    if (!this.#canInteractCheck()) {
      return;
    }

    // Check specific conditions
    for (const condition of this.#conditions) {
      if (!condition.check()) {
        condition.failureCallback?.();
        return;
      }
    }
  }
}
