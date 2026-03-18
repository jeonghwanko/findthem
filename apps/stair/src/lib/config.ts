export const ENABLE_LOGGING = false;

export const PLAYER_START_MAX_HEALTH = 100;
export const PLAYER_DEFAULT_SCALE = 0.4;

// Player physics body configuration
export const PLAYER_PHYSICS = {
  width: 200,
  height: 320,
  offsetX: -100,
  offsetY: -320,
} as const;

export const SCENE_CONFIG = {
  width: 720,
  height: 1000,
  spinePlugin: "SpinePlugin",
};

// Stair generation configuration
export const STAIR_CONFIG = {
  // Stair dimensions
  width: 120,
  height: 40,

  // Gap settings
  gapX: 100, // Horizontal gap for movement (same as width)
  gapY: 60, // Vertical gap between stairs (height * 2)

  // World settings
  worldWidth: 3000,

  // Generation settings
  initialCount: 30, // Number of stairs to generate initially
  bufferSize: 60, // Maximum number of stairs to keep in memory
  generationThreshold: 30, // Generate new stairs when player is this many stairs away from the end
  cleanupThreshold: 20, // Remove stairs that are this many steps behind the player

  // Direction settings
  edgeBuffer: 200, // Minimum distance from world edges
} as const;

// Gameplay configuration
export const GAMEPLAY_CONFIG = {
  score: {
    pointsPerStair: 10,
  },
  camera: {
    bounds: {
      y: -10000,
      height: 20000,
    },
    lerp: {
      x: 0.1,
      y: 0.1,
    },
  },
  background: {
    parallax: {
      x: 0.1,
      y: 0.2,
    },
  },
  enemy: {
    // Enemy가 생성되기 시작하는 최소 계단 인덱스 (50개 계단 이후부터)
    startStairIndex: 10,
    // Enemy 생성 확률 (10%)
    spawnChance: 0.1,
    // 같은 방향으로 연속된 계단에서만 Enemy 생성
    requireConsecutiveDirection: true,
    // Enemy들 사이의 최소 거리 (계단 개수)
    minDistanceBetweenEnemies: 10,
  },
} as const;

export const UI_CONFIG = {
  fonts: {
    sizes: {
      small: SCENE_CONFIG.height * 0.02,
      medium: SCENE_CONFIG.height * 0.03,
      large: SCENE_CONFIG.height * 0.04,
      xlarge: SCENE_CONFIG.height * 0.05,
    },
    family: {
      default: "netmarble_b",
    },
  },

  colors: {
    primary: "#6366f1",
    secondary: "#64748b",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#06b6d4",
    light: "#f1f5f9",
    dark: "#0f172a",
    background: "#1e293b",
  },
};
