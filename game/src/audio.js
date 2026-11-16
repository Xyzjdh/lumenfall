// The game's own sound, synthesised with the Web Audio API so the entry ships no audio files
// and loads nothing over the network: a soft pad under the fall, a chime for each mote, a bell
// for a star, a low knock for rock and wall, and a rising line when the descent ends.
//
// The context is made on the first key or click, as browsers require, and every voice is cheap
// and short: this is atmosphere, not a soundtrack to fight.

/** Scales per stratum, so the chimes climb as the comet sinks through the world. */
const SCALES = [
  [0, 2, 4, 7, 9, 12, 14, 16],
  [0, 3, 5, 7, 10, 12, 15, 17],
  [0, 2, 3, 7, 9, 12, 14, 15],
  [0, 2, 5, 7, 9, 12, 14, 17],
  [0, 4, 7, 11, 12, 16, 19, 23],
];

/** The root note of each stratum, in Hz. */
const ROOTS = [196.0, 174.61, 146.83, 130.81, 110.0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let pad = null;
  let padGain = null;
  let muted = false;
  let chain = 0;

  /** Make the audio graph once, on the player's first gesture. */
  function ensure() {
    if (ctx) return true;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return false;
    try {
      ctx = new Ctor();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  }

  /** One note: an oscillator through a short envelope, with an optional fifth. */
  function note(freq, when, length, gain, type = 'sine', detune = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(env);
    env.connect(master);
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  /**
   * The noise's own little generator. A thud is a texture, not an event, so it is drawn from a
   * fixed seed rather than from Math.random: the same hit sounds the same twice, and a run that
   * is recorded stays the run that was played.
   */
  let noiseState = 0x9e3779b9;
  function noise() {
    noiseState = (noiseState + 0x9e3779b9) >>> 0;
    let z = noiseState;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= (z + Math.imul(z ^ (z >>> 7), z | 61)) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 2147483648 - 1;
  }

  /** A short noise burst, for rock and wall: a thud rather than a pitch. */
  function thud(gain, length) {
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      const decay = 1 - index / frames;
      data[index] = noise() * decay * decay;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const env = ctx.createGain();
    env.gain.value = gain;
    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start();
  }

  /** A step on the stratum's scale. */
  function scaleNote(stratum, step) {
    const scale = SCALES[Math.min(SCALES.length - 1, Math.max(0, stratum))];
    const degree = scale[step % scale.length] + 12 * Math.floor(step / scale.length);
    const root = ROOTS[Math.min(ROOTS.length - 1, Math.max(0, stratum))];
    return root * Math.pow(2, degree / 12);
  }

  /** The pad: two detuned oscillators on the stratum's root, drifting under everything. */
  function startPad() {
    if (!ensure() || pad) return;
    padGain = ctx.createGain();
    padGain.gain.value = 0.055;
    padGain.connect(master);
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.value = ROOTS[0];
    b.frequency.value = ROOTS[0] * 1.5;
    a.detune.value = -7;
    b.detune.value = 9;
    a.connect(filter);
    b.connect(filter);
    filter.connect(padGain);
    a.start();
    b.start();
    pad = { a, b, filter };
  }

  /** Retune the pad to the stratum the comet is in. */
  function setStratum(index) {
    if (!pad || !ctx) return;
    const root = ROOTS[Math.min(ROOTS.length - 1, Math.max(0, index))];
    const now = ctx.currentTime;
    pad.a.frequency.cancelScheduledValues(now);
    pad.b.frequency.cancelScheduledValues(now);
    pad.a.frequency.linearRampToValueAtTime(root, now + 1.6);
    pad.b.frequency.linearRampToValueAtTime(root * 1.5, now + 1.6);
    pad.filter.frequency.linearRampToValueAtTime(600 + index * 190, now + 1.6);
  }

  const sounds = {
    mote() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      note(scaleNote(chain % 5, 2 + (chain % 5)), when, 0.30, 0.16);
      note(scaleNote(chain % 5, 4 + (chain % 5)), when + 0.02, 0.24, 0.07);
    },
    star() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      [0, 2, 4, 7].forEach((step, index) => {
        note(scaleNote(4, step), when + index * 0.055, 0.5, 0.13, 'triangle');
      });
    },
    hit() {
      if (!ensure()) return;
      thud(0.5, 0.34);
      note(74, ctx.currentTime, 0.26, 0.18, 'sawtooth', -30);
    },
    wall() {
      if (!ensure()) return;
      thud(0.14, 0.12);
    },
    stratum() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      [0, 3, 5, 8].forEach((step, index) => {
        note(scaleNote(chain % 5, step), when + index * 0.10, 0.7, 0.10, 'sine');
      });
    },
    over() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      [0, -2, -5, -9].forEach((step, index) => {
        note(scaleNote(0, step + 12), when + index * 0.16, 0.9, 0.14, 'triangle');
      });
      thud(0.35, 0.5);
    },
    win() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      [0, 4, 7, 11, 16, 19].forEach((step, index) => {
        note(scaleNote(4, step), when + index * 0.13, 1.2, 0.12, 'sine');
      });
    },
    start() {
      if (!ensure()) return;
      const when = ctx.currentTime;
      [0, 7].forEach((step, index) => note(scaleNote(0, step), when + index * 0.07, 0.45, 0.12, 'triangle'));
    },
  };

  /** Play one named sound, if the player has not muted it and a gesture has happened. */
  function play(name) {
    const sound = sounds[name];
    if (!sound || muted) return;
    sound();
  }

  /** Set the audio going on the first gesture, and keep the pad in step with the strata. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    startPad();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  /** Tell the sound which stratum the comet is in and how long its chain has run. */
  function context(stratumIndex, chainLength) {
    chain = chainLength;
    setStratum(stratumIndex);
  }

  return { play, unlock, toggleMute, context, isMuted: () => muted };
}
