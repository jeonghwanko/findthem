import type { AnimationConfig } from "../../components/game-object/animation-component";
import type { InputComponent } from "../../components/input/input-component";
import { CHARACTER_STATES } from "../../components/state-machine/states/character/_states";
import { IdleState } from "../../components/state-machine/states/character/idle-state";
import { MoveState } from "../../components/state-machine/states/character/move-state";
import { ClimbState } from "../../components/state-machine/states/character/climb-state";
import { FallState } from "../../components/state-machine/states/character/fall-state";
import { DeathState } from "../../components/state-machine/states/character/death-state";
import { EntranceState } from "../../components/state-machine/states/character/entrance-state";
import { MovementComponent } from "../../components/game-object/movement-component";
import { StairTrackingComponent } from "../../components/game-object/stair-tracking-component";
import { StairComponent } from "../../components/game-object/stair-component";
import { HealthComponent } from "../../components/game-object/health-component";
import { StairManager } from "../../managers/stair-manager";
import { HealthManager } from "../../managers/health-manager";
import { DataManager } from "../../lib/data-manager";
import { logger } from "../../lib/logger";
import { CHARACTER_ANIMATIONS, PLAYER_ANIMATION_KEYS, SPINE_ASSETS } from "../../lib/assets";
import type { Position } from "../../lib/types";
import { CharacterGameObject } from "../common/character-game";
import { TransitionState } from "../../components/state-machine/states/character/transition-state";
import { AttackState } from "../../components/state-machine/states/character/attack-state";
import { HurtState } from "../../components/state-machine/states/character/hurt-state";
import { playAttackSound } from "../../lib/sound-utils";
import { LanguageManager } from "../../lib/language-manager";

export type PlayerConfig = {
  scene: Phaser.Scene;
  position: Position;
  controls: InputComponent;
  stairManager: StairManager;
  healthManager?: HealthManager;
  onStairLanded?: (stairIndex: number) => void;
  onMissedStair?: (reason: string) => void;
  onHealthChanged?: (health: number, maxHealth: number) => void;
  onDeath?: (reason: string) => void;
};

export class Player extends CharacterGameObject {
  private _movementComponent!: MovementComponent;
  private _stairTrackingComponent!: StairTrackingComponent;
  private _stairComponent!: StairComponent;
  private _healthComponent!: HealthComponent;
  private _healthManager!: HealthManager;
  private _lastUpdateTime: number = 0;

