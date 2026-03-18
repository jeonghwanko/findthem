import { KeyboardComponent } from "../components/input/keyboard-component";
import { Player } from "../game-objects/player/player";
import { CameraFollowComponent } from "../components/game-object/camera-follow-component";
import { ScoreComponent } from "../components/game-object/score-component";
import { Stair } from "../game-objects/objects/stair";
import { StairManager } from "../managers/stair-manager";
import { HealthManager } from "../managers/health-manager";
import { SCENE_KEYS } from "./_scene-keys";
import { DataManager } from "../lib/data-manager";
import { STAIR_CONFIG, GAMEPLAY_CONFIG } from "../lib/config";
import { EVENT_BUS, CUSTOM_EVENTS, type HealthChanged, type GameOver } from "../lib/event-bus";
import { logger } from "../lib/logger";
import type { Direction } from "../lib/types";
import { BackgroundComponent } from "../components/background-component";
import { Enemy } from "../game-objects/enemy/enemy";
import type { EnemyAtStair } from "../managers/stair-manager";
import type { AttackTarget } from "../components/state-machine/states/character/attack-state";

export class GameScene extends Phaser.Scene {
  #background!: BackgroundComponent;
  #controls!: KeyboardComponent;
  #player!: Player;
  #stairManager!: StairManager;
  #healthManager!: HealthManager;
  #stairs: Stair[] = [];
  #enemies: Enemy[] = [];
  #currentStairIndex: number = 0;
  #score: number = 0;
  #isGameActive: boolean = false;
  #lastEnemyStairIndex: number = -1; // 마지막으로 Enemy가 생성된 계단 인덱스
  #isRestarting: boolean = false; // Add restart prevention flag

  // Track last stair info to avoid array index issues
  #lastStairX: number = 0;

  // Computed world settings
  private readonly WORLD_CENTER_X = STAIR_CONFIG.worldWidth / 2;

  constructor() {
    super(SCENE_KEYS.GAME_SCENE);
  }

  create(): void {
    // Reset all game state for clean restart
    this.#resetGameState();

    // Start UI Scene as overlay (only if not already running)
    if (!this.scene.isActive(SCENE_KEYS.UI_SCENE)) {
      this.scene.launch(SCENE_KEYS.UI_SCENE);
    }

    this.#createBackground();
    this.#generateInitialStairs();

    // Initialize StairManager after stairs are created but before enemies are added
    this.#stairManager = new StairManager(this.#stairs);

    // Now we can create enemies since stairManager is initialized
    this.#createEnemiesForExistingStairs();

    this.#createPlayer();
    this.#setupEventListeners();
    this.#startGame();
  }

  #resetGameState(): void {
    // Reset all game state variables
    this.#stairs = [];
    this.#enemies = [];
    this.#currentStairIndex = 0;
    this.#score = 0;
    this.#isGameActive = false;
    this.#lastEnemyStairIndex = -1;
    this.#lastStairX = 0;

