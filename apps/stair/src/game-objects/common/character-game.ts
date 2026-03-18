import { SpineGameObject } from "@esotericsoftware/spine-phaser-v3";
import { logger } from "../../lib/logger";
import { AnimationComponent, type AnimationConfig } from "../../components/game-object/animation-component";
import { ControlsComponent } from "../../components/game-object/controls-component";
import { DirectionComponent } from "../../components/game-object/direction-component";
import type { InputComponent } from "../../components/input/input-component";
import { StateMachine } from "../../components/state-machine/state-machine";
import type { Direction, Position } from "../../lib/types";
import { PLAYER_DEFAULT_SCALE, PLAYER_PHYSICS } from "../../lib/config";
import { DataManager } from "../../lib/data-manager";
import { IMAGE_ASSETS } from "../../lib/assets";

export type CharacterConfig = {
  scene: Phaser.Scene;
  position: Position;
  dataKey: string;
  atlasKey: string;
  inputComponent: InputComponent;
  animationConfig: AnimationConfig;
  id?: string;
  isPlayer: boolean;
};

export abstract class CharacterGameObject extends SpineGameObject {
  protected _controlsComponent: ControlsComponent;
  protected _directionComponent: DirectionComponent;
  protected _animationComponent: AnimationComponent;
  protected _stateMachine: StateMachine;
  protected _isPlayer: boolean;
  protected _shadow: Phaser.GameObjects.Image;

  [key: `_${string}`]: unknown;

  constructor(config: CharacterConfig) {
    const { scene, position, dataKey, atlasKey, animationConfig, inputComponent, id, isPlayer } = config;

    const { x, y } = position;

    super(scene, scene.spine, x, y, dataKey, atlasKey);

    // Setup character appearance
    this.#setupCharacterSkins();
    this._shadow = this.#createShadow(scene);
    this.setDepth(1);

    this.setScale(PLAYER_DEFAULT_SCALE);

    // add object to scene and enable phaser physics
    this.setSize(PLAYER_PHYSICS.width, PLAYER_PHYSICS.height);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body)
      .setSize(PLAYER_PHYSICS.width, PLAYER_PHYSICS.height)
      .setOffset(PLAYER_PHYSICS.offsetX, PLAYER_PHYSICS.offsetY);

    // add components
    this._controlsComponent = new ControlsComponent(this, inputComponent);
    this._directionComponent = new DirectionComponent(this);
    this._animationComponent = new AnimationComponent(this, animationConfig);

    // add state machine
    this._stateMachine = new StateMachine(id);

    // general config
    this._isPlayer = isPlayer;
  }

  public setSkin(skinName: string): void {
    const skin = this.skeleton.data.findSkin(skinName);
    if (skin) {
      this.skeleton.setSkin(skin);
      this.skeleton.setSlotsToSetupPose();
      if (this._isPlayer) {
        logger.debug("CharacterGameObject", "setSkin", `[${this.scene.scene.key}] Saving skin: ${skinName}`);
        DataManager.instance.updatePlayerSkin(skinName);
      }
    }
  }

  public setShadowVisibility(visible: boolean, duration: number = 0): void {
    if (!this.scene) return;

    if (duration > 0) {
      this.scene.tweens.add({
        targets: this._shadow,
        alpha: visible ? 0.4 : 0,
        duration: duration,
        ease: "Power2",
      });
    } else {
      this._shadow.setAlpha(visible ? 0.4 : 0);
    }
  }

  public override destroy(fromScene?: boolean): void {
    this._shadow.destroy(fromScene);
    super.destroy(fromScene);
  }

  get isEnemy(): boolean {
    return !this._isPlayer;
  }

  get controls(): InputComponent {
    return this._controlsComponent.controls;
  }

  get direction(): Direction {
    return this._directionComponent.direction;
  }

  set direction(value: Direction) {
    this._directionComponent.direction = value;
  }

  get animationComponent(): AnimationComponent {
    return this._animationComponent;
  }

  public update(): void {
    this._stateMachine.update();
    this._shadow.setPosition(this.x, this.y);
  }

  #setupCharacterSkins(): void {
    const skeleton = this.skeleton;
    const skinName = DataManager.instance.data.skin;

    logger.debug("CharacterGameObject", "#setupCharacterSkins", `[${this.scene.scene.key}] Loading skin: ${skinName}`);
    const skin = this.skeleton.data.findSkin(skinName);
    if (skin) {
      this.skeleton.setSkin(skin);
    }
    skeleton.setSlotsToSetupPose();
  }

  #createShadow(scene: Phaser.Scene): Phaser.GameObjects.Image {
    const shadow = scene.add.image(this.x, this.y, IMAGE_ASSETS.SHADOW.key);
    shadow.setAlpha(0.4);
    shadow.setScale(0.5);
    // 캐릭터보다 한 레이어 뒤에 있도록 설정
    shadow.setDepth(0);
    return shadow;
  }
}
