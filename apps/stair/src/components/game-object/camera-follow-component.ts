import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export class CameraFollowComponent extends BaseGameObjectComponent {
  #camera: Phaser.Cameras.Scene2D.Camera;
  #followLerpX: number = 0.1;
  #followLerpY: number = 0.1;

  constructor(gameObject: GameObject, camera: Phaser.Cameras.Scene2D.Camera) {
    super(gameObject);
    this.#camera = camera;
    this.#setupCameraFollow();
  }

  #setupCameraFollow(): void {
    // Start following the game object
    this.#camera.startFollow(this.gameObject, true, this.#followLerpX, this.#followLerpY);

    // Set larger deadzone for more freedom in wide world
    this.#camera.setDeadzone(200, 100);
  }

  public setFollowLerp(x: number, y: number): void {
    this.#followLerpX = x;
    this.#followLerpY = y;
    this.#camera.setLerp(x, y);
  }

  public setDeadzone(width: number, height: number): void {
    this.#camera.setDeadzone(width, height);
  }

  public stopFollow(): void {
    this.#camera.stopFollow();
  }

  public resumeFollow(): void {
    this.#camera.startFollow(this.gameObject, true, this.#followLerpX, this.#followLerpY);
  }

  public shake(duration: number = 100, intensity: number = 0.01): void {
    this.#camera.shake(duration, intensity);
  }
}
