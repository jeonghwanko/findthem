import { HealthUIComponent } from "../components/ui/health-ui-component";
import { SCENE_KEYS } from "./_scene-keys";
import { UI_CONFIG } from "../lib/config";
import { EVENT_BUS, CUSTOM_EVENTS, type HealthChanged, type GameOver, type KeyPressed } from "../lib/event-bus";
import { IMAGE_ASSETS } from "../lib/assets";
import { addClickSoundToObject, playClickSound, playResultSound } from "../lib/sound-utils";
import { MusicButton } from "../components/ui/music-button";
import { LanguageManager } from "../lib/language-manager";

export type UISceneData = {
  health?: { current: number; max: number; decayRate?: number };
  score?: number;
  gameActive?: boolean;
};

export class UIScene extends Phaser.Scene {
  #healthUI!: HealthUIComponent;
  #scoreText!: Phaser.GameObjects.Text;
  #gameOverContainer!: Phaser.GameObjects.Container;
  #gameOverTitleText!: Phaser.GameObjects.Text;
  #costumeImage!: Phaser.GameObjects.Image;
  #teaserText1!: Phaser.GameObjects.Text;
  #teaserText2!: Phaser.GameObjects.Text;
  #storeButtonContainer!: Phaser.GameObjects.Container;
  #controlsContainer!: Phaser.GameObjects.Container;
  #isRestarting: boolean = false;
  #finalScore: number = 0;
  #turnButton!: Phaser.GameObjects.Container;
  #moveButton!: Phaser.GameObjects.Container;
  #attackButton!: Phaser.GameObjects.Container;
  // 바운드 핸들러 — 등록/해제 시 동일 참조 보장
  readonly #onKeyPressed = (data: KeyPressed) => this.triggerButtonAnimation(data.key);
  private lang = LanguageManager.getInstance();

  constructor() {
    super(SCENE_KEYS.UI_SCENE);
  }

  create(): void {
    this.#createHealthUI();
    this.#createScoreUI();
    this.#createMusicButton();
    this.#createGameOverUI();
    this.#createMobileControls();
    this.#setupEventListeners();
  }

