import type { FullState } from './api';

export interface StreakInfo {
  current: number;
  best: number;
  isNewToday: boolean;
}

interface StoredStreak {
  lastDate: string; // yyyy-mm-dd
  current: number;
  best: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Records a visit for the given user and returns their up-to-date streak. Purely a
 * client-side habit nudge (no server round trip needed) — consecutive-day visits keep
 * the streak alive, a skipped day resets it to 1, and the best streak is remembered
 * even after a reset so a bad week doesn't erase the record.
 */
export function recordVisit(userId: string): StreakInfo {
  const key = `amana:streak:${userId}`;
  const today = todayKey();
  let stored: StoredStreak;
  try {
    stored = JSON.parse(localStorage.getItem(key) || 'null') ?? { lastDate: '', current: 0, best: 0 };
  } catch {
    stored = { lastDate: '', current: 0, best: 0 };
  }

  let isNewToday = false;
  if (stored.lastDate !== today) {
    isNewToday = true;
    const gap = stored.lastDate ? daysBetween(stored.lastDate, today) : Infinity;
    stored.current = gap === 1 ? stored.current + 1 : 1;
    stored.lastDate = today;
    stored.best = Math.max(stored.best, stored.current);
    localStorage.setItem(key, JSON.stringify(stored));
  }

  return { current: stored.current, best: stored.best, isNewToday };
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  unlocked: boolean;
  /** 0-1, only meaningful for locked achievements with a visible path to unlocking */
  progress?: number;
}

/**
 * Derives a badge set entirely from the user's own data — no separate "achievements"
 * table on the server needed. Recomputed on every render, so it always reflects the
 * current state of the budget.
 */
export function buildAchievements(state: FullState, streak: StreakInfo): Achievement[] {
  const out: Achievement[] = [];

  const assigned = state.categories.reduce((a, c) => a + c.assigned, 0);
  const rta = state.settings.income + state.settings.unassignedExtra - assigned;
  out.push({
    id: 'zero-based',
    label: 'Zero-Based Hero',
    description: 'Assign every dollar of income to a job',
    unlocked: state.categories.length > 0 && rta === 0 && assigned > 0,
  });

  const overspent = state.categories.filter((c) => c.spent > c.assigned && c.assigned > 0);
  out.push({
    id: 'no-overspend',
    label: 'On Track',
    description: 'No categories over budget right now',
    unlocked: state.categories.length > 0 && overspent.length === 0,
  });

  const goalDone = state.goals.some((g) => g.target > 0 && g.saved >= g.target);
  out.push({
    id: 'goal-getter',
    label: 'Goal Getter',
    description: 'Fully fund at least one savings goal',
    unlocked: goalDone,
    progress: goalDone
      ? 1
      : state.goals.length
        ? Math.max(...state.goals.map((g) => (g.target > 0 ? g.saved / g.target : 0)))
        : 0,
  });

  const emergency = state.categories.find((c) => c.id.startsWith('emergency'));
  const savingsRate = state.settings.income > 0 && emergency ? emergency.assigned / state.settings.income : 0;
  out.push({
    id: 'saver',
    label: 'Steady Saver',
    description: 'Assign 10%+ of income toward savings',
    unlocked: savingsRate >= 0.1,
    progress: Math.min(1, savingsRate / 0.1),
  });

  out.push({
    id: 'logger',
    label: 'Consistent Logger',
    description: 'Log 10+ transactions',
    unlocked: state.transactions.length >= 10,
    progress: Math.min(1, state.transactions.length / 10),
  });

  out.push({
    id: 'family',
    label: 'Home Support',
    description: 'Track transfers to at least one person you support',
    unlocked: state.recipients.length > 0,
  });

  out.push({
    id: 'streak-3',
    label: '3-Day Streak',
    description: 'Open Amana 3 days in a row',
    unlocked: streak.best >= 3,
    progress: Math.min(1, streak.best / 3),
  });

  out.push({
    id: 'streak-7',
    label: 'Week Warrior',
    description: 'Open Amana 7 days in a row',
    unlocked: streak.best >= 7,
    progress: Math.min(1, streak.best / 7),
  });

  return out;
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-1
}

const LEVEL_TITLES = [
  'Budgeting Newbie',
  'Getting Organized',
  'Steady Hand',
  'Money Minded',
  'Budget Pro',
  'Financial Strategist',
  'Money Master',
];

const XP_PER_LEVEL = 100;

/**
 * A simple XP/level layer on top of achievements + streaks, purely for a sense of
 * progression. Unlocked achievements are worth 40 XP each, best-ever streak day is worth
 * 5 XP (capped), so consistent use compounds — but nothing here is adversarial or requires
 * spending money, it just reflects genuine engagement back to the user.
 */
export function computeLevel(achievements: Achievement[], streak: StreakInfo): LevelInfo {
  const achievementXp = achievements.filter((a) => a.unlocked).length * 40;
  const streakXp = Math.min(100, streak.best * 5);
  const xp = achievementXp + streakXp;

  const level = Math.min(LEVEL_TITLES.length, Math.floor(xp / XP_PER_LEVEL) + 1);
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const isMaxLevel = level >= LEVEL_TITLES.length;

  return {
    level,
    title: LEVEL_TITLES[level - 1],
    xp,
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
    progress: isMaxLevel ? 1 : xpIntoLevel / XP_PER_LEVEL,
  };
}
