import { FN, LN, MLB_TEAM_IDS, MLB, HIT_MODEL } from './data.js';

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

// ── Ball in play ──
// Shares of one ball in play (they sum to 1): home run, single, double, triple, ground out, fly out,
// line out. The pitch loop rolls this once a ball is put in play; walks, strikeouts and hit batters are
// decided by the pitches before it. See HIT_MODEL in data.js for the reasoning. goAdj is the pitcher's
// ground-ball lean, already scaled for fatigue.
export function ballInPlayMix(b, goAdj = 0) {
  const speedFactor = cl((b.sbRate || 0.075) / 0.15, 0, 1);
  const hr    = cl((b.hrPct ?? MLB.hr) * HIT_MODEL.hrScale, 0.005, 0.25);
  const babip = cl(HIT_MODEL.babipBase + (speedFactor - 0.5) * 2 * HIT_MODEL.babipSpeed - ((b.kPct ?? MLB.k) - MLB.k) * HIT_MODEL.babipContact, 0.18, 0.42);
  const hits  = (1 - hr) * babip;
  // Hits that fall in split by the bat's single/double/triple weights; speed adds infield singles
  const w1 = (b.singlePct ?? MLB.single) + Math.max(0, speedFactor - 0.5) * 0.02, w2 = b.doublePct ?? MLB.double, w3 = b.triplePct ?? MLB.triple;
  const wsum = w1 + w2 + w3;
  const outs = 1 - hr - hits;
  const go = cl((b.goPct ?? MLB.go) + goAdj, 0.12, 0.32), fo = b.foPct ?? MLB.fo, lo = MLB.lo;
  const osum = go + fo + lo;
  return { go: outs * go / osum, fo: outs * fo / osum, lo: outs * lo / osum,
           single: hits * w1 / wsum, dbl: hits * w2 / wsum, triple: hits * w3 / wsum, hr };
}

// ── Batter projection ──
// The per-PA outcome mix a batter projects to against an average pitcher: the pitch loop's blend of his
// strikeout and walk rates with the league's, then ballInPlayMix for the rest, with the speed upgrades
// the loop applies after a hit (tryExtraBase in game.js). views.projectPlayer rounds it to counts per
// 100 PA for the card; buildLineup ranks by the unrounded rates so two similar bats are not tied by rounding.
export function projectBatterMix(p) {
  const k  = cl(p.kPct * .6  + MLB.k    * .4, .10, .38);
  const bb = cl(p.bbPct * .6 + MLB.walk * .4, .04, .16);
  const bip = 1 - k - bb - MLB.hbp;
  const m = ballInPlayMix(p);
  const speedFactor   = cl((p.sbRate || 0.075) / 0.15, 0, 1);
  const singleUpgrade = Math.max(0, speedFactor - 0.55) * 0.30;
  const doubleUpgrade = Math.max(0, speedFactor - 0.70) * 0.20;
  const single = m.single * (1 - singleUpgrade);
  const dbl    = m.dbl * (1 - doubleUpgrade) + m.single * singleUpgrade;
  const triple = m.triple + m.dbl * doubleUpgrade;
  return { k, go: m.go * bip, fo: m.fo * bip, lo: m.lo * bip, walk: bb, hbp: MLB.hbp,
           single: single * bip, dbl: dbl * bip, triple: triple * bip, hr: m.hr * bip };
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
