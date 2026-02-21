import { FN, LN } from './data.js';

// ── Pure helpers ──
export const ri = n => Math.floor(Math.random() * n);
export const rn = () => FN[ri(FN.length)] + ' ' + LN[ri(LN.length)];
export const rand = (a, b) => a + Math.random() * (b - a);
export const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function randomColor() {
  const colors = ['#c8392b','#1a3a5c','#1e5631','#b8860b','#6a0dad','#c47a00','#2c6e49','#1b4332','#7b2d00','#003d73'];
  return colors[ri(colors.length)];
}

// ── DOM helpers ──
export function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
export function mkEl(tag, cls, txt) { const e = document.createElement(tag); e.className = cls; e.textContent = txt; return e; }

// ── Stat calculations ──
export function battingAvg(p) { return p.career.ab > 0 ? p.career.h / p.career.ab : 0; }
export function obpCalc(p) {
  const pa = p.career.pa || 1;
  return (p.career.h + p.career.bb) / pa;
}
export function slgCalc(p) {
  const ab = p.career.ab || 1;
  const singles = p.career.h - p.career.hr - p.career.doubles - p.career.triples;
  return (singles + p.career.doubles * 2 + p.career.triples * 3 + p.career.hr * 4) / ab;
}
