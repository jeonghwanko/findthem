import { type GameObject } from "../../lib/types";
import { InputComponent } from "../input/input-component";
import { BaseGameObjectComponent } from "./base-game-object-component";

export class ControlsComponent extends BaseGameObjectComponent {
  #inputComponent: InputComponent;

  constructor(gameObject: GameObject, inputComponent: InputComponent) {
    super(gameObject);
    this.#inputComponent = inputComponent;
  }

  get controls(): InputComponent {
    return this.#inputComponent;
  }
}
