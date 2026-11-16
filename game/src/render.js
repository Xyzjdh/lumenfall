// Everything the player sees, and nothing about the rules. The renderer is handed the world's
// state and draws one frame: the stratum's sky, the stars, the corridor walls, the comet and its
// trail, the motes, the rock, and the screens (title, play, paused, win, end) with their HUD.

import {
  GLOW,
  GOAL_DEPTH_M,
  PIXELS_PER_METRE,
  PLAYER,
  PLAYER_SCREEN_Y,
  STRATA,
  VIEW,
  descendSpeedAt,
  nextStratumAt,
  progress,
  stratumIndexAt,
} from './config.js';
import { KIND_MOTE, KIND_SHARD, KIND_STAR, corridorCentre, corridorHalfWidth, screenY } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

/** Named colours, so the drawing reads as palette rather than magic numbers. */
const INK = '#f2fbff';
const INK_DIM = 'rgba(226,246,255,0.62)';
const INK_FAINT = 'rgba(226,246,255,0.34)';

/** Blend two hex colours (both #rrggbb) and return a hex colour. */
function mix(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const hex = pa
    .map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

/** Any palette colour (hex or rgb()) as an rgba() with the given alpha. */
function alpha(colour, a) {
  if (colour.startsWith('#')) {
    const r = parseInt(colour.slice(1, 3), 16);
    const g = parseInt(colour.slice(3, 5), 16);
    const b = parseInt(colour.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const parts = colour.match(/[\d.]+/g) ?? [0, 0, 0];
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
}

/** The palette at a depth, blended across the edge of a stratum so the change never snaps. */
function paletteAt(depth) {
  const index = stratumIndexAt(depth);
  const here = STRATA[index];
  const next = STRATA[Math.min(STRATA.length - 1, index + 1)];
  const edge = nextStratumAt(depth);
  let t = 0;
  if (edge !== null && next !== here) t = Math.max(0, Math.min(1, 1 - (edge - depth) / 130));
  return {
    name: here.name,
    next: next.name,
    sky: here.sky.map((colour, i) => mix(colour, next.sky[i] ?? colour, t)),
    haze: mix(here.haze, next.haze, t),
    accent: mix(here.accent, next.accent, t),
    rock: [mix(here.rock[0], next.rock[0], t), mix(here.rock[1], next.rock[1], t)],
    mote: mix(here.mote, next.mote, t),
    index,
  };
}

/** Format a whole number with thin-space thousands, e.g. 12 480. */
export function formatNumber(value) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Seconds as m:ss. */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  /** A field of drifting specks, laid out once, each with its own depth rate and twinkle. */
  const stars = (() => {
    let seed = 20261116;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const list = [];
    for (let index = 0; index < 132; index += 1) {
      list.push({
        x: next() * VIEW.width,
        y: next() * VIEW.height,
        rate: 0.04 + next() * 0.30,
        size: 0.7 + next() * 1.9,
        twinkle: next() * TAU,
        warm: next() > 0.78,
      });
    }
    return list;
  })();

  /** A soft dust band, for depth behind the corridor. */
  const dust = (() => {
    let seed = 715517;
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    const list = [];
    for (let index = 0; index < 46; index += 1) {
      list.push({ x: next() * VIEW.width, y: next() * VIEW.height, r: 8 + next() * 46, rate: 0.08 + next() * 0.22, a: 0.03 + next() * 0.05 });
    }
    return list;
  })();

  /** The comet's trail, most recent first. */
  const trail = [];
  /** Sparks thrown by motes, rock hits and wall scrapes. */
  let sparks = [];
  let shake = 0;
  let flash = 0;
  let lastDepth = 0;

  /** Called once a frame with whatever the world did, so the renderer can celebrate it. */
  function react(events, world) {
    if (!events) return;
    const { state, comet } = world;
    const at = (x, y) => ({ x: VIEW.width / 2 + x, y: VIEW.height - y });
    if (events & 1) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 9; i += 1) {
        const a = Math.random() * TAU;
        const s = 40 + Math.random() * 150;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.5 + Math.random() * 0.3, age: 0, size: 1.4 + Math.random() * 1.8, warm: true });
      }
    }
    if (events & 2) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 22; i += 1) {
        const a = Math.random() * TAU;
        const s = 60 + Math.random() * 260;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.5, age: 0, size: 1.6 + Math.random() * 2.6, warm: true });
      }
      flash = Math.max(flash, 0.35);
    }
    if (events & 4) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 26; i += 1) {
        const a = Math.random() * TAU;
        const s = 70 + Math.random() * 300;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.45, age: 0, size: 1.5 + Math.random() * 2.2, warm: false });
      }
      shake = Math.max(shake, 11);
      flash = Math.max(flash, 0.4);
    }
    if (events & 8) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 3; i += 1) {
        sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 120, vy: Math.random() * 90, life: 0.3, age: 0, size: 1.3, warm: true });
      }
      shake = Math.max(shake, 3.5);
    }
    if (events & 64) {
      flash = Math.max(flash, 0.5);
    }
    void state;
  }

  /** Advance the renderer's own animation clocks. */
  function step(dt, world) {
    const { comet, state } = world;
    trail.unshift({ x: comet.x, y: comet.y, tilt: comet.tilt, glow: state.glow, depth: state.depth });
    if (trail.length > 26) trail.pop();
    for (let index = sparks.length - 1; index >= 0; index -= 1) {
      const s = sparks[index];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.94;
      s.vy = s.vy * 0.94 + 34 * dt;
      if (s.age >= s.life) sparks.splice(index, 1);
    }
    shake = Math.max(0, shake - dt * 26);
    flash = Math.max(0, flash - dt * 1.7);
    lastDepth = state.depth;
  }

  /** The sky: the stratum's three bands, its dust, and the stars sliding past. */
  function drawSky(state, palette, scrollPx) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    sky.addColorStop(0, palette.sky[0]);
    sky.addColorStop(0.55, palette.sky[1]);
    sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // The core's far light, growing as the comet nears it.
    const near = progress(state.depth);
    const halo = ctx.createRadialGradient(VIEW.width / 2, VIEW.height * 1.06, 10, VIEW.width / 2, VIEW.height * 1.06, 300 + near * 340);
    halo.addColorStop(0, alpha(palette.accent, 0.16 + near * 0.34));
    halo.addColorStop(0.5, alpha(palette.haze, 0.10 + near * 0.16));
    halo.addColorStop(1, alpha(palette.haze, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Dust, drifting down at its own slow rate.
    ctx.globalCompositeOperation = 'lighter';
    for (const grain of dust) {
      const y = (grain.y + scrollPx * grain.rate) % VIEW.height;
      const g = ctx.createRadialGradient(grain.x, y, 0, grain.x, y, grain.r);
      g.addColorStop(0, alpha(palette.haze, grain.a * 0.5));
      g.addColorStop(1, alpha(palette.haze, 0));
      ctx.fillStyle = g;
      ctx.fillRect(grain.x - grain.r, y - grain.r, grain.r * 2, grain.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Stars: they climb faster than the dust, so the fall reads as speed.
    for (const star of stars) {
      const y = (star.y + scrollPx * star.rate) % VIEW.height;
      const twinkle = 0.55 + 0.45 * Math.sin(star.twinkle + state.time * 2.4);
      ctx.fillStyle = star.warm ? alpha('#ffd9a0', 0.30 + 0.55 * twinkle) : alpha('#dff3ff', 0.24 + 0.5 * twinkle);
      ctx.beginPath();
      ctx.arc(star.x, VIEW.height - y, star.size, 0, TAU);
      ctx.fill();
    }
  }

  /** The corridor: two glowing walls that funnel the fall, breathing with the world. */
  function drawCorridor(state, palette) {
    const steps = 34;
    const left = [];
    const right = [];
    for (let index = 0; index <= steps; index += 1) {
      const y = (index / steps) * (VIEW.height + 40) - 20;
      const at = state.depth + (VIEW.height - y - VIEW.height * PLAYER_SCREEN_Y) / PIXELS_PER_METRE;
      const centre = VIEW.width / 2 + corridorCentre(at);
      const half = corridorHalfWidth(at);
      left.push([centre - half, y]);
      right.push([centre + half, y]);
    }
    // The inner haze the walls throw into the corridor.
    const glow = ctx.createLinearGradient(0, 0, VIEW.width, 0);
    glow.addColorStop(0, alpha(palette.accent, 0.34));
    glow.addColorStop(0.30, alpha(palette.accent, 0.0));
    glow.addColorStop(0.70, alpha(palette.accent, 0.0));
    glow.addColorStop(1, alpha(palette.accent, 0.34));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let index = right.length - 1; index >= 0; index -= 1) ctx.lineTo(right[index][0], right[index][1]);
    ctx.closePath();
    ctx.fill();

    // The walls themselves: a bright edge and a body that falls off into the dark.
    for (const side of [left, right]) {
      ctx.beginPath();
      ctx.moveTo(side[0][0], side[0][1]);
      for (const [x, y] of side) ctx.lineTo(x, y);
      ctx.lineTo(side[side.length - 1][0], -40);
      ctx.lineTo(side[0][0], -40);
      ctx.closePath();
      const body = ctx.createLinearGradient(0, 0, 0, VIEW.height);
      body.addColorStop(0, alpha(palette.rock[0], 0.55));
      body.addColorStop(1, alpha(palette.rock[0], 0.92));
      ctx.fillStyle = body;
      ctx.fill();
    }

    // The bright lip of each wall, with a soft bloom behind it.
    for (const side of [left, right]) {
      ctx.beginPath();
      ctx.moveTo(side[0][0], side[0][1]);
      for (const [x, y] of side) ctx.lineTo(x, y);
      ctx.strokeStyle = alpha(palette.accent, 0.9);
      ctx.lineWidth = 2.4;
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.strokeStyle = alpha(palette.accent, 0.35);
      ctx.lineWidth = 7;
      ctx.shadowBlur = 30;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  /** A mote, a star, or a rock, at its place on the screen. */
  function drawItem(item, state, palette) {
    const y = VIEW.height - screenY(item.at, state.depth);
    const x = VIEW.width / 2 + item.x;
    const pulse = 0.82 + 0.18 * Math.sin(state.time * 5 + item.phase);

    if (item.kind === KIND_MOTE) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 15 * pulse);
      g.addColorStop(0, alpha(palette.mote, 0.95));
      g.addColorStop(0.35, alpha(palette.accent, 0.55));
      g.addColorStop(1, alpha(palette.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 15 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, TAU);
      ctx.fill();
      return;
    }

    if (item.kind === KIND_STAR) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30 * pulse);
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.22, alpha(palette.mote, 0.85));
      g.addColorStop(1, alpha(palette.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 30 * pulse, 0, TAU);
      ctx.fill();
      // The four-point flare that says "worth chasing".
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - 20 * pulse, y);
      ctx.lineTo(x + 20 * pulse, y);
      ctx.moveTo(x, y - 20 * pulse);
      ctx.lineTo(x, y + 20 * pulse);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, TAU);
      ctx.fill();
      return;
    }

    // Rock: a faceted stone, or a long shard, in the stratum's own stone colour.
    const size = item.drawR ?? item.r;
    const rot = item.rot + state.time * item.spin;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // The shadow it throws toward the corridor's middle, so it sits in the world.
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.9, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fill();
    const facets = item.kind === KIND_SHARD ? 5 : 7;
    ctx.beginPath();
    for (let index = 0; index < facets; index += 1) {
      const a = (index / facets) * TAU;
      const r = size * (item.kind === KIND_SHARD ? (index % 2 ? 0.55 : 1.25) : 0.82 + 0.24 * Math.sin(index * 2.4 + item.wobble));
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * (item.kind === KIND_SHARD ? 0.42 : 1);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const body = ctx.createLinearGradient(-size, -size, size, size);
    body.addColorStop(0, palette.rock[1]);
    body.addColorStop(1, palette.rock[0]);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', 0.16);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // One lit facet, so the rock reads as solid rather than flat.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.7, -size * 0.35);
    ctx.lineTo(size * 0.2, -size * 0.8);
    ctx.closePath();
    ctx.fillStyle = alpha('#ffffff', 0.10);
    ctx.fill();
    ctx.restore();
  }

  /** The comet: its trail, its body and its aura, dimmed as the glow runs low. */
  function drawComet(state, palette, alive) {
    if (trail.length === 0) return;
    const life = Math.max(0, Math.min(1, state.glow / GLOW.max));
    const aura = 0.34 + life * 0.66;
    // The trail, oldest and faintest last.
    for (let index = trail.length - 1; index >= 1; index -= 1) {
      const point = trail[index];
      const f = 1 - index / trail.length;
      const x = VIEW.width / 2 + point.x;
      const y = VIEW.height - point.y;
      const r = (2 + f * 9) * (0.5 + life * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, alpha(palette.mote, 0.5 * f * aura));
      g.addColorStop(1, alpha(palette.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    const x = VIEW.width / 2 + trail[0].x;
    const y = VIEW.height - trail[0].y;
    const tilt = trail[0].tilt;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // The long flame behind it, streaming up the screen: wide and soft, not a splinter.
    const flicker = 1 + 0.16 * Math.sin(state.time * 11);
    const flame = ctx.createLinearGradient(0, 0, 0, 84);
    flame.addColorStop(0, alpha(palette.mote, 0.92 * aura));
    flame.addColorStop(0.35, alpha(palette.accent, 0.5 * aura));
    flame.addColorStop(1, alpha(palette.accent, 0));
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-13, 4);
    ctx.quadraticCurveTo(-7, 46, 0, 78 * flicker);
    ctx.quadraticCurveTo(7, 46, 13, 4);
    ctx.closePath();
    ctx.fill();
    // The aura: a wide cool bloom that keeps the comet legible over any stratum.
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 52);
    halo.addColorStop(0, alpha('#ffffff', 0.55 * aura));
    halo.addColorStop(0.30, alpha(palette.mote, 0.42 * aura));
    halo.addColorStop(1, alpha(palette.accent, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, TAU);
    ctx.fill();
    // The body: a white-hot core in a bright shell, ringed so it reads as a thing, not a blur.
    ctx.fillStyle = alive ? '#ffffff' : 'rgba(150,170,190,0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius * 0.72, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', 0.9 * aura);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** The sparks, over everything else in the world. */
  function drawSparks(palette) {
    for (const s of sparks) {
      const f = 1 - s.age / s.life;
      ctx.fillStyle = s.warm ? alpha(palette.mote, 0.9 * f) : alpha('#ff9d6b', 0.9 * f);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * f, 0, TAU);
      ctx.fill();
    }
  }

  /** A rounded panel, the one shape every screen's furniture is made of. */
  function panel(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** The wordmark: LU on one line and MENFALL on the next, with a stroke through the U. */
  function drawWordmark(cx, y, palette, scale = 1) {
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = "800 66px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '10px';
    const grad = ctx.createLinearGradient(0, -60, 0, 60);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, palette.mote);
    grad.addColorStop(1, palette.accent);
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = grad;
    ctx.fillText('LUMEN', 6, 0);
    ctx.fillText('FALL', 6, 58);
    ctx.shadowBlur = 0;
    // The falling stroke: one bright line through the wordmark, comet at its head.
    ctx.strokeStyle = alpha('#ffffff', 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-96, -78);
    ctx.lineTo(-14, 20);
    ctx.stroke();
    const glow = ctx.createRadialGradient(-14, 20, 0, -14, 20, 18);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.4, alpha(palette.mote, 0.8));
    glow.addColorStop(1, alpha(palette.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(-14, 20, 18, 0, TAU);
    ctx.fill();
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  /** A thin key: a rounded box with a letter in it. */
  function drawKey(x, y, label, wide = false) {
    const w = wide ? 54 : 26;
    panel(x - w / 2, y - 13, w, 26, 6, 'rgba(8,18,30,0.72)', alpha('#ffffff', 0.45));
    ctx.fillStyle = INK;
    ctx.font = "600 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  /** The HUD, in the run's own colours: depth, glow, chain and score. */
  function drawHud(state, palette, best) {
    const pad = 26;
    // Depth, top left, with the stratum and the road to the next one.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    ctx.font = "700 30px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`${formatNumber(state.depth)} m`, pad, 46);
    ctx.fillStyle = INK_DIM;
    ctx.font = "600 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.4px';
    ctx.fillText(palette.name, pad, 66);
    ctx.letterSpacing = '0px';

    // The shallow progress rail to the core.
    const railW = 172;
    const done = Math.min(1, state.depth / GOAL_DEPTH_M);
    panel(pad, 78, railW, 5, 3, alpha('#ffffff', 0.16));
    panel(pad, 78, Math.max(3, railW * done), 5, 3, palette.accent);
    ctx.fillStyle = INK_FAINT;
    ctx.font = "600 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`CORE ${formatNumber(GOAL_DEPTH_M)} m`, pad, 99);

    // Score, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = "700 30px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(formatNumber(state.score), VIEW.width - pad, 46);
    ctx.fillStyle = INK_DIM;
    ctx.font = "600 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.4px';
    ctx.fillText('SCORE', VIEW.width - pad, 66);
    ctx.fillStyle = INK_FAINT;
    ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`BEST ${formatNumber(Math.max(best, state.score))}  ·  ${formatClock(state.time)}`, VIEW.width - pad, 84);
    ctx.letterSpacing = '0px';

    // Glow: the comet's life, bottom left, drawn as a comet-shaped gauge.
    const life = Math.max(0, Math.min(1, state.glow / GLOW.max));
    const gx = pad;
    const gy = VIEW.height - 46;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK_DIM;
    ctx.font = "600 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.4px';
    ctx.fillText('GLOW', gx, gy - 14);
    ctx.letterSpacing = '0px';
    const barW = 208;
    panel(gx, gy, barW, 12, 6, alpha('#000000', 0.42), alpha('#ffffff', 0.18));
    const fillW = Math.max(2, barW * life);
    const barGrad = ctx.createLinearGradient(gx, 0, gx + barW, 0);
    barGrad.addColorStop(0, life < 0.28 ? '#ff7a5c' : palette.mote);
    barGrad.addColorStop(1, life < 0.28 ? '#ffb06b' : palette.accent);
    panel(gx, gy, fillW, 12, 6, barGrad);
    if (life < 0.28) {
      // The last quarter of the glow pulses, so it is felt as well as read.
      const pulse = 0.4 + 0.35 * Math.sin(state.time * 11);
      panel(gx, gy, fillW, 12, 6, alpha('#ff7a5c', pulse * 0.6));
    }
    ctx.fillStyle = INK;
    ctx.font = "700 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`${Math.ceil(state.glow)}%`, gx + barW + 12, gy + 11);

    // The chain, bottom right: the multiplier the last motes earned.
    const multi = Math.min(5, 1 + Math.floor(state.chain / 8));
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    if (state.chain > 0) {
      ctx.fillStyle = multi > 1 ? palette.mote : INK_DIM;
      ctx.font = "700 24px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(`×${multi}`, VIEW.width - pad, VIEW.height - 52);
      ctx.fillStyle = INK_DIM;
      ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2.2px';
      ctx.fillText(`CHAIN ${state.chain}`, VIEW.width - pad, VIEW.height - 36);
      ctx.letterSpacing = '0px';
    }

    // A new stratum, announced across the middle for a moment.
    if (state.stratumBanner > 0) {
      const t = Math.min(1, state.stratumBanner / 0.5);
      ctx.globalAlpha = t;
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.accent;
      ctx.font = "800 30px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '8px';
      ctx.fillText(palette.name, VIEW.width / 2, VIEW.height * 0.30);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = INK_DIM;
      ctx.font = "600 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(`STRATUM ${palette.index + 1} OF ${STRATA.length}`, VIEW.width / 2, VIEW.height * 0.30 + 20);
      ctx.globalAlpha = 1;
    }
  }

  /** A dark scrim behind a screen, so its text reads over a busy world. */
  function scrim(strength = 0.55) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, `rgba(2,8,16,${strength})`);
    g.addColorStop(0.5, `rgba(2,8,16,${strength * 0.8})`);
    g.addColorStop(1, `rgba(2,8,16,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  /** The title screen: wordmark, the promise, how to play, and the one key that starts it. */
  function drawTitle(palette) {
    scrim(0.42);
    drawWordmark(VIEW.width / 2, VIEW.height * 0.30, palette, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = "500 19px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('Fall 4,000 metres to the core of a gas giant.', VIEW.width / 2, VIEW.height * 0.53);
    ctx.fillStyle = INK_DIM;
    ctx.font = "400 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('Catch light motes. Your glow is your life — and it burns faster the deeper you fall.', VIEW.width / 2, VIEW.height * 0.585);
    ctx.fillStyle = inkFaintColour();
    ctx.fillText('Strike the walls or the rock and it drains away.', VIEW.width / 2, VIEW.height * 0.618);

    // The controls row.
    const rowY = VIEW.height * 0.71;
    drawKey(VIEW.width / 2 - 236, rowY, '←', true);
    drawKey(VIEW.width / 2 - 178, rowY, '→', true);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK_DIM;
    ctx.font = "500 13px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('orbit', VIEW.width / 2 - 142, rowY + 5);
    drawKey(VIEW.width / 2 - 58, rowY, 'W', true);
    drawKey(VIEW.width / 2, rowY, 'S', true);
    ctx.fillText('thrust', VIEW.width / 2 + 34, rowY + 5);
    ctx.fillStyle = INK_FAINT;
    ctx.font = "400 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('or steer with the mouse', VIEW.width / 2, rowY + 26);

    // The one prompt, pulsing so it reads as live rather than painted.
    const pulse = 0.62 + 0.38 * Math.sin(lastDepth * 0 + performance.now() / 380);
    ctx.globalAlpha = pulse;
    panel(VIEW.width / 2 - 132, VIEW.height * 0.885 - 21, 264, 42, 21, alpha('#ffffff', 0.12), alpha('#ffffff', 0.5));
    ctx.fillStyle = INK;
    ctx.font = "700 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2px';
    ctx.fillText('PRESS SPACE TO DESCEND', VIEW.width / 2, VIEW.height * 0.885 + 5);
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  function inkFaintColour() {
    return INK_FAINT;
  }

  /** The pause screen. */
  function drawPaused(palette) {
    scrim(0.62);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = "800 44px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '8px';
    ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height * 0.44);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = INK_DIM;
    ctx.font = "500 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('Space to keep falling  ·  Esc to hold still', VIEW.width / 2, VIEW.height * 0.52);
    ctx.fillStyle = INK_FAINT;
    ctx.font = "400 13px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('M toggles sound', VIEW.width / 2, VIEW.height * 0.57);
    void palette;
  }

  /** The end screen: what killed you, what you scored, and the one key that starts again. */
  function drawOver(state, palette, best) {
    scrim(0.68);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9d7a';
    ctx.font = "800 46px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '8px';
    ctx.shadowColor = 'rgba(255,120,80,0.7)';
    ctx.shadowBlur = 24;
    ctx.fillText('YOUR LIGHT WENT OUT', VIEW.width / 2, VIEW.height * 0.27);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';

    panel(VIEW.width / 2 - 268, VIEW.height * 0.35, 536, 172, 18, 'rgba(4,12,22,0.72)', alpha('#ffffff', 0.20));
    const rows = [
      ['DEPTH REACHED', `${formatNumber(state.depth)} m`],
      ['SCORE', formatNumber(state.score)],
      ['MOTES CAUGHT', `${state.motesTaken}  ·  STARS ${state.starsTaken}`],
      ['BEST THIS VISIT', formatNumber(Math.max(best, state.score))],
    ];
    ctx.font = "600 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    rows.forEach(([label, value], index) => {
      const y = VIEW.height * 0.35 + 40 + index * 36;
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_FAINT;
      ctx.letterSpacing = '2px';
      ctx.fillText(label, VIEW.width / 2 - 236, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.letterSpacing = '0px';
      ctx.font = "700 19px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(value, VIEW.width / 2 + 236, y + 1);
      ctx.font = "600 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    });
    ctx.letterSpacing = '0px';

    ctx.textAlign = 'center';
    ctx.fillStyle = INK_DIM;
    ctx.font = "400 14px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`You fell as far as ${palette.name}’s edge. The core is still ${formatNumber(Math.max(0, GOAL_DEPTH_M - state.depth))} m down.`, VIEW.width / 2, VIEW.height * 0.795);

    const pulse = 0.62 + 0.38 * Math.sin(performance.now() / 380);
    ctx.globalAlpha = pulse;
    panel(VIEW.width / 2 - 150, VIEW.height * 0.885 - 21, 300, 42, 21, alpha('#ffffff', 0.12), alpha('#ffffff', 0.5));
    ctx.fillStyle = INK;
    ctx.font = "700 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2px';
    ctx.fillText('SPACE TO DESCEND AGAIN', VIEW.width / 2, VIEW.height * 0.885 + 5);
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  /** The win screen: the core reached, the run's ledger, and the offer to go again. */
  function drawWin(state, palette, best) {
    scrim(0.5);
    // The core's own light floods the middle of the frame.
    const core = ctx.createRadialGradient(VIEW.width / 2, VIEW.height * 0.34, 10, VIEW.width / 2, VIEW.height * 0.34, 420);
    core.addColorStop(0, 'rgba(255,246,214,0.92)');
    core.addColorStop(0.35, alpha(palette.accent, 0.55));
    core.addColorStop(1, alpha(palette.accent, 0));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fffbe8';
    ctx.font = "800 52px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '9px';
    ctx.shadowColor = 'rgba(255,226,140,0.9)';
    ctx.shadowBlur = 34;
    ctx.fillText('THE CORE', VIEW.width / 2, VIEW.height * 0.26);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(12,8,2,0.82)';
    ctx.font = "600 17px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('You crossed all five strata and touched the heart of the world.', VIEW.width / 2, VIEW.height * 0.315);

    panel(VIEW.width / 2 - 268, VIEW.height * 0.40, 536, 150, 18, 'rgba(255,252,240,0.88)', alpha('#000000', 0.18));
    const rows = [
      ['FINAL SCORE', formatNumber(state.score)],
      ['TIME', formatClock(state.time)],
      ['MOTES · STARS', `${state.motesTaken} · ${state.starsTaken}`],
      ['ROCK CLEARED', `${state.rocksPassed}`],
    ];
    rows.forEach(([label, value], index) => {
      const y = VIEW.height * 0.40 + 40 + index * 32;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(20,16,8,0.55)';
      ctx.font = "600 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2px';
      ctx.fillText(label, VIEW.width / 2 - 236, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(14,10,4,0.95)';
      ctx.font = "700 20px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '0px';
      ctx.fillText(value, VIEW.width / 2 + 236, y + 1);
    });

    const pulse = 0.62 + 0.38 * Math.sin(performance.now() / 380);
    ctx.globalAlpha = pulse;
    panel(VIEW.width / 2 - 168, VIEW.height * 0.885 - 21, 336, 42, 21, 'rgba(255,252,240,0.92)', 'rgba(20,16,8,0.4)');
    ctx.fillStyle = 'rgba(14,10,4,0.95)';
    ctx.font = "700 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE TO FALL AGAIN', VIEW.width / 2, VIEW.height * 0.885 + 5);
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
    void best;
  }

  /** The frame proper: world first, then whatever screen is over it. */
  function frame(world, screen, best) {
    const { state } = world;
    const palette = paletteAt(state.depth);
    const jolt = shake;
    ctx.save();
    if (jolt > 0.2) ctx.translate((Math.random() - 0.5) * jolt, (Math.random() - 0.5) * jolt);

    drawSky(state, palette, state.depth * PIXELS_PER_METRE);
    drawCorridor(state, palette);
    for (const item of world.items) {
      const y = screenY(item.at, state.depth);
      if (y < -80 || y > VIEW.height + 120) continue;
      drawItem(item, state, palette);
    }
    drawComet(state, palette, cometAlive);
    drawSparks(palette);
    ctx.restore();

    if (flash > 0.01) {
      ctx.fillStyle = alpha('#ffffff', flash * 0.16);
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    if (screen === SCREEN_PLAY) drawHud(state, palette, best);
    else if (screen === SCREEN_TITLE) {
      drawHudTitleFrame(state, palette);
      drawTitle(palette);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, palette, best);
      drawPaused(palette);
    } else if (screen === SCREEN_OVER) {
      drawOver(state, palette, best);
    } else if (screen === SCREEN_WIN) {
      drawWin(state, palette, best);
    }
  }

  /** Under the title, the HUD is left off and only the depth the descent starts at shows. */
  function drawHudTitleFrame(state, palette) {
    ctx.textAlign = 'right';
    ctx.fillStyle = INK_FAINT;
    ctx.font = "600 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.4px';
    ctx.fillText(`DESCENT SPEED ${Math.round(descendSpeedAt(state.depth))} M/S  ·  5 STRATA`, VIEW.width - 26, VIEW.height - 40);
    ctx.letterSpacing = '0px';
    void palette;
  }

  let cometAlive = true;
  function setAlive(alive) {
    cometAlive = alive;
  }

  /** Forget the trail, when a run starts over. */
  function clearTrail() {
    trail.length = 0;
    sparks = [];
    shake = 0;
    flash = 0;
  }

  /**
   * Fill the trail from the comet's own motion, for a scene staged without frames behind it:
   * the streak the renderer would have built had it been painting while the world ran.
   */
  function seedTrail(world) {
    const { comet, state } = world;
    trail.length = 0;
    for (let index = 0; index < 26; index += 1) {
      const back = index * 0.011;
      trail.push({
        x: comet.x - comet.vx * back,
        y: comet.y - comet.vy * back,
        tilt: comet.tilt,
        glow: state.glow,
        depth: state.depth,
      });
    }
  }

  /** Paint the same frame twice, so a screenshot catches it complete (fonts, blurs and all). */
  function settle(world, screen, best) {
    frame(world, screen, best);
    frame(world, screen, best);
  }

  return { frame, settle, step, react, setAlive, clearTrail, seedTrail, paletteAt, formatNumber };
}
