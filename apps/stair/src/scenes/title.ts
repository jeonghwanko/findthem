import { KeyboardComponent } from "../components/input/keyboard-component";
import { Player } from "../game-objects/player/player";
import { IMAGE_ASSETS, PLAYER_SKIN_LIST } from "../lib/assets";
import { UI_CONFIG } from "../lib/config";
import { DataManager } from "../lib/data-manager";
import { playClickSound } from "../lib/sound-utils";
import { StairManager } from "../managers/stair-manager";
import { SCENE_KEYS } from "./_scene-keys";
import { MusicButton } from "../components/ui/music-button";
import { LanguageManager } from "../lib/language-manager";

export class TitleScene extends Phaser.Scene {
  #background!: Phaser.GameObjects.Image;
  #controls!: KeyboardComponent;
  #player!: Player;
  #isTransitioning = false;
  #currentSkinIndex = 0;
  #leftButton!: Phaser.GameObjects.Image;
  #rightButton!: Phaser.GameObjects.Image;
  #randomButton!: Phaser.GameObjects.Image;
  /** URL ?skin= 파라미터로 외부에서 지정된 스킨. 지정 시 버튼 숨김 */
  #presetSkin: string | null = null;
  private lang = LanguageManager.getInstance();

  constructor() {
    super(SCENE_KEYS.TITLE_SCENE);
  }

  init() {
    this.#isTransitioning = false;
    // URL 쿼리 파라미터에서 skin 읽기
    const params = new URLSearchParams(window.location.search);
    const skinParam = params.get("skin");
    this.#presetSkin = skinParam && (PLAYER_SKIN_LIST as readonly string[]).includes(skinParam) ? skinParam : null;
  }

  create() {
    this.#controls = new KeyboardComponent(this.input.keyboard!);
    this.#controls.isMovementLocked = true;

    // 외부에서 스킨이 지정된 경우 DataManager에 미리 적용
    if (this.#presetSkin) {
      DataManager.instance.updatePlayerSkin(this.#presetSkin as (typeof PLAYER_SKIN_LIST)[number]);
    }

    this.#currentSkinIndex = PLAYER_SKIN_LIST.indexOf(DataManager.instance.data.skin);

    this.#createBackground();
    this.#createCharacter();
    this.#createUI();
    this.#setupInput();

    // Add music button to top-right corner
    new MusicButton(this, this.scale.width - 50, 50);
  }

  #createBackground(): void {
    // 배경 이미지
    this.#background = this.add.image(0, 0, IMAGE_ASSETS.BG1.key).setOrigin(0);

    // 화면 크기에 맞게 스케일 조정
    const scaleX = this.scale.width / this.#background.width;
    const scaleY = this.scale.height / this.#background.height;
    const scale = Math.max(scaleX, scaleY);
    this.#background.setScale(scale);
    this.#background.postFX.addBlur(2, 0.5, 0.5, 1);
  }

  #createCharacter(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.#player = new Player({
      scene: this,
      position: { x: centerX, y: centerY },
      controls: this.#controls,
      stairManager: new StairManager(),
    });
  }

  #createUI(): void {
    const centerX = this.scale.width / 2;

    // Use title image instead of text
    const titleImage = this.add.image(centerX, this.scale.height * 0.15, IMAGE_ASSETS.TITLE.key).setOrigin(0.5);

    // Scale the title image to fit nicely on screen
    titleImage.setScale(0.5);

    // Skin selection UI — 외부 스킨 지정 시 버튼 숨김
    const buttonY = this.scale.height * 0.6;
    const buttonSpacing = 150;
    const buttonScale = 0.5;
    const showButtons = !this.#presetSkin;

    this.#leftButton = this.#createButton(
      centerX - buttonSpacing,
      buttonY,
      IMAGE_ASSETS.ARROW_BUTTON.key,
      () => {
        this.#currentSkinIndex = (this.#currentSkinIndex - 1 + PLAYER_SKIN_LIST.length) % PLAYER_SKIN_LIST.length;
        this.#updateSkin();
      },
      buttonScale,
      showButtons,
    );

    this.#randomButton = this.#createButton(
      centerX,
      buttonY,
      IMAGE_ASSETS.RANDOM_BUTTON.key,
      () => {
        this.#currentSkinIndex = Math.floor(Math.random() * PLAYER_SKIN_LIST.length);
        this.#updateSkin();
      },
      buttonScale,
      showButtons,
    );

    this.#rightButton = this.#createButton(
      centerX + buttonSpacing,
      buttonY,
      IMAGE_ASSETS.ARROW_BUTTON.key,
      () => {
        this.#currentSkinIndex = (this.#currentSkinIndex + 1) % PLAYER_SKIN_LIST.length;
        this.#updateSkin();
      },
      buttonScale,
      showButtons,
    );
    this.#rightButton.scaleX *= -1;

    const startText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.8, this.lang.t("startInstruction"), {
        fontSize: UI_CONFIG.fonts.sizes.large,
        color: UI_CONFIG.colors.success,
        fontFamily: UI_CONFIG.fonts.family.default,
        stroke: UI_CONFIG.colors.dark,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0.2,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  #createButton(
    x: number,
    y: number,
    texture: string,
    onClick: () => void,
    baseScale = 0.5,
    visible = true,
  ): Phaser.GameObjects.Image {
    const button = this.add.image(x, y, texture).setScale(baseScale).setVisible(visible);

    if (visible) {
      button.setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => {
        onClick();

        this.tweens.add({
          targets: button,
          scaleX: button.scaleX * 0.9,
          scaleY: button.scaleY * 0.9,
          duration: 50,
          yoyo: true,
          ease: "Power1",
        });
      });
      button.on("pointerover", () => button.setTint(0xcccccc)).on("pointerout", () => button.clearTint());
    }

    return button;
  }

  #updateSkin(): void {
    const newSkinName = this.#getSkinName();
    this.#player.setSkin(newSkinName);
  }

  #getSkinName(): string {
    return PLAYER_SKIN_LIST[this.#currentSkinIndex];
  }

  #setupInput(): void {
    this.input.keyboard?.on("keydown", this.#startGame, this);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      playClickSound(this);
      // 버튼이 보이는 경우에만 버튼 영역 제외, 숨긴 경우엔 어디나 클릭 가능
      const clickedButton =
        !this.#presetSkin &&
        (this.#leftButton.getBounds().contains(pointer.x, pointer.y) ||
          this.#rightButton.getBounds().contains(pointer.x, pointer.y) ||
          this.#randomButton.getBounds().contains(pointer.x, pointer.y));

      if (!clickedButton) {
        this.#startGame();
      }
    });
  }

  #startGame(): void {
    if (this.#isTransitioning) {
      return;
    }
    this.#isTransitioning = true;

    // Remove event listeners to prevent them from firing again
    this.input.off("pointerdown");
    this.input.keyboard?.off("keydown");

    this.#player.transitionToScene(() => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENE_KEYS.GAME_SCENE);
      });
    });
  }
}
