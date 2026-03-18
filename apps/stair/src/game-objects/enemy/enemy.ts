import type { AnimationConfig } from "../../components/game-object/animation-component";
import { ENEMY_STATES } from "../../components/state-machine/states/character/_states";
import { EnemyIdleState } from "../../components/state-machine/states/enemy/enemy-idle-state";
import { EnemyAttackState } from "../../components/state-machine/states/enemy/enemy-attack-state";
import { EnemyFallState } from "../../components/state-machine/states/enemy/enemy-fall-state";
import { CHARACTER_ANIMATIONS, ENEMY_ANIMATION_KEYS, SPINE_ASSETS } from "../../lib/assets";
import type { Position, Direction } from "../../lib/types";
import { CharacterGameObject } from "../common/character-game";
import { InputComponent } from "../../components/input/input-component";
import type { EnemyAtStair } from "../../managers/stair-manager";

export type EnemyConfig = {
  scene: Phaser.Scene;
  position: Position;
  stairIndex: number;
  stairDirection: Direction; // Direction of the stair enemy is on
  onDestroyed?: () => void;
};

export class Enemy extends CharacterGameObject {
  #stairIndex: number;
  #stairDirection: Direction; // Direction of the stair
  #onDestroyed?: () => void;
  #stairManagerData?: EnemyAtStair; // Store reference to StairManager data

  constructor(config: EnemyConfig) {
    // Create dummy input component for enemy (they don't move)
    const dummyInput = new InputComponent();
    dummyInput.isMovementLocked = true;

    // Create animation config for enemy
    const animationConfig: AnimationConfig = {
      [CHARACTER_ANIMATIONS.IDLE_LEFT]: {
        key: ENEMY_ANIMATION_KEYS.IDLE_LEFT,
        repeat: -1,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.IDLE_RIGHT]: {
        key: ENEMY_ANIMATION_KEYS.IDLE_RIGHT,
        repeat: -1,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.DIE_LEFT]: {
        key: ENEMY_ANIMATION_KEYS.DIE_LEFT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.DIE_RIGHT]: {
        key: ENEMY_ANIMATION_KEYS.DIE_RIGHT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.ATTACK_LEFT]: {
        key: ENEMY_ANIMATION_KEYS.ATTACK_LEFT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.ATTACK_RIGHT]: {
        key: ENEMY_ANIMATION_KEYS.ATTACK_RIGHT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
    };

    super({
      scene: config.scene,
      position: config.position,
      dataKey: SPINE_ASSETS.ENEMY_BUNNYBOT.dataKey,
      atlasKey: SPINE_ASSETS.ENEMY_BUNNYBOT.atlasKey,
      id: `enemy_${config.stairIndex}`,
      isPlayer: false,
      animationConfig,
      inputComponent: dummyInput,
    });

    this.skeleton.setSkinByName("skin_001");
    this.#stairDirection = config.stairDirection;

    if (this.#stairDirection === "LEFT") {
      this.setScale(-0.2, 0.2);
    } else {
      this.setScale(0.2, 0.2);
    }

    this.#stairIndex = config.stairIndex;
    this.#onDestroyed = config.onDestroyed;

    this.#setupStateMachine();
    this.#setupPhysics();

    // Enable auto update functionality
    config.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    config.scene.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      () => {
        config.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
      },
      this,
    );
  }

  #setupStateMachine(): void {
    // Add enemy states
    this._stateMachine.addState(new EnemyIdleState(this));
    this._stateMachine.addState(new EnemyFallState(this, this.#onDestroyed));
    this._stateMachine.addState(new EnemyAttackState(this));

    // Start in idle state
    this._stateMachine.setState(ENEMY_STATES.IDLE_STATE);
  }

  #setupPhysics(): void {
    // Remove physics body since enemies don't move or need collision
    if (this.body && this.body instanceof Phaser.Physics.Arcade.Body) {
      this.scene.physics.world.remove(this.body);
    }
  }

  public get stairIndex(): number {
    return this.#stairIndex;
  }

  public get stairDirection(): Direction {
    return this.#stairDirection;
  }

  public set stairManagerData(data: EnemyAtStair) {
    this.#stairManagerData = data;
  }

  public get stairManagerData(): EnemyAtStair | undefined {
    return this.#stairManagerData;
  }

  public takeDamage(attackDirection?: Direction): void {
    this._stateMachine.setState(ENEMY_STATES.FALL_STATE, attackDirection, "Defeated by attack");
  }

  public attack(): void {
    this._stateMachine.setState(ENEMY_STATES.ATTACK_STATE);
  }

  public override destroy(fromScene?: boolean): void {
    // Clean up event listeners only if scene still exists
    if (this.scene && this.scene.events) {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    }

    // Call parent destroy (no callback here anymore)
    super.destroy(fromScene);
  }
}
