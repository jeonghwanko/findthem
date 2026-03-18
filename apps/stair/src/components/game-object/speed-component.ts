import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export class SpeedComponent extends BaseGameObjectComponent {
  #speed: number;

  constructor(gameObject: GameObject, speed: number) {
    super(gameObject);
    this.#speed = speed;
  }

  get speed(): number {
    return this.#speed;
  }

  set speed(value: number) {
    this.#speed = value;
  }

  public increaseSpeed(amount: number): void {
    this.#speed += amount;
  }

  public decreaseSpeed(amount: number): void {
    this.#speed = Math.max(0, this.#speed - amount);
  }

  public resetSpeed(baseSpeed: number): void {
    this.#speed = baseSpeed;
  }
}
