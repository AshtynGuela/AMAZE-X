export const SITE_SCORE_WEIGHTS = { sunlight: 40, contact: 40, darkness: 20 };

// Express all three inputs on the same 0–100 scale before applying weights.
export function siteScore(metrics, durationDays) {
  if (!metrics || !Number.isFinite(durationDays) || durationDays <= 0 ||
      ![metrics.sunlitPct, metrics.earthDtePct, metrics.longestDarkH].every(Number.isFinite)) return null;

  const pct = (value) => Math.max(0, Math.min(100, value));
  const darknessShare = pct(100 * metrics.longestDarkH / (durationDays * 24));
  const normalized = {
    sunlight: pct(metrics.sunlitPct),
    contact: pct(metrics.earthDtePct),
    darkness: 100 - darknessShare,
  };
  const factors = Object.entries(SITE_SCORE_WEIGHTS).map(([id, weight]) => ({
    id, weight, points: normalized[id] * weight / 100,
  }));
  return { percent: factors.reduce((total, factor) => total + factor.points, 0), factors, darknessShare };
}

export const formatSiteScore = (percent) => percent.toFixed(1) + "%";
