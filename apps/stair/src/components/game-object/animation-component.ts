import type { SpineGameObject } from "@esotericsoftware/spine-phaser-v3";
import { type CharacterAnimation, type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export type AnimationConfig = {
  [key in CharacterAnimation]?: {
    key: string;
    repeat: number;
    timeScale: number;
    ignoreIfPlaying: boolean;
  };
};

export class AnimationComponent extends BaseGameObjectComponent {
  declare protected gameObject: SpineGameObject;

  #config: AnimationConfig;

  constructor(gameObject: GameObject, config: AnimationConfig) {
    super(gameObject);
    this.#config = config;
  }

  public getAnimationKey(characterAnimationKey: CharacterAnimation): string | undefined {
    return this.#config[characterAnimationKey]?.key;
  }

  public playAnimation(characterAnimationKey: CharacterAnimation, callback?: () => void): void {
    this.#play(characterAnimationKey, callback);
  }

  public isAnimationPlaying(): boolean {
    const currentTrack = this.gameObject.animationState.getCurrent(0);
    if (!currentTrack) {
      return false;
    }

    if (currentTrack.loop) {
      return true;
    }

    return currentTrack.trackTime < currentTrack.animationEnd;
  }

  #play(characterAnimationKey: CharacterAnimation, callback?: () => void): void {
    const animationDetails = this.#config[characterAnimationKey];
    if (!animationDetails) {
      if (callback) {
        callback();
      }
      return;
    }

    const { key: animationName, repeat, ignoreIfPlaying, timeScale } = animationDetails;
    const currentTrack = this.gameObject.animationState.getCurrent(0);

    if (
      ignoreIfPlaying &&
      currentTrack &&
      currentTrack.animation?.name === animationName &&
      currentTrack.timeScale === timeScale
    ) {
      return;
    }

    const loop = repeat === -1;
    const trackEntry = this.gameObject.animationState.setAnimation(0, animationName, loop);
    trackEntry.timeScale = timeScale;

    if (callback) {
      trackEntry.listener = {
        complete: () => {
          callback();
        },
      };
    }
  }
}
