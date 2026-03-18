export type SpineAsset = {
  dataKey: string;
  atlasKey: string;
  atlasPath: string;
  jsonPath: string;
  texturePath: string;
};

export type ImageAsset = {
  key: string;
  path: string;
};

export type AudioAsset = {
  key: string;
  path: string;
};

export const CHARACTER_ANIMATIONS = {
  WALK_LEFT: "WALK_LEFT",
  WALK_RIGHT: "WALK_RIGHT",
  IDLE_LEFT: "IDLE_LEFT",
  IDLE_RIGHT: "IDLE_RIGHT",
  TRANSITION_READY: "TRANSITION_READY",
  TRANSITION_JUMP: "TRANSITION_JUMP",
  HURT_LEFT: "HURT_LEFT",
  HURT_RIGHT: "HURT_RIGHT",
  DIE_LEFT: "DIE_LEFT",
  DIE_RIGHT: "DIE_RIGHT",
  ANGRY_LEFT: "ANGRY_LEFT",
  ANGRY_RIGHT: "ANGRY_RIGHT",
  ATTACK_LEFT: "ATTACK_LEFT",
  ATTACK_RIGHT: "ATTACK_RIGHT",
} as const;

export const ENEMY_ANIMATION_KEYS = {
  IDLE_LEFT: "idle",
  IDLE_RIGHT: "idle",
  ATTACK_LEFT: "knockback",
  ATTACK_RIGHT: "knockback",
  HURT_LEFT: "knockback",
  HURT_RIGHT: "knockback",
  DIE_LEFT: "knockback",
  DIE_RIGHT: "knockback",
} as const;

export const PLAYER_ANIMATION_KEYS = {
  IDLE_LEFT: "idle",
  IDLE_RIGHT: "idle",
  WALK_LEFT: "run_1",
  WALK_RIGHT: "run_2",
  HURT_LEFT: "knockback",
  HURT_RIGHT: "knockback",
  ATTACK_LEFT: "attack_melee_1",
  ATTACK_RIGHT: "attack_melee_1",
  DIE_LEFT: "die",
  DIE_RIGHT: "die",
  TRANSITION_READY: "attack_melee_3",
  TRANSITION_JUMP: "run_1",
  ANGRY_LEFT: "expression_angry_2",
  ANGRY_RIGHT: "expression_angry_2",
} as const;

export const PLAYER_SKIN_LIST = [
  "skin_female_089",
  "skin_female_090",
  "skin_female_101",
  "skin_female_102",
  "skin_female_103",
  "skin_female_104",
  "skin_female_105",
  "skin_female_106",
  "skin_male_089",
  "skin_male_090",
  "skin_male_101",
  "skin_male_102",
  "skin_male_103",
  "skin_male_104",
  "skin_male_105",
  "skin_male_106",
] as const;

export const IMAGE_ASSETS: { [key: string]: ImageAsset } = {
  BG1: { key: "bg1", path: "assets/background/1.webp" },
  BG2: { key: "bg2", path: "assets/background/2.webp" },
  TITLE: { key: "title", path: "assets/background/title.webp" },
  STAIR: { key: "stair", path: "assets/object/stair.webp" },
  SHADOW: { key: "shadow", path: "assets/object/shadow.webp" },
  TURN_BUTTON: { key: "turn_button", path: "assets/button/turn.webp" },
  ATTACK_BUTTON: { key: "attack_button", path: "assets/button/attack.webp" },
  SHARE_BUTTON: { key: "share_button", path: "assets/button/share.webp" },
  RANDOM_BUTTON: { key: "random_button", path: "assets/button/random.webp" },
  ARROW_BUTTON: { key: "arrow_button", path: "assets/button/arrow.webp" },
  REPLAY_BUTTON: { key: "replay_button", path: "assets/button/replay.webp" },
  HOME_BUTTON: { key: "home_button", path: "assets/button/home.webp" },
  MUSIC_BUTTON: { key: "music_button", path: "assets/button/music.webp" },
  GOOGLE_PLAY_BUTTON: { key: "google_play_button", path: "assets/button/google-play.webp" },
  APP_STORE_BUTTON: { key: "app_store_button", path: "assets/button/app-store.webp" },
  GOOGLE_PLAY_KO_BUTTON: { key: "google_play_ko_button", path: "assets/button/google-play-ko.webp" },
  APP_STORE_KO_BUTTON: { key: "app_store_ko_button", path: "assets/button/app-store-ko.webp" },
  COSTUME_PREVIEW: { key: "costume_preview", path: "assets/costume/carrot-fighter.webp" },
} as const;

export const AUDIO_ASSETS: { [key: string]: AudioAsset } = {
  BGM: { key: "bgm", path: "assets/music/bgm.mp3" },
  ATTACK: { key: "attack", path: "assets/music/attack.mp3" },
  CLICK: { key: "click", path: "assets/music/click.mp3" },
  CLIMB: { key: "climb", path: "assets/music/climb.mp3" },
  DEATH: { key: "death", path: "assets/music/death.mp3" },
  RESULT: { key: "result", path: "assets/music/result.mp3" },
  ENEMY_DEATH: { key: "enemy_death", path: "assets/music/enemy-death.mp3" },
} as const;

export const FONT_ASSETS = {
  NETMARBLE_B: { key: "netmarble_b", path: "assets/font/netmarble-b.woff2" },
} as const;

export const SPINE_ASSETS: { [key: string]: SpineAsset } = {
  HUMAN: {
    dataKey: "human_type-json",
    atlasKey: "human_type-atlas",
    jsonPath: "assets/spine/human_type.json",
    atlasPath: "assets/spine/human_type.atlas.txt",
    texturePath: "assets/spine/human_type.png",
  },
  ENEMY_BUNNYBOT: {
    dataKey: "enemy_bunnybot",
    atlasKey: "enemy_bunnybot_atlas",
    jsonPath: "assets/spine/enemy_bunnybot.json",
    atlasPath: "assets/spine/enemy_bunnybot.atlas",
    texturePath: "assets/spine/enemy_bunnybot.png",
  },
} as const;
