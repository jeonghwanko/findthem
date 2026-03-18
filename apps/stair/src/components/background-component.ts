import { IMAGE_ASSETS } from "../lib/assets";

type ParallaxConfig = {
  x: number;
  y: number;
};

export class BackgroundComponent {
  #tileSprite: Phaser.GameObjects.TileSprite;
  #targetX: number = 0;
  #targetY: number = 0;
  #lerp: number = 0.08; // Smoothing factor, smaller is smoother
  #parallax: ParallaxConfig;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    parallax: ParallaxConfig,
    initialPlayerX: number,
    initialPlayerY: number,
  ) {
    this.#tileSprite = scene.add.tileSprite(0, 0, width, height, IMAGE_ASSETS.BG2.key);
    this.#tileSprite.setOrigin(0, 0);
    this.#tileSprite.setScrollFactor(0);
    this.#parallax = parallax;

    // Calculate and set initial position to prevent startup movement
    const startTileX = -initialPlayerX * this.#parallax.x;
    const startTileY = initialPlayerY * this.#parallax.y;

    this.#tileSprite.setTilePosition(startTileX, startTileY);

    // Initialize targets to the same starting position
    this.#targetX = startTileX;
    this.#targetY = startTileY;
  }

  public updateParallaxScrolling(playerX: number, playerY: number): void {
    // Set target position based on player coordinates and parallax factors
    this.#targetX = -playerX * this.#parallax.x;
    this.#targetY = playerY * this.#parallax.y;

    // Smoothly interpolate the tile position towards the target
    this.#tileSprite.tilePositionX += (this.#targetX - this.#tileSprite.tilePositionX) * this.#lerp;
    this.#tileSprite.tilePositionY += (this.#targetY - this.#tileSprite.tilePositionY) * this.#lerp;
  }

  public destroy(): void {
    this.#tileSprite.destroy();
  }
}
