import { type CustomGameObject, type Direction } from "../../lib/types";
import { IMAGE_ASSETS } from "../../lib/assets";

export type StairConfig = {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  direction: Direction;
};

export class Stair extends Phaser.Physics.Arcade.Image implements CustomGameObject {
  #index: number;
  #direction: Direction;

  constructor(config: StairConfig) {
    const { scene, x, y, width, height, index, direction } = config;
    super(scene, x, y, IMAGE_ASSETS.STAIR.key);

    // Setup physics and display
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // true = static body
    this.setSize(width, height);
    this.setDisplaySize(width, height);
    this.setOrigin(0.5, 0);
    (this.body as Phaser.Physics.Arcade.StaticBody).setOffset(0, 0);

    // Store stair properties
    this.#index = index;
    this.#direction = direction;
  }

  get index(): number {
    return this.#index;
  }

  get direction(): Direction {
    return this.#direction;
  }

  // Simple implementation for CustomGameObject interface
  public enableObject(): void {
    this.setVisible(true);
  }

  public disableObject(): void {
    this.setVisible(false);
  }
}
