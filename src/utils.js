import { FN, LN, MLB_TEAM_IDS, MLB } from './data.js';

// ── Pure helpers ──
export const ri = n => Math.floor(Math.random() * n);
export const rn = () => FN[ri(FN.length)] + ' ' + LN[ri(LN.length)];
export const rand = (a, b) => a + Math.random() * (b - a);
export const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function randomColor() {
  const colors = ['#c8392b','#1a3a5c','#1e5631','#b8860b','#6a0dad','#c47a00','#2c6e49','#1b4332','#7b2d00','#003d73'];
  return colors[ri(colors.length)];
}

// ── Team logo ──
// A logo uploaded for the team wins; otherwise the team's file in Configs/mlb-logos/, otherwise its emoji.
export function teamLogoSrc(team) {
  if (!team) return '';
  if (team.logo) return team.logo;
  const id = MLB_TEAM_IDS[team.name];
  return id ? `Configs/mlb-logos/${id}.svg` : '';
}
export function teamLogoHtml(team, size = 22) {
  const src = teamLogoSrc(team);
  if (src) {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;background:url('${src}') center/contain no-repeat;vertical-align:middle;flex-shrink:0;border-radius:2px"></span>`;
  }
  return (team && team.emoji) || '';
}

// ── DOM helpers ──
export function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
export function mkEl(tag, cls, txt) { const e = document.createElement(tag); e.className = cls; e.textContent = txt; return e; }

// ── Stat calculations ──
export function battingAvg(p) { return p.career.ab > 0 ? p.career.h / p.career.ab : 0; }
export function obpCalc(p) {
  const pa = p.career.pa || 1;
  return (p.career.h + p.career.bb + (p.career.hbp || 0)) / pa;
}
export function slgCalc(p) {
  const ab = p.career.ab || 1;
  const singles = p.career.h - p.career.hr - p.career.doubles - p.career.triples;
  return (singles + p.career.doubles * 2 + p.career.triples * 3 + p.career.hr * 4) / ab;
}

// ── Batter projection ──
// The per-PA outcome mix a batter projects to against an average pitcher: the same blend of his ratings
// and the league rate the pitch model converges on. views.projectPlayer rounds it to counts per 100 PA
// for the card; buildLineup ranks by the unrounded rates so two similar bats are not tied by rounding.
export function projectBatterMix(p) {
  const k  = cl(p.kPct * .6  + MLB.k    * .4, .10, .38);
  const bb = cl(p.bbPct * .6 + MLB.walk * .4, .04, .16);
  const go = cl(p.goPct, .12, .32);
  const speedFactor  = cl((p.sbRate || 0.075) / 0.15, 0, 1);
  const speedBonus   = (speedFactor - 0.5) * 0.020;  // ±0.010 AVG; elite speed ≈ +10 pts
  const contactRate  = cl(0.260 - (p.kPct||0.20) * 0.260, 0.130, 0.245);
  const hitRate      = cl(contactRate + speedBonus, 0.120, 0.265);
  const adjSinglePct = (p.singlePct||0) + Math.max(0, speedBonus);
  const rawHitSum    = adjSinglePct + (p.doublePct||0) + (p.triplePct||0) + (p.hrPct||0);
  const hitDenom     = rawHitSum > 0 ? rawHitSum : 1;
  // Base hit type probabilities
  const pSingle = hitRate * (adjSinglePct     / hitDenom);
  const pDbl    = hitRate * ((p.doublePct||0) / hitDenom);
  const pTriple = hitRate * ((p.triplePct||0) / hitDenom);
  const pHr     = hitRate * ((p.hrPct||0)     / hitDenom);
  // Speed-based extra-base upgrade (mirrors tryExtraBase in sim)
  const singleUpgrade = Math.max(0, speedFactor - 0.55) * 0.30;
  const doubleUpgrade = Math.max(0, speedFactor - 0.70) * 0.20;
  const single = pSingle * (1 - singleUpgrade);
  const dbl    = pDbl * (1 - doubleUpgrade) + pSingle * singleUpgrade;
  const triple = pTriple + pDbl * doubleUpgrade;
  const raw = { k, go, fo:p.foPct, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single, dbl, triple, hr:pHr };
  const tot = Object.values(raw).reduce((s, v) => s + v, 0);
  const out = {}; for (const key in raw) out[key] = raw[key] / tot;
  return out;
}

// Projected rate stats from that mix, unrounded: what the lineup builder sorts on.
export function projectedRates(p) {
  const pr = projectBatterMix(p);
  const h = pr.single + pr.dbl + pr.triple + pr.hr;
  const ab = 1 - pr.walk - pr.hbp;
  const obp = h + pr.walk + pr.hbp;
  const slg = (pr.single + 2 * pr.dbl + 3 * pr.triple + 4 * pr.hr) / ab;
  return { avg: h / ab, obp, slg, ops: obp + slg, hr: pr.hr };
}
