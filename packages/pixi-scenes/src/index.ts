// Game engine (Pixi.js + Spine)
export {
  SpineCharacterLite,
  setSpineLoadProgress,
  computeLayout,
  drawScene,
  roomCenter,
  tileToPixel,
  type RoomLayout,
} from './game/index';

// React components (UI overlays)
export {
  HeroLoadingOverlay,
  StatsStrip,
  AgentWorldScene,
  AgentActivityOverlay,
} from './components/index';

// Audio
export { getBgmEngine, type BgmEngine } from './audio/BgmEngine';
