import { requirementForSponsorLevel } from '@findthem/shared';

/**
 * XP Animation Utilities
 *
 * Calculates animation steps for XP gain and level up sequences.
 * Ported from pryzm — adapted to use FindThem's requirementForSponsorLevel.
 */
export interface XPAnimationStep {
  type: 'xp-gain' | 'level-up';
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  xpGain: number;
  newLevel?: number;
}

const MAX_LEVEL = 500;

function getLevelXPRequirement(level: number): number {
  if (level <= 0) return requirementForSponsorLevel(1);
  if (level >= MAX_LEVEL) return 0;
  return requirementForSponsorLevel(level);
}

/**
 * Calculate animation steps for XP gain
 *
 * Example: Level 1, 500/1000 XP, gaining 1500 XP
 * Steps:
 * 1. xp-gain: 500 → 1000 (500 XP)
 * 2. level-up: 1 → 2
 * 3. xp-gain: 0 → 1000 (1000 XP)
 */
export function calculateXPAnimationSteps(
  startLevel: number,
  startXP: number,
  totalXPToAdd: number,
): XPAnimationStep[] {
  if (!Number.isFinite(totalXPToAdd) || totalXPToAdd <= 0) return [];

  const steps: XPAnimationStep[] = [];
  let currentLevel = startLevel;
  let currentXP = startXP;
  let remainingXP = totalXPToAdd;

  let iterations = 0;
  const MAX_ITERATIONS = 20;

  while (remainingXP > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    const xpToNextLevel = getLevelXPRequirement(currentLevel);
    if (xpToNextLevel === 0) break;

    const xpNeededForLevelUp = xpToNextLevel - currentXP;

    if (remainingXP >= xpNeededForLevelUp) {
      steps.push({
        type: 'xp-gain',
        level: currentLevel,
        currentXP,
        xpToNextLevel,
        xpGain: xpNeededForLevelUp,
      });

      steps.push({
        type: 'level-up',
        level: currentLevel,
        currentXP: xpToNextLevel,
        xpToNextLevel,
        xpGain: 0,
        newLevel: currentLevel + 1,
      });

      currentLevel++;
      currentXP = 0;
      remainingXP -= xpNeededForLevelUp;
    } else {
      steps.push({
        type: 'xp-gain',
        level: currentLevel,
        currentXP,
        xpToNextLevel,
        xpGain: remainingXP,
      });
      remainingXP = 0;
    }
  }

  return steps;
}

/**
 * Animate a number value over time using requestAnimationFrame.
 * Includes safety timeout to guarantee completion.
 */
export function animateValue(
  from: number,
  to: number,
  duration: number,
  onUpdate: (value: number) => void,
  easing: (t: number) => number = (t) => t,
): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const difference = to - from;
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      onUpdate(to);
      resolve();
    };

    const safetyTimeout = setTimeout(finish, duration + 500);

    function update() {
      if (resolved) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);
      onUpdate(from + difference * easedProgress);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        clearTimeout(safetyTimeout);
        finish();
      }
    }

    requestAnimationFrame(update);
  });
}

export const easings = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