    // Clear any existing objects
    this.children.removeAll();
  }

  #createBackground(): void {
    const playerX = this.WORLD_CENTER_X;
    const playerY = this.scale.height; // Use hardcoded value for now

    this.#background = new BackgroundComponent(
      this,
      this.scale.width,
      this.scale.height,
      { x: 0.2, y: 0.2 }, // parallax config
      playerX,
      playerY,
    );
  }

  #createPlayer(): void {
    this.#controls = new KeyboardComponent(this.input.keyboard!);

    // Initialize HealthManager
    this.#healthManager = HealthManager.createDefault();

    this.#player = new Player({
      scene: this,
      position: { x: this.WORLD_CENTER_X, y: this.scale.height },
      controls: this.#controls,
      stairManager: this.#stairManager,
      healthManager: this.#healthManager,
      onStairLanded: (stairIndex: number) => this.#handleStairLanded(stairIndex),
      onMissedStair: (reason: string) => this.#handleGameOver(reason),
      onHealthChanged: (health: number, maxHealth: number) => this.#handleHealthChanged(health, maxHealth),
      onDeath: (reason: string) => this.#handleGameOver(reason),
    });
    this.#player.setDepth(2);

    // Ensure player starts at stair index 0
    this.#player.stairTrackingComponent.currentStairIndex = 0;

    // Add camera follow component
    new CameraFollowComponent(this.#player, this.cameras.main);

    // Add score component
    new ScoreComponent(this.#player, {
      pointsPerStair: GAMEPLAY_CONFIG.score.pointsPerStair,
      onScoreUpdate: (score: number) => this.#updateScore(score),
    });
  }

  #startGame(): void {
    // Reset restarting flag when game actually starts
    this.#isRestarting = false;
    this.#isGameActive = true;

    // Update DataManager with initial game state
    DataManager.instance.setGameActive(true);
    DataManager.instance.setCurrentStairIndex(this.#currentStairIndex);

    // Start entrance animation, then start health decay
    this.#player.startEntrance(() => {
      this.#player.startHealthDecay();
    });

    // Notify UI Scene that game has started via EVENT_BUS
    EVENT_BUS.emit(CUSTOM_EVENTS.GAME_STARTED);
  }

  #handleHealthChanged(health: number, maxHealth: number): void {
    // Send health data to UI Scene via EVENT_BUS
    const decayRate = this.#healthManager.getCurrentDecayRate();
    const healthData: HealthChanged = { health, maxHealth, decayRate };
    EVENT_BUS.emit(CUSTOM_EVENTS.HEALTH_CHANGED, healthData);
  }

  #updateScore(score: number): void {
    this.#score = score;

    // Send score to UI Scene via EVENT_BUS
    EVENT_BUS.emit(CUSTOM_EVENTS.SCORE_CHANGED, score);
  }

  #handleGameOver(reason?: string): void {
    if (!this.#isGameActive) return;

    logger.info("GameScene", "game over", reason || "Unknown reason");
    this.#isGameActive = false;

    // Stop health decay
    this.#player.stopHealthDecay();

    // Update DataManager
    DataManager.instance.setGameActive(false);

    // Send game over event to UI Scene via EVENT_BUS
    const gameOverData: GameOver = { reason, score: this.#score };
    EVENT_BUS.emit(CUSTOM_EVENTS.GAME_OVER, gameOverData);
  }

  #generateInitialStairs(): void {
    const startY = this.scale.height; // Use hardcoded value

    for (let i = 0; i < STAIR_CONFIG.initialCount; i++) {
      // First 5 stairs are LEFT, next 5 are RIGHT, then random
      let direction: Direction;
      if (i < 5) {
        direction = "LEFT";
      } else if (i < 10) {
        direction = "RIGHT";
      } else {
        direction = this.#getRandomDirection();
      }

      const stair = new Stair({
        scene: this,
        index: i,
        x: this.#getStairX(i, direction),
        y: startY - i * STAIR_CONFIG.gapY,
        width: STAIR_CONFIG.width,
        height: STAIR_CONFIG.height,
        direction: direction,
      });

      this.#stairs.push(stair);
      this.#lastStairX = stair.x;
    }
  }

  #createEnemiesForExistingStairs(): void {
    // Enemy는 50개 계단 이후부터만 생성
    const startIndex = Math.max(GAMEPLAY_CONFIG.enemy.startStairIndex, 0);

    for (let i = startIndex; i < this.#stairs.length; i++) {
      if (this.#shouldCreateEnemyAtStair(i)) {
        const stair = this.#stairs[i];
        this.#createEnemyAtStair(i, stair.x, stair.y);
      }
    }
  }

  #shouldCreateEnemyAtStair(stairIndex: number): boolean {
    // 기본 확률 체크
    if (Math.random() > GAMEPLAY_CONFIG.enemy.spawnChance) {
      return false;
    }

    // 이전 Enemy와의 최소 거리 체크
    if (this.#lastEnemyStairIndex >= 0) {
      const distanceFromLastEnemy = stairIndex - this.#lastEnemyStairIndex;
      if (distanceFromLastEnemy < GAMEPLAY_CONFIG.enemy.minDistanceBetweenEnemies) {
        return false;
      }
    }

    // 연속된 방향 체크가 필요한 경우
    if (GAMEPLAY_CONFIG.enemy.requireConsecutiveDirection) {
      return this.#isConsecutiveDirection(stairIndex);
    }

    return true;
  }

  #isConsecutiveDirection(stairIndex: number): boolean {
    if (stairIndex === 0) return false; // 첫 번째 계단에는 enemy 없음

    const currentStair = this.#stairs.find((s) => s.index === stairIndex);
    const previousStair = this.#stairs.find((s) => s.index === stairIndex - 1);

    if (!currentStair || !previousStair) return false;

    // 이전 계단과 같은 방향일 때만 true
    return currentStair.direction === previousStair.direction;
  }

  #createEnemyAtStair(stairIndex: number, x: number, y: number): void {
    // Find the stair to get its direction
    const stair = this.#stairs.find((s) => s.index === stairIndex);
    if (!stair) {
      console.warn(`Cannot create enemy: stair ${stairIndex} not found`);
      return;
    }

    const enemy = new Enemy({
      scene: this,
      position: { x, y },
      stairIndex,
      stairDirection: stair.direction, // Pass stair direction to enemy
      onDestroyed: () => {
        this.#removeEnemy(enemy);
      },
    });

    this.#enemies.push(enemy);
    enemy.setDepth(1); // Behind player

    // Register enemy with stair manager
    const enemyData: EnemyAtStair = {
      destroy: () => enemy.destroy(),
      takeDamage: (attackDirection?: Direction) => enemy.takeDamage(attackDirection),
      x: enemy.x,
      y: enemy.y,
      stairIndex,
    };

    this.#stairManager.addEnemyAtStair(stairIndex, enemyData);

    // Store reference in enemy for easier removal
    enemy.stairManagerData = enemyData;

    // 마지막 Enemy 생성 위치 업데이트
    this.#lastEnemyStairIndex = stairIndex;
  }

  #removeEnemy(enemy: Enemy): void {
    const index = this.#enemies.indexOf(enemy);
    if (index > -1) {
      this.#enemies.splice(index, 1);
    }

    // Remove from stair manager using stored reference
    const enemyData = enemy.stairManagerData;
    if (enemyData) {
      this.#stairManager.removeEnemyAtStair(enemy.stairIndex, enemyData);
    }
  }

  // Method for AttackState to use - returns actual Enemy objects with attack method
  public getEnemiesAtStair(stairIndex: number): Array<AttackTarget> {
    // Find actual Enemy objects at this stair
    const enemiesAtStair: Array<AttackTarget> = [];

    for (const enemy of this.#enemies) {
      if (enemy.stairIndex === stairIndex) {
        enemiesAtStair.push({
          attack: () => enemy.attack(),
          destroy: () => enemy.destroy(),
          x: enemy.x,
          y: enemy.y,
          takeDamage: (attackDirection?: Direction) => enemy.takeDamage(attackDirection),
        });
      }
    }

    return enemiesAtStair;
  }

  // Method for HurtState to use
  public getCurrentStairPosition(stairIndex: number): { x: number; y: number } | undefined {
    const stair = this.#stairManager.getCurrentStair(stairIndex);
    if (stair) {
      return { x: stair.x, y: stair.y };
    }
    return undefined;
  }

  #getRandomDirection(): Direction {
    // Use last stair X position for boundary checking
    const prevX = this.#lastStairX;

    // Prevent going too far to the edges using configurable buffer
    const minX = STAIR_CONFIG.width + STAIR_CONFIG.gapX + STAIR_CONFIG.edgeBuffer;
    const maxX = STAIR_CONFIG.worldWidth - STAIR_CONFIG.width - STAIR_CONFIG.gapX - STAIR_CONFIG.edgeBuffer;

    if (prevX <= minX) {
      return "RIGHT"; // Force right if too far left
    }
    if (prevX >= maxX) {
      return "LEFT"; // Force left if too far right
    }

    // Random direction if in safe zone
    return Math.random() > 0.5 ? "LEFT" : "RIGHT";
  }

  #getStairX(index: number, direction: Direction): number {
    if (index === 0) {
      // Initialize first stair at center
      this.#lastStairX = this.WORLD_CENTER_X;
      return this.WORLD_CENTER_X;
    }

    // Use last stair position instead of array lookup to avoid index issues
    const prevX = this.#lastStairX;

    // Move by gap distance in the chosen direction
    if (direction === "LEFT") {
      return Math.max(STAIR_CONFIG.width, prevX - STAIR_CONFIG.gapX);
    } else {
      return Math.min(STAIR_CONFIG.worldWidth - STAIR_CONFIG.width, prevX + STAIR_CONFIG.gapX);
    }
  }

  #createStair(index: number): void {
    // First 5 stairs are LEFT, next 5 are RIGHT, then random
    let direction: Direction;
    if (index < 5) {
      direction = "LEFT";
    } else if (index < 10) {
      direction = "RIGHT";
    } else {
      direction = this.#getRandomDirection();
    }

    const x = this.#getStairX(index, direction);
    const y = this.scale.height - index * STAIR_CONFIG.gapY;

    const stair = new Stair({
      scene: this,
      index,
      x,
      y,
      width: STAIR_CONFIG.width,
      height: STAIR_CONFIG.height,
      direction,
    });

    this.#stairs.push(stair);
    this.#lastStairX = x;

    // Enemy 생성 조건 체크 (50개 계단 이후 + 방향 체크)
    if (index >= GAMEPLAY_CONFIG.enemy.startStairIndex && this.#shouldCreateEnemyAtStair(index)) {
      this.#createEnemyAtStair(index, x, y);
    }
  }

  #setupEventListeners(): void {
    // Listen for restart request from UI Scene via EVENT_BUS
    EVENT_BUS.on(CUSTOM_EVENTS.GAME_RESTART_REQUESTED, this.#handleRestartRequested, this);

    // Listen for mobile input events from UI Scene
    EVENT_BUS.on("MOBILE_INPUT_TURN", this.#handleMobileTurn, this);
    EVENT_BUS.on("MOBILE_INPUT_MOVE", this.#handleMobileMove, this);
    EVENT_BUS.on("MOBILE_INPUT_ATTACK", this.#handleMobileAttack, this);

    // Listen for keyboard events to trigger UI animations
    this.input.keyboard?.on("keydown-A", () => EVENT_BUS.emit(CUSTOM_EVENTS.KEY_PRESSED, { key: "turn" }));
    this.input.keyboard?.on("keydown-S", () => EVENT_BUS.emit(CUSTOM_EVENTS.KEY_PRESSED, { key: "move" }));
    this.input.keyboard?.on("keydown-D", () => EVENT_BUS.emit(CUSTOM_EVENTS.KEY_PRESSED, { key: "attack" }));
  }

  #handleRestartRequested(): void {
    // Prevent multiple restart requests
    if (this.#isRestarting) {
      return;
    }

    // Set restarting flag immediately
    this.#isRestarting = true;

    // First emit a reset event for UI Scene
    EVENT_BUS.emit("GAME_RESET_UI");

    // Small delay before actual restart to let UI reset
    this.time.delayedCall(100, () => {
      // Restart the game scene
      this.scene.restart();
    });
  }

  #handleMobileTurn(): void {
    // Check if player exists
    if (!this.#player) {
      return;
    }

    // Use the new simulation method
    const controls = this.#player.controls;
    if (controls && typeof controls.simulateTurnKeyPress === "function") {
      controls.simulateTurnKeyPress();
    }
  }

  #handleMobileMove(): void {
    // Check if player exists
    if (!this.#player) {
      return;
    }

    // Use the new simulation method
    const controls = this.#player.controls;
    if (controls && typeof controls.simulateMoveKeyPress === "function") {
      controls.simulateMoveKeyPress();
    }
  }

  #handleMobileAttack(): void {
    // Check if player exists
    if (!this.#player) {
      return;
    }

    // Use the new simulation method
    const controls = this.#player.controls;
    if (controls && typeof controls.simulateAttackKeyPress === "function") {
      controls.simulateAttackKeyPress();
    }
  }

  #generateMoreStairs(): void {
    // Find the highest existing stair index
    const maxExistingIndex = Math.max(...this.#stairs.map((s) => s.index));
    const startIndex = maxExistingIndex + 1;
    const endIndex = startIndex + STAIR_CONFIG.generationThreshold;

    for (let i = startIndex; i < endIndex; i++) {
      this.#createStair(i);
    }
    // Update StairManager with new stairs
    this.#stairManager.updateStairs(this.#stairs);
  }

  #cleanupOldStairs(currentStairIndex: number): void {
    const maxToRemove = this.#stairs.length - STAIR_CONFIG.bufferSize;
    if (maxToRemove <= 0) {
      return;
    }

    const cleanupThresholdIndex = currentStairIndex - STAIR_CONFIG.cleanupThreshold;
    let oldStairCount = 0;
    for (const stair of this.#stairs) {
      if (stair.index < cleanupThresholdIndex) {
        oldStairCount++;
      } else {
        break;
      }
    }

    const numToRemove = Math.min(maxToRemove, oldStairCount);

    if (numToRemove > 0) {
      const removedStairs = this.#stairs.splice(0, numToRemove);
      removedStairs.forEach((stair) => stair.destroy());
    }
  }

  #handleStairLanded(stairIndex: number): void {
    this.#currentStairIndex = stairIndex;

    // Update DataManager with current stair index only
    DataManager.instance.setCurrentStairIndex(stairIndex);

    // Update score through score component
    const scoreComponent = ScoreComponent.getComponent<ScoreComponent>(this.#player);
    if (scoreComponent) {
      scoreComponent.onStairLanded();
    }

    // Generate more stairs if needed
    if (stairIndex > this.#stairs.length - STAIR_CONFIG.generationThreshold) {
      this.#generateMoreStairs();
    }

    // Remove old stairs to save memory
    this.#cleanupOldStairs(stairIndex);

    // Update StairManager with cleaned stairs
    this.#stairManager.updateStairs(this.#stairs);
  }

  update(): void {
    if (this.#background && this.#player) {
      this.#background.updateParallaxScrolling(this.#player.x, this.#player.y);
    }
  }
}