  #createHealthUI(): void {
    this.#healthUI = new HealthUIComponent(this, {
      x: 20,
      y: 30,
      width: 300,
      height: 20,
      showDecayRate: false,
    });
  }

  #createScoreUI(): void {
    this.#scoreText = this.add.text(20, 50, this.lang.t("score") + ": 0", {
      fontSize: UI_CONFIG.fonts.sizes.small,
      color: UI_CONFIG.colors.light,
      stroke: UI_CONFIG.colors.background,
      strokeThickness: 4,
      fontFamily: UI_CONFIG.fonts.family.default,
    });
    this.#scoreText.setDepth(100);
  }

  #playButtonTween(target: Phaser.GameObjects.Container): void {
    this.tweens.add({
      targets: target,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 50,
      yoyo: true,
      ease: "Power1",
    });
  }

  #createControlButton(
    x: number,
    y: number,
    imageKey: string,
    labelText: string,
    onDown: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const button = this.add
      .image(0, 0, imageKey)
      .setScale(0.6)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        onDown();
        this.#playButtonTween(container);
      })
      .on("pointerover", () => button.setTint(0xcccccc))
      .on("pointerout", () => button.clearTint());

    const label = this.add
      .text(0, -button.displayHeight / 2 - 15, labelText, {
        fontSize: UI_CONFIG.fonts.sizes.small,
        color: UI_CONFIG.colors.light,
        backgroundColor: UI_CONFIG.colors.dark,
        padding: { x: 5, y: 2 },
        fontFamily: UI_CONFIG.fonts.family.default,
      })
      .setOrigin(0.5);

    container.add([button, label]);
    return container;
  }

  #createMobileControls(): void {
    // Create controls container
    this.#controlsContainer = this.add.container(0, 0);
    this.#controlsContainer.setDepth(200);

    // Responsive sizing based on screen dimensions
    const screenWidth = this.scale.width;
    const screenHeight = this.scale.height;
    const scale = Math.min(screenWidth / 400, screenHeight / 300); // Base scale factor

    const buttonSpacing = Math.max(80, 120 * scale);
    const baseY = screenHeight * 0.8;
    const centerX = screenWidth / 2;

    // A Button (Turn + Move) - Left side
    this.#turnButton = this.#createControlButton(
      centerX - buttonSpacing,
      baseY,
      IMAGE_ASSETS.TURN_BUTTON.key,
      this.lang.t("turnButton"),
      () => this.#onTurnButtonPressed(),
    );

    // S Button (Move Forward) - Center
    this.#moveButton = this.#createControlButton(
      centerX,
      baseY,
      IMAGE_ASSETS.ARROW_BUTTON.key,
      this.lang.t("moveButton"),
      () => this.#onMoveButtonPressed(),
    );

    // D Button (Attack) - Right side
    this.#attackButton = this.#createControlButton(
      centerX + buttonSpacing,
      baseY,
      IMAGE_ASSETS.ATTACK_BUTTON.key,
      this.lang.t("attackButton"),
      () => this.#onAttackButtonPressed(),
    );

    // Add all elements to container
    this.#controlsContainer.add([this.#turnButton, this.#moveButton, this.#attackButton]);

    // Show controls immediately for debugging
    this.#controlsContainer.setVisible(true);
  }

  #createMusicButton(): void {
    new MusicButton(this, this.scale.width - 50, 50);
  }

  #getStoreLinks(): { googlePlay: string; appStore: string } {
    const isKorean = this.lang.isKorean();

    return {
      googlePlay: isKorean
        ? "https://svl-wanted-kr.supervlabs.io/v1r2ix"
        : "https://svl-wanted-gl.supervlabs.io/tyvfp7",
      appStore: isKorean ? "https://svl-wanted-kr.supervlabs.io/n84est" : "https://svl-wanted-gl.supervlabs.io/a3w8ra",
    };
  }

  #getStoreButtonAssets(): { googlePlayAsset: string; appStoreAsset: string } {
    const isKorean = this.lang.isKorean();

    return {
      googlePlayAsset: isKorean ? IMAGE_ASSETS.GOOGLE_PLAY_KO_BUTTON.key : IMAGE_ASSETS.GOOGLE_PLAY_BUTTON.key,
      appStoreAsset: isKorean ? IMAGE_ASSETS.APP_STORE_KO_BUTTON.key : IMAGE_ASSETS.APP_STORE_BUTTON.key,
    };
  }

  // Button handler methods
  #onTurnButtonPressed(): void {
    EVENT_BUS.emit("MOBILE_INPUT_TURN");
  }

  #onMoveButtonPressed(): void {
    EVENT_BUS.emit("MOBILE_INPUT_MOVE");
  }

  #onAttackButtonPressed(): void {
    EVENT_BUS.emit("MOBILE_INPUT_ATTACK");
  }

  #createGameOverUI(): void {
    // Game Over Container (hidden by default)
    this.#gameOverContainer = this.add.container(this.scale.width / 2, this.scale.height / 2);
    this.#gameOverContainer.setDepth(1000);
    this.#gameOverContainer.setVisible(false);

    // Background overlay - make it interactive for touch restart
    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7);
    overlay.setOrigin(0.5);
    overlay.setInteractive({ useHandCursor: true });
    overlay.on("pointerdown", () => {
      playClickSound(this);
      // Only allow restart when game over container is visible (actual game over state)
      if (this.#gameOverContainer.visible && !this.#isRestarting) {
        this.#handleRestart();
      }
    });

    // Game Over text
    this.#gameOverTitleText = this.add.text(0, -200, this.lang.t("gameOver"), {
      fontSize: UI_CONFIG.fonts.sizes.large,
      color: UI_CONFIG.colors.danger,
      stroke: UI_CONFIG.colors.background,
      strokeThickness: 6,
      fontFamily: UI_CONFIG.fonts.family.default,
      align: "center",
    });
    this.#gameOverTitleText.setOrigin(0.5);

    // Button container
    const buttonContainer = this.add.container(0, 30);

    // Restart button
    const restartButton = this.#createGameOverButton(
      -150,
      0,
      IMAGE_ASSETS.REPLAY_BUTTON.key,
      this.lang.t("restart"),
      () => this.#handleRestart(),
    );

    // Home button (return to title)
    const homeButton = this.#createGameOverButton(0, 0, IMAGE_ASSETS.HOME_BUTTON.key, this.lang.t("home"), () => {
      this.scene.stop(SCENE_KEYS.GAME_SCENE);
      this.scene.stop(SCENE_KEYS.UI_SCENE);
      this.scene.start(SCENE_KEYS.TITLE_SCENE);
    });

    // Share button
    const shareButton = this.#createGameOverButton(150, 0, IMAGE_ASSETS.SHARE_BUTTON.key, this.lang.t("share"), () =>
      this.#handleShare(),
    );

    // Add buttons to button container
    buttonContainer.add([restartButton, homeButton, shareButton]);

    // Store buttons container (below main buttons, moved lower)
    const storeButtonContainer = this.add.container(0, 280);

    // Get language-specific store links and button assets
    const storeLinks = this.#getStoreLinks();
    const storeAssets = this.#getStoreButtonAssets();

    // Google Play button with language-specific asset
    const googlePlayButton = this.#createStoreButton(-125, 0, storeAssets.googlePlayAsset, () =>
      this.#handleStoreLink(storeLinks.googlePlay),
    );

    // App Store button with language-specific asset
    const appStoreButton = this.#createStoreButton(125, 0, storeAssets.appStoreAsset, () =>
      this.#handleStoreLink(storeLinks.appStore),
    );

    // Add store buttons to store container
    storeButtonContainer.add([googlePlayButton, appStoreButton]);
    this.#storeButtonContainer = storeButtonContainer;

    // Costume preview image (will be conditionally shown)
    this.#costumeImage = this.add.image(-190, 150, IMAGE_ASSETS.COSTUME_PREVIEW.key).setScale(0.3).setOrigin(0.5);
    this.#costumeImage.setVisible(false); // Initially hidden

    // Hello text below store buttons
    this.#teaserText1 = this.add.text(0, 160, this.lang.t("teaserText1"), {
      fontSize: UI_CONFIG.fonts.sizes.medium,
      color: UI_CONFIG.colors.light,
      stroke: UI_CONFIG.colors.background,
      strokeThickness: 4,
      fontFamily: UI_CONFIG.fonts.family.default,
      align: "center",
    });
    this.#teaserText1.setOrigin(0.5);

    this.#teaserText2 = this.add.text(0, 210, this.lang.t("teaserText2"), {
      fontSize: UI_CONFIG.fonts.sizes.medium,
      color: UI_CONFIG.colors.light,
      stroke: UI_CONFIG.colors.background,
      strokeThickness: 4,
      fontFamily: UI_CONFIG.fonts.family.default,
      align: "center",
    });
    this.#teaserText2.setOrigin(0.5);

    // Add to main container
    this.#gameOverContainer.add([
      overlay,
      this.#gameOverTitleText,
      buttonContainer,
      this.#costumeImage,
      this.#teaserText1,
      this.#teaserText2,
      storeButtonContainer,
    ]);
  }

  #createGameOverButton(
    x: number,
    y: number,
    texture: string,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const button = this.add.image(0, 0, texture).setScale(0.4).setInteractive({ useHandCursor: true });

    button.on("pointerdown", () => {
      onClick();
      this.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 50,
        yoyo: true,
        ease: "Power1",
      });
    });
    addClickSoundToObject(button, this);
    button.on("pointerover", () => button.setTint(0xcccccc)).on("pointerout", () => button.clearTint());

    const buttonLabel = this.add
      .text(0, -button.displayHeight / 2 - 15, label, {
        fontSize: UI_CONFIG.fonts.sizes.small,
        color: UI_CONFIG.colors.light,
        backgroundColor: UI_CONFIG.colors.dark,
        padding: { x: 5, y: 2 },
        fontFamily: UI_CONFIG.fonts.family.default,
      })
      .setOrigin(0.5);

    container.add([button, buttonLabel]);
    return container;
  }

  #createStoreButton(x: number, y: number, texture: string, onClick: () => void): Phaser.GameObjects.Image {
    const button = this.add.image(x, y, texture).setScale(0.7).setInteractive({ useHandCursor: true });

    button.on("pointerdown", () => {
      this.tweens.add({
        targets: button,
        scaleX: 0.65,
        scaleY: 0.65,
        duration: 50,
        yoyo: true,
        ease: "Power1",
      });
    });

    button.on("pointerup", () => {
      onClick();
    });
    addClickSoundToObject(button, this);
    button.on("pointerover", () => button.setTint(0xcccccc)).on("pointerout", () => button.clearTint());

    return button;
  }

  #handleShare(): void {
    const shareText = this.lang.t("shareText", { score: this.#finalScore.toString() });

    if (navigator.share) {
      navigator.share({
        title: this.lang.t("shareTitle"),
        text: shareText,
        url: window.location.href,
      });
    } else {
      alert(this.lang.t("sharingNotSupported"));
    }
  }

  #handleStoreLink(url: string): void {
    try {
      window.open(url, "_blank");
    } catch {
      window.location.href = url;
    }
  }

  #setupEventListeners(): void {
    // Listen for events from Game Scene via EVENT_BUS
    EVENT_BUS.on(CUSTOM_EVENTS.HEALTH_CHANGED, this.#handleHealthChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.SCORE_CHANGED, this.#handleScoreChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.GAME_OVER, this.#handleGameOver, this);
    EVENT_BUS.on(CUSTOM_EVENTS.GAME_STARTED, this.#handleGameStart, this);
    EVENT_BUS.on("GAME_RESET_UI", this.#handleUIReset, this);
    EVENT_BUS.on(CUSTOM_EVENTS.KEY_PRESSED, this.#onKeyPressed);

    // Handle restart input - only when game over screen is visible
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      // Only allow restart when game over container is visible (actual game over state)
      if (this.#gameOverContainer.visible && !this.#isRestarting) {
        if (event.code === "Enter" || event.code === "Space") {
          this.#handleRestart();
        }
      }
    });

    // Clean up event listeners when scene shuts down
    this.events.once("shutdown", () => {
      EVENT_BUS.off(CUSTOM_EVENTS.HEALTH_CHANGED, this.#handleHealthChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.SCORE_CHANGED, this.#handleScoreChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.GAME_OVER, this.#handleGameOver, this);
      EVENT_BUS.off(CUSTOM_EVENTS.GAME_STARTED, this.#handleGameStart, this);
      EVENT_BUS.off("GAME_RESET_UI", this.#handleUIReset, this);
      EVENT_BUS.off(CUSTOM_EVENTS.KEY_PRESSED, this.#onKeyPressed);
    });
  }

  #handleUIReset(): void {
    // Set restarting flag
    this.#isRestarting = true;

    // Reset UI state to prepare for restart
    this.#gameOverContainer.setVisible(false);
    this.#controlsContainer.setVisible(false);

    // Reset UI elements
    this.#scoreText.setText(`${this.lang.t("score")}: 0`);
    this.#healthUI.updateHealth(100, 100, 0);
  }

  #handleHealthChanged(data: HealthChanged): void {
    this.#healthUI.updateHealth(data.health, data.maxHealth, data.decayRate);
  }

  #handleScoreChanged(score: number): void {
    this.#scoreText.setText(`${this.lang.t("score")}: ${score}`);
  }

  #handleGameStart(): void {
    playResultSound(this);

    // Reset restart flag and activate game
    this.#isRestarting = false;
    this.#gameOverContainer.setVisible(false);
    this.#controlsContainer.setVisible(true);
  }

  #handleGameOver(data: GameOver): void {
    this.#gameOverContainer.setVisible(true);
    this.#controlsContainer.setVisible(false); // Hide mobile controls

    if (data.score !== undefined) {
      this.#finalScore = data.score;
    }

    // Show costume image if score is 300 or higher
    if (data.score !== undefined && data.score >= 300) {
      this.#costumeImage.setVisible(true);
      this.#teaserText1.setY(140);
      this.#teaserText2.setY(240);
      this.#storeButtonContainer.setY(350);
      this.#teaserText1.setText(this.lang.t("teaserText3"));
      this.#teaserText2.setText(this.lang.t("teaserText4"));
    } else {
      this.#costumeImage.setVisible(false);
      this.#teaserText1.setY(160);
      this.#teaserText2.setY(210);
      this.#teaserText1.setText(this.lang.t("teaserText1"));
      this.#teaserText2.setText(this.lang.t("teaserText2"));
    }

    // Update game over text with reason and score
    if (data.reason || data.score !== undefined) {
      const reasonText = data.reason ? `\n${data.reason}` : "";
      const scoreText = data.score !== undefined ? `\n${this.lang.t("finalScore")}: ${data.score}` : "";
      this.#gameOverTitleText.setText(`${this.lang.t("gameOver")}${reasonText}${scoreText}`);
      this.#gameOverTitleText.setLineSpacing(10);
    }

    // iframe 부모 창으로 게임오버 + 점수 전송 (동일 origin만 허용)
    try {
      window.parent.postMessage({ type: 'GAME_OVER', score: this.#finalScore }, window.location.origin);
    } catch {
      // standalone 실행 시 무시
    }
  }

  #handleRestart(): void {
    // Prevent multiple restart requests
    if (this.#isRestarting) {
      return;
    }

    // Set restarting flag immediately
    this.#isRestarting = true;

    // Reset game state first

    // Hide game over UI
    this.#gameOverContainer.setVisible(false);

    // Show mobile controls again
    this.#controlsContainer.setVisible(true);

    // Reset UI elements
    this.#scoreText.setText(`${this.lang.t("score")}: 0`);
    this.#healthUI.updateHealth(100, 100, 0);

    // Tell Game Scene to restart via EVENT_BUS
    EVENT_BUS.emit(CUSTOM_EVENTS.GAME_RESTART_REQUESTED);
  }

  public triggerButtonAnimation(buttonType: "turn" | "move" | "attack"): void {
    let targetButton: Phaser.GameObjects.Container | undefined;

    switch (buttonType) {
      case "turn":
        targetButton = this.#turnButton;
        break;
      case "move":
        targetButton = this.#moveButton;
        break;
      case "attack":
        targetButton = this.#attackButton;
        break;
    }

    if (targetButton) {
      this.#playButtonTween(targetButton);
    }
  }

  public shutdown(): void {
    this.#healthUI?.destroy();
  }
}
