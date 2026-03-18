import "@esotericsoftware/spine-phaser-v3";

declare module "@esotericsoftware/spine-phaser-v3" {
  interface SpineGameObject {
    [key: `_${string}`]: unknown;
  }
}
