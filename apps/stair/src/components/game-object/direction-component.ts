import { type Direction, type GameObject } from "../../lib/types";
import { DIRECTION } from "../../lib/consts";
import { BaseGameObjectComponent } from "./base-game-object-component";

export class DirectionComponent extends BaseGameObjectComponent {
  #direction: Direction;
  #callback: (direction: Direction) => void;

  constructor(gameObject: GameObject, onDirectionCallback = () => undefined) {
    super(gameObject);
    this.#direction = DIRECTION.LEFT;
    this.#callback = onDirectionCallback;
  }

  get direction(): Direction {
    return this.#direction;
  }

  set direction(direction: Direction) {
    this.#direction = direction;
    this.#callback(this.#direction);
  }

  set callback(callback: (direction: Direction) => void) {
    this.#callback = callback;
  }
}
