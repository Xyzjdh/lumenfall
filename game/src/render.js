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
import {
  KIND_CHARGED,
  KIND_CINDER,
  KIND_FLASK,
  KIND_FROST,
  KIND_HEART,
  KIND_ICEBERG,
  KIND_LURE,
  KIND_MOTE,
  KIND_PRISM,
  KIND_SHIELD,
  KIND_SHARD,
  KIND_SLOW,
  KIND_STAR,
  KIND_SWIRLING,
} from './world.js';

/**
 * The corridor and the screen height are the core's to compute, not the renderer's: every frame
 * carries the world, so the two helpers below reach through it. `screenY` here takes the depth an
 * item sits at and answers in pixels up from the bottom, exactly as the script version did.
 */
function screenYOf(world, itemDepth) {
  return world.screenY(itemDepth);
}

/**
 * The corridor's middle and half-width at a depth, as the core computes them. `half` asks for the
 * width; without it the middle is answered. The flag has to reach the world: a wall drawn at the
 * centre line is a wall in the wrong place, and the tunnel then reads as two rails.
 */
function corridorAt(world, depth, half = false) {
  return world.corridorAt(depth, half);
}

/**
 * The scatter the sparks fly on: a fixed table of directions and speeds, drawn by index. Sparks
 * are decoration, but a screenshot is not decoration — it is a frame the page has to reproduce
 * exactly — so nothing in the draw path is allowed to consult Math.random.
 */