  constructor(config: PlayerConfig) {
    // create animation config for component
    const animationConfig: AnimationConfig = {
      [CHARACTER_ANIMATIONS.WALK_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.WALK_LEFT,
        repeat: -1,
        timeScale: 4,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.WALK_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.WALK_RIGHT,
        repeat: -1,
        timeScale: 4,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.IDLE_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.IDLE_LEFT,
        repeat: -1,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.IDLE_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.IDLE_RIGHT,
        repeat: -1,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.TRANSITION_READY]: {
        key: PLAYER_ANIMATION_KEYS.TRANSITION_READY,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.TRANSITION_JUMP]: {
        key: PLAYER_ANIMATION_KEYS.TRANSITION_JUMP,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.HURT_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.HURT_LEFT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.HURT_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.HURT_RIGHT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.DIE_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.DIE_LEFT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.DIE_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.DIE_RIGHT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.ANGRY_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.ANGRY_LEFT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.ANGRY_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.ANGRY_RIGHT,
        repeat: 0,
        timeScale: 1,
        ignoreIfPlaying: true,
      },
      [CHARACTER_ANIMATIONS.ATTACK_LEFT]: {
        key: PLAYER_ANIMATION_KEYS.ATTACK_LEFT,
        repeat: 0,
        timeScale: 5,
        ignoreIfPlaying: false,
      },
      [CHARACTER_ANIMATIONS.ATTACK_RIGHT]: {
        key: PLAYER_ANIMATION_KEYS.ATTACK_RIGHT,
        repeat: 0,
        timeScale: 5,
        ignoreIfPlaying: false,
      },
    };

    super({
      scene: config.scene,
      position: config.position,
      dataKey: SPINE_ASSETS.HUMAN.dataKey,
      atlasKey: SPINE_ASSETS.HUMAN.atlasKey,
      id: "player",
      isPlayer: true,
      animationConfig,
      inputComponent: config.controls,
    });

    this.#setupComponents(config);
    this.#setupStateMachine();

    // Initialize update time
    this._lastUpdateTime = Date.now();

    // enable auto update functionality
    config.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    config.scene.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      () => {
        config.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
      },
      this,
    );
  }

  #setupComponents(config: PlayerConfig): void {
    // Setup Health Manager
    this._healthManager = config.healthManager || HealthManager.createDefault();

    // Setup Health Component
    this._healthComponent = new HealthComponent(this, {
      maxHealth: 100, // Default max health
      currentHealth: 100, // Default starting health
      onHealthChanged: (health, maxHealth) => {
        config.onHealthChanged?.(health, maxHealth);
        // Update DataManager with current health
        DataManager.instance.updatePlayerHealth(health);
      },
      onHealthDepleted: () => {
        const deathMessage = LanguageManager.getInstance().t("tooSlow");
        this._stateMachine.setState(CHARACTER_STATES.DEATH_STATE, deathMessage);
        config.onDeath?.(deathMessage);
      },
      onHealthRestored: (amount) => {
        logger.info("Player", "healthRestored", `+${amount.toFixed(1)}`);
      },
    });

    // Setup Movement Component
    this._movementComponent = new MovementComponent(this, {
      onMoveComplete: () => {
        // Switch back to idle animation when movement completes
        this.animationComponent.playAnimation("IDLE_LEFT");
      },
    });

    // Setup Stair Tracking Component
    this._stairTrackingComponent = new StairTrackingComponent(this, {
      onStairChanged: (newIndex, previousIndex) => {
        logger.debug("Player", "stairChanged", `from ${previousIndex} to ${newIndex}`);

        // Update health manager with new stair index
        this._healthManager.setCurrentStairIndex(newIndex);

        // Restore health when climbing stairs
        if (newIndex > previousIndex) {
          const recoveryAmount = this._healthManager.getStairRecoveryAmount();
          this._healthComponent.restoreHealth(recoveryAmount);
        }
      },
    });

    // Setup Stair Component
    this._stairComponent = new StairComponent(this, {
      stairManager: config.stairManager,
      onStairLanded: (stairIndex) => {
        config.onStairLanded?.(stairIndex);
      },
      onMissedStair: (reason) => {
        config.onMissedStair?.(reason);
      },
    });
  }

  #setupStateMachine(): void {
    // add state machine - using improved climb state
    this._stateMachine.addState(new IdleState(this));
    this._stateMachine.addState(new MoveState(this));
    this._stateMachine.addState(new ClimbState(this)); // Using improved state
    this._stateMachine.addState(new FallState(this)); // Fall animation state
    this._stateMachine.addState(new DeathState(this)); // Death state
    this._stateMachine.addState(new EntranceState(this));
    this._stateMachine.addState(new TransitionState(this));
    this._stateMachine.addState(new AttackState(this)); // Attack state
    this._stateMachine.addState(new HurtState(this)); // Hurt state

    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
  }

  public override update(): void {
    super.update();

    // Update health decay
    this.#updateHealthDecay();
  }

  #updateHealthDecay(): void {
    const currentTime = Date.now();
    const deltaTime = currentTime - this._lastUpdateTime;
    this._lastUpdateTime = currentTime;

    // Calculate health decay
    const decayAmount = this._healthManager.calculateHealthDecay(deltaTime);

    if (decayAmount > 0 && !this._healthComponent.isDead) {
      this._healthComponent.decreaseHealth(decayAmount);
    }
  }

  public startHealthDecay(): void {
    this._healthManager.setActive(true);
  }

  public stopHealthDecay(): void {
    this._healthManager.setActive(false);
  }

  public transitionToScene(onComplete: () => void): void {
    playAttackSound(this.scene);
    this._stateMachine.setState(CHARACTER_STATES.TRANSITION_STATE, onComplete);
  }

  public startEntrance(onComplete: () => void): void {
    this._stateMachine.setState(CHARACTER_STATES.ENTRANCE_STATE, onComplete);
  }

  // Getter methods for accessing components
  public get movementComponent(): MovementComponent {
    return this._movementComponent;
  }

  public get stairTrackingComponent(): StairTrackingComponent {
    return this._stairTrackingComponent;
  }

  public get stairComponent(): StairComponent {
    return this._stairComponent;
  }

  public get healthComponent(): HealthComponent {
    return this._healthComponent;
  }

  public get healthManager(): HealthManager {
    return this._healthManager;
  }
}