const SCATTER = (() => {
  const table = new Float32Array(512);
  let state = 0x9e3779b9;
  for (let index = 0; index < table.length; index += 1) {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= (z + Math.imul(z ^ (z >>> 7), z | 61)) >>> 0;
    table[index] = ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  return table;
})();
let scatterAt = 0;
function scatter() {
  const value = SCATTER[scatterAt % SCATTER.length];
  scatterAt += 1;
  return value;
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
/** The shop between runs: a list of upgrades, drawn over the falling world. */
export const SCREEN_SHOP = 'shop';

const TAU = Math.PI * 2;

/** Every achievement's name, by id, for the end screen's line. */
const ACHIEVEMENT_NAMES = {
  first: 'FIRST FALL', core: 'TO THE CORE', unharmed: 'UNTOUCHED', chain25: 'LONG THREAD',
  chain50: 'UNBROKEN', clean30: 'CLEAN HANDS', graze20: 'NERVE', shielded: 'BULWARK',
  guardian: 'GUARDIAN-SLAYER', daily: 'SAME STARS', thrifty: 'WELL KEPT', collector: 'FULL RIG',
};

/** The weather's names, in the core's own order. */
const WEATHER_NAMES = ['Clear', 'Headwind', 'Tailwind', 'Fog', 'Crosswind'];
/** The biome names, in the core's own order. */
const BIOME_NAMES = ['Quiet', 'Storm', 'Bloom', 'Glacier', 'Volcano', 'Eclipse'];
/** The combo's rating words, and the colour each one wears. */
const RATING_WORDS = ['', 'STEADY', 'GOOD', 'SHARP', 'PERFECT', 'UNREAL'];
const RATING_COLOURS = ['', 'rgba(226,246,255,0.62)', '#8fe3ff', '#a8ffb0', '#ffe07a', '#ff9d7a'];

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
        const a = scatter() * TAU;
        const s = 40 + scatter() * 150;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.5 + scatter() * 0.3, age: 0, size: 1.4 + scatter() * 1.8, warm: true });
      }
    }
    if (events & 2) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 22; i += 1) {
        const a = scatter() * TAU;
        const s = 60 + scatter() * 260;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + scatter() * 0.5, age: 0, size: 1.6 + scatter() * 2.6, warm: true });
      }
      flash = Math.max(flash, 0.35);
    }
    if (events & 4) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 26; i += 1) {
        const a = scatter() * TAU;
        const s = 70 + scatter() * 300;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + scatter() * 0.45, age: 0, size: 1.5 + scatter() * 2.2, warm: false });
      }
      shake = Math.max(shake, 11);
      flash = Math.max(flash, 0.4);
    }
    if (events & 8) {
      const p = at(comet.x, comet.y + 12);
      for (let i = 0; i < 3; i += 1) {
        sparks.push({ x: p.x, y: p.y, vx: (scatter() - 0.5) * 120, vy: scatter() * 90, life: 0.3, age: 0, size: 1.3, warm: true });
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
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
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
  function drawCorridor(world, state, palette) {
    const steps = 34;
    const left = [];
    const right = [];
    for (let index = 0; index <= steps; index += 1) {
      const y = (index / steps) * (VIEW.height + 40) - 20;
      const at = state.depth + (VIEW.height - y - VIEW.height * PLAYER_SCREEN_Y) / PIXELS_PER_METRE;
      const centre = VIEW.width / 2 + corridorAt(world, at);
      const half = corridorAt(world, at, true);
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
  function drawItem(world, item, state, palette) {
    const y = VIEW.height - screenYOf(world, item.at);
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

    if (item.kind === KIND_CHARGED) {
      // A storm-charged mote: a mote with an electric cage around it, and a flicker.
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22 * pulse);
      g.addColorStop(0, 'rgba(190,250,255,0.98)');
      g.addColorStop(0.3, alpha('#7fd4ff', 0.8));
      g.addColorStop(1, alpha('#3f7fff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 22 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha('#dff8ff', 0.9);
      ctx.lineWidth = 1.4;
      for (let bolt = 0; bolt < 3; bolt += 1) {
        const a = state.time * 7 + item.phase + (bolt * TAU) / 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a + 0.5) * 13, y + Math.sin(a + 0.5) * 13);
        ctx.lineTo(x + Math.cos(a + 0.2) * 18, y + Math.sin(a + 0.2) * 18);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, TAU);
      ctx.fill();
      return;
    }

    if (item.kind === KIND_SWIRLING) {
      // A mote with two small satellites turning around it.
      const g = ctx.createRadialGradient(x, y, 0, x, y, 18 * pulse);
      g.addColorStop(0, alpha(palette.mote, 0.95));
      g.addColorStop(0.4, alpha(palette.accent, 0.5));
      g.addColorStop(1, alpha(palette.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, TAU);
      ctx.fill();
      for (let moon = 0; moon < 2; moon += 1) {
        const a = state.time * 3.4 + item.phase + moon * Math.PI;
        ctx.fillStyle = alpha(palette.mote, 0.85);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 13, y + Math.sin(a) * 7, 2.3, 0, TAU);
        ctx.fill();
      }
      return;
    }

    if (item.kind === KIND_FROST) {
      // Glacier light: a mote inside a six-armed crystal.
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * pulse);
      g.addColorStop(0, 'rgba(235,255,255,0.95)');
      g.addColorStop(0.45, alpha('#a8e9ff', 0.5));
      g.addColorStop(1, alpha('#6fbaff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 16 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha('#e6fbff', 0.9);
      ctx.lineWidth = 1.6;
      for (let arm = 0; arm < 6; arm += 1) {
        const a = (arm / 6) * TAU + state.time * 0.6 + item.phase;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, TAU);
      ctx.fill();
      return;
    }

    if (item.kind === KIND_PRISM) {
      // A star refracted: a rotating triangle with a rainbow edge.
      const size = 15 * pulse;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(state.time * 1.2 + item.phase);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.2, 0, TAU);
      ctx.fill();
      const hues = ['#ff9d7a', '#ffe07a', '#a8ffb0', '#8fd4ff', '#c59bff'];
      for (let edge = 0; edge < 3; edge += 1) {
        ctx.strokeStyle = alpha(hues[(edge + Math.floor(state.time * 2)) % hues.length], 0.95);
        ctx.lineWidth = 2.2;
        const a0 = (edge / 3) * TAU;
        const a1 = ((edge + 1) / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * size, Math.sin(a0) * size);
        ctx.lineTo(Math.cos(a1) * size, Math.sin(a1) * size);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (item.kind === KIND_CINDER) {
      // A cinder: a hot ember with a short upward tail.
      const size = item.drawR ?? item.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 1.8);
      g.addColorStop(0, 'rgba(255,240,190,0.98)');
      g.addColorStop(0.35, alpha('#ff8a3d', 0.85));
      g.addColorStop(1, alpha('#b2251a', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha('#ffb066', 0.55);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.4);
      ctx.quadraticCurveTo(x + Math.sin(state.time * 6 + item.phase) * 7, y + size * 1.6, x, y + size * 2.6);
      ctx.stroke();
      return;
    }

    // The pickups: things that are taken rather than dodged, so they read as objects, not light.
    if (item.kind === KIND_FLASK || item.kind === KIND_SHIELD || item.kind === KIND_SLOW
      || item.kind === KIND_LURE || item.kind === KIND_HEART) {
      const colour = {
        flask: '#ffe9a8', shield: '#9fe8ff', slow: '#b8a8ff', lure: '#ff9fe0', heart: '#ff7a9c',
      }[item.kind];
      const bob = Math.sin(state.time * 2.6 + item.wobble) * 2.2;
      ctx.save();
      ctx.translate(x, y + bob);
      // A soft capsule of light behind it, so a dark corridor still shows it.
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
      g.addColorStop(0, alpha(colour, 0.5));
      g.addColorStop(1, alpha(colour, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha(colour, 0.95);
      ctx.fillStyle = alpha(colour, 0.22);
      ctx.lineWidth = 1.8;
      if (item.kind === KIND_FLASK) {
        ctx.beginPath();
        ctx.moveTo(-4, -11);
        ctx.lineTo(4, -11);
        ctx.lineTo(4, -5);
        ctx.lineTo(9, 6);
        ctx.quadraticCurveTo(9, 12, 0, 12);
        ctx.quadraticCurveTo(-9, 12, -9, 6);
        ctx.lineTo(-4, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.kind === KIND_SHIELD) {
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(10, -6);
        ctx.lineTo(10, 3);
        ctx.quadraticCurveTo(10, 11, 0, 13);
        ctx.quadraticCurveTo(-10, 11, -10, 3);
        ctx.lineTo(-10, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.kind === KIND_SLOW) {
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -6);
        ctx.moveTo(0, 0);
        ctx.lineTo(5, 2);
        ctx.stroke();
      } else if (item.kind === KIND_LURE) {
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, TAU);
        ctx.fill();
        ctx.stroke();
        for (let ring = 1; ring <= 2; ring += 1) {
          ctx.beginPath();
          ctx.arc(0, 0, 4.5 + ring * 5.5, 0, TAU);
          ctx.globalAlpha = 0.6 - ring * 0.2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(0, 11);
        ctx.bezierCurveTo(-13, 2, -9, -11, 0, -5);
        ctx.bezierCurveTo(9, -11, 13, 2, 0, 11);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Rock: a faceted stone, or a long shard, in the stratum's own stone colour.
    const size = item.drawR ?? item.r;
    const rot = item.rot + state.time * item.spin * (item.kind === KIND_ICEBERG ? 0.35 : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // The shadow it throws toward the corridor's middle, so it sits in the world.
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.9, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fill();
    const shard = item.kind === KIND_SHARD;
    const facets = shard ? 5 : item.kind === KIND_ICEBERG ? 6 : 7;
    if (item.kind === KIND_ICEBERG) {
      // Ice: a pale body instead of the stratum's stone, so it reads as a different hazard.
      ctx.beginPath();
      for (let index = 0; index < facets; index += 1) {
        const a = (index / facets) * TAU;
        const r = size * (0.9 + 0.18 * Math.sin(index * 1.7 + item.wobble));
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r * 1.05;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const ice = ctx.createLinearGradient(-size, -size, size, size);
      ice.addColorStop(0, 'rgba(214,246,255,0.96)');
      ice.addColorStop(1, 'rgba(96,150,196,0.92)');
      ctx.fillStyle = ice;
      ctx.fill();
      ctx.strokeStyle = alpha('#ffffff', 0.5);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
      return;
    }
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
    const life = Math.max(0, Math.min(1, state.glow / (state.maxGlow || GLOW.max)));
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

    // The world's own line: which biome, what the sky is doing, and the milestone behind you.
    // It sits under the rail in the same small type, so the HUD grew a sentence and not a panel.
    const biome = BIOME_NAMES[state.biome] ?? 'Quiet';
    const weather = WEATHER_NAMES[state.weather] ?? 'Clear';
    const mood = weather === 'Clear' ? biome.toUpperCase() : `${biome.toUpperCase()}  ·  ${weather.toUpperCase()}`;
    drawTag(pad, 112, mood, palette.accent);

    // The milestone sits under the mood, not beside it: a pill's width follows its text, so two
    // pills on one line overlap the moment either grows.
    if (state.milestone > 0) {
      drawTag(pad, 132, `${formatNumber(state.milestone)} M`, alpha('#ffffff', 0.55));
    }

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
    const life = Math.max(0, Math.min(1, state.glow / (state.maxGlow || GLOW.max)));
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
    const tank = state.maxGlow || GLOW.max;
    ctx.fillText(`${Math.ceil((state.glow / tank) * 100)}%`, gx + barW + 12, gy + 11);

    // The powers held: a row of small badges with the seconds they have left.
    drawPowers(state, palette, gx, gy - 42);

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

    // The combo's judgement, under the multiplier: what the last few seconds were worth.
    if (state.rating > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = RATING_COLOURS[state.rating] ?? INK_DIM;
      ctx.font = "700 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2.6px';
      ctx.fillText(RATING_WORDS[state.rating] ?? '', VIEW.width - pad, VIEW.height - 92);
      ctx.letterSpacing = '0px';
      if (state.clean > 4) {
        ctx.fillStyle = INK_FAINT;
        ctx.font = "600 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
        ctx.fillText(`CLEAN ${state.clean.toFixed(1)}s`, VIEW.width - pad, VIEW.height - 78);
      }
    }

    // The guardian: a bar across the top and its attack, while the fight is on.
    if (state.guardian === 1) {
      const w = VIEW.width * 0.46;
      const x = (VIEW.width - w) / 2;
      const y = 22;
      ctx.textAlign = 'center';
      ctx.fillStyle = alpha('#ffd2d2', 0.92);
      ctx.font = "700 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '4px';
      ctx.fillText('THE GUARDIAN', VIEW.width / 2, y - 6);
      ctx.letterSpacing = '0px';
      panel(x, y, w, 8, 4, alpha('#000000', 0.5), alpha('#ff9d9d', 0.35));
      panel(x, y, Math.max(2, w * Math.max(0, Math.min(1, state.guardianHealth))), 8, 4, '#ff6b6b');
      ctx.fillStyle = alpha('#ffb9b9', 0.8);
      ctx.font = "600 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2px';
      ctx.fillText('THE ARENA IS CLOSING', VIEW.width / 2, y + 24);
      ctx.letterSpacing = '0px';
    }

    // Milestones and guardian beats: a line that says what just happened, briefly.
    if (bannerTimer > 0 && bannerText) {
      const t = Math.min(1, bannerTimer / 0.4);
      ctx.globalAlpha = t;
      ctx.textAlign = 'center';
      ctx.fillStyle = bannerColour;
      ctx.font = "800 20px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '5px';
      ctx.fillText(bannerText, VIEW.width / 2, VIEW.height * 0.42);
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
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

  /** A small stat pill: a capsule with a word in it, and no box around the whole HUD. */
  function drawTag(x, y, text, colour) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = "700 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2px';
    const w = ctx.measureText(text).width + 14;
    panel(x, y, w, 15, 7.5, alpha('#000000', 0.3), alpha(colour, 0.4));
    ctx.fillStyle = colour;
    ctx.fillText(text, x + 7, y + 8);
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
  }

  /** The powers the comet is holding, as badges: name and seconds. */
  function drawPowers(state, palette, x, y) {
    const held = [
      ['SHIELD', state.shields > 0 ? String(state.shields) : '', '#9fe8ff'],
      ['SLOW', state.slow > 0 ? `${state.slow.toFixed(1)}s` : '', '#b8a8ff'],
      ['LURE', state.lure > 0 ? `${state.lure.toFixed(1)}s` : '', '#ff9fe0'],
      ['×2', state.double > 0 ? `${state.double.toFixed(1)}s` : '', '#ffe9a8'],
    ].filter(([, value]) => value !== '');
    let cursor = x;
    for (const [name, value, colour] of held) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = "700 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '1.6px';
      const label = `${name} ${value}`;
      const w = ctx.measureText(label).width + 14;
      panel(cursor, y, w, 15, 7.5, alpha(colour, 0.14), alpha(colour, 0.55));
      ctx.fillStyle = colour;
      ctx.fillText(label, cursor + 7, y + 8);
      ctx.letterSpacing = '0px';
      ctx.textBaseline = 'alphabetic';
      cursor += w + 6;
      void palette;
    }
  }

  /** A short line of text across the middle of the play screen: a milestone, a guardian beat. */
  let bannerText = '';
  let bannerTimer = 0;
  let bannerColour = INK;
  function banner(text, colour = INK) {
    bannerText = text;
    bannerColour = colour;
    bannerTimer = 1.6;
  }

  /**
   * The run's own statistics, under the end screen's scoreboard: depth, chain, clean streak,
   * near misses, pickups, and the shards the run paid. A record is named in the accent colour.
   * Drawn only when a run has ended in this visit; a staged shot has no run to summarise.
   */
  function drawRunSummary(palette) {
    if (!runEnd || !Array.isArray(runEnd.rows)) return;
    const rows = runEnd.rows;
    const perRow = rows.length > 4 ? Math.ceil(rows.length / 2) : rows.length;
    const columnW = 190;
    const left = VIEW.width / 2 - columnW + 20;
    const startY = VIEW.height - 176;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const column = Math.floor(index / perRow);
      const line = index % perRow;
      const x = left + column * columnW * 2;
      const y = startY + line * 17;
      ctx.textAlign = 'left';
      ctx.fillStyle = row.record ? palette.accent : INK_FAINT;
      ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2.2px';
      ctx.fillText(row.label, x, y);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'right';
      ctx.fillStyle = row.record ? INK : INK_DIM;
      ctx.font = "700 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(row.value, x + 150, y);
    }
    // The purse line: what the run paid, and what the book now holds.
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.mote;
    ctx.font = "700 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.6px';
    const earned = `+${runEnd.shards ?? 0} SHARDS`;
    ctx.fillText(earned, VIEW.width / 2, VIEW.height - 24);
    ctx.letterSpacing = '0px';
    if (runEnd.earned && runEnd.earned.length > 0) {
      const names = runEnd.earned
        .map((id) => ACHIEVEMENT_NAMES[id] ?? id)
        .join('  ·  ');
      ctx.fillStyle = INK_DIM;
      ctx.font = "600 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2px';
      ctx.fillText(names, VIEW.width / 2, VIEW.height - 8);
      ctx.letterSpacing = '0px';
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
  function drawTitle(state, palette) {
    scrim(0.42);
    drawWordmark(VIEW.width / 2, VIEW.height * 0.30, palette, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = "500 19px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('Fall 4,000 metres to the core of a gas giant.', VIEW.width / 2, VIEW.height * 0.50);
    ctx.fillStyle = INK_DIM;
    ctx.font = "400 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText('Catch light motes. Your glow is your life — and it burns faster the deeper you fall.', VIEW.width / 2, VIEW.height * 0.545);
    ctx.fillStyle = inkFaintColour();
    ctx.fillText('Strike the walls or the rock and it drains away.', VIEW.width / 2, VIEW.height * 0.578);

    // The save's own lines: the biome on offer, the shards in the purse, and today's descent.
    const details = titleDetails();
    if (details) {
      const y = VIEW.height * 0.612;
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.accent;
      ctx.font = "700 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '3px';
      const daily = details.daily;
      const dailyText = daily?.played ? `TODAY'S DESCENT  ${formatNumber(daily.best)}` : "TODAY'S DESCENT — UNPLAYED";
      ctx.fillText(`${details.biome.toUpperCase()} BIOME  ·  ${details.shards} SHARDS  ·  ${details.books.text}  ·  ${dailyText}`, VIEW.width / 2, y);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = alpha(palette.accent, 0.62);
      ctx.font = "400 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(details.blurb, VIEW.width / 2, y + 15);
      ctx.fillStyle = INK_FAINT;
      ctx.font = "600 9px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '2px';
      ctx.fillText('B CHANGE BIOME   ·   D TODAY\'S DESCENT   ·   SHIFT+S SUPPLY', VIEW.width / 2, y + 30);
      ctx.letterSpacing = '0px';
    }

    // The controls row.
    const rowY = VIEW.height * 0.752;
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

    // The one prompt, pulsing so it reads as live rather than painted. The pulse is the run's,
    // not the machine's: `state.time` advances only while the world does, so a paused game holds
    // still and a screenshot of the same instant is the same picture.
    const pulse = 0.62 + 0.38 * Math.sin(state.time * 2.6);
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

    const pulse = 0.62 + 0.38 * Math.sin(state.time * 2.6);
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

    panel(VIEW.width / 2 - 268, VIEW.height * 0.365, 536, 150, 18, 'rgba(255,252,240,0.88)', alpha('#000000', 0.18));
    const rows = [
      ['FINAL SCORE', formatNumber(state.score)],
      ['TIME', formatClock(state.time)],
      ['MOTES · STARS', `${state.motesTaken} · ${state.starsTaken}`],
      ['ROCK CLEARED', `${state.rocksPassed}`],
    ];
    rows.forEach(([label, value], index) => {
      const y = VIEW.height * 0.365 + 40 + index * 32;
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

    const pulse = 0.62 + 0.38 * Math.sin(state.time * 2.6);
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
    if (jolt > 0.2) ctx.translate((scatter() - 0.5) * jolt, (scatter() - 0.5) * jolt);

    drawSky(state, palette, state.depth * PIXELS_PER_METRE);
    drawCorridor(world, state, palette);
    for (const item of world.items) {
      const y = screenYOf(world, item.at);
      if (y < -80 || y > VIEW.height + 120) continue;
      drawItem(world, item, state, palette);
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
      drawTitle(state, palette);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, palette, best);
      drawPaused(palette);
    } else if (screen === SCREEN_OVER) {
      drawOver(state, palette, best);
      drawRunSummary(palette);
    } else if (screen === SCREEN_WIN) {
      drawWin(state, palette, best);
      drawRunSummary(palette);
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

  /** What the end screen says about the run that just ended. */
  let runEnd = null;
  function setRunEnd(summary) {
    runEnd = summary;
  }

  /** What the title says about the save: the biome on offer, the shards, the book, the daily. */
  let titleInfo = null;
  function setTitleInfo(info) {
    titleInfo = info;
  }
  function titleDetails() {
    if (!titleInfo) return null;
    try {
      return {
        biome: titleInfo.biome(),
        blurb: titleInfo.blurb(),
        shards: titleInfo.shards(),
        books: titleInfo.books(),
        daily: titleInfo.daily(),
        records: titleInfo.records(),
      };
    } catch {
      return null;
    }
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

  return {
    frame, settle, step, react, setAlive, clearTrail, seedTrail, paletteAt, formatNumber, banner,
    setRunEnd, setTitleInfo, titleDetails,
    // The shop screen draws its own list, over the world: it gets the ink, the panels and the
    // palette function, not a second copy of them.
    ink: { INK, INK_DIM, INK_FAINT, panel, alpha, paletteAt },
  };
}
