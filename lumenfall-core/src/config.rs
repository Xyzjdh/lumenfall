// Every number the game is tuned by, in one place. The script version kept these as literals in
// game/src/config.js; here they are a struct the tuning harness can search over, which is the
// point of moving the rules into Rust: a run is cheap enough to play thousands of times.
//
// Distances are metres of descent ("depth"). PIXELS_PER_METRE turns them into the screen's
// pixels. Coordinates are:
//   x     = pixels from the middle of the corridor, positive to the right
//   y     = pixels up the screen, the comet kept at PLAYER_SCREEN_Y from the bottom
//   depth = metres fallen since the start

use core::fmt;

/// The fixed drawing size. The canvas is scaled to the window with letterboxing.
pub const VIEW_W: f32 = 960.0;
pub const VIEW_H: f32 = 540.0;

/// The comet sits here, from the bottom, so most of the screen shows what is coming.
pub const PLAYER_SCREEN_Y: f32 = 0.30;

/// One physics step. The loop feeds the world in fixed steps of this length.
pub const STEP: f32 = 1.0 / 60.0;

/// The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped.
pub const MAX_FRAME: f32 = 0.25;

/// How many pixels one metre of descent moves the world up the screen.
pub const PIXELS_PER_METRE: f32 = 5.5;

/// The run's goal: the core of the world, and the win screen, at this depth.
pub const GOAL_DEPTH_M: f32 = 4000.0;

/// The comet's home line, in pixels from the bottom of the screen.
pub fn home_y() -> f32 {
    VIEW_H * PLAYER_SCREEN_Y
}

/// How far up and down the comet may be steered from home, in pixels.
pub const STEER_Y: f32 = 74.0;

/// A knob the tuning harness may move, with the range it may move in. The range is the design
/// envelope: outside it the game stops being the game we set out to make, so the search stays in.
#[derive(Clone, Copy, Debug)]
pub struct Knob {
    pub name: &'static str,
    pub lo: f32,
    pub hi: f32,
}

/// The knobs, in the order `GAINS` reads them.
pub const KNOBS: &[Knob] = &[
    Knob { name: "glow_start", lo: 85.0, hi: 100.0 },
    Knob { name: "glow_drain_base", lo: 2.2, hi: 4.2 },
    Knob { name: "glow_drain_per_mps", lo: 0.010, hi: 0.028 },
    Knob { name: "glow_mote", lo: 5.5, hi: 11.0 },
    Knob { name: "glow_star", lo: 14.0, hi: 30.0 },
    Knob { name: "glow_stratum_refill", lo: 8.0, hi: 26.0 },
    Knob { name: "mote_gap_start", lo: 0.58, hi: 0.88 },
    Knob { name: "mote_gap_end", lo: 0.40, hi: 0.66 },
    Knob { name: "rock_gap_start", lo: 1.35, hi: 2.35 },
    Knob { name: "rock_gap_end", lo: 0.70, hi: 1.30 },
    Knob { name: "star_chance", lo: 0.10, hi: 0.34 },
    Knob { name: "shard_chance", lo: 0.16, hi: 0.55 },
    Knob { name: "wall_drain", lo: 5.0, hi: 14.0 },
    Knob { name: "rock_drain", lo: 12.0, hi: 26.0 },
    Knob { name: "corridor_base", lo: 262.0, hi: 340.0 },
    Knob { name: "corridor_breathe", lo: 18.0, hi: 46.0 },
    Knob { name: "player_speed", lo: 372.0, hi: 500.0 },
    Knob { name: "speed_start", lo: 26.0, hi: 38.0 },
    Knob { name: "speed_end", lo: 84.0, hi: 116.0 },
    Knob { name: "chain_step", lo: 5.0, hi: 14.0 },
];

/// One point in the search space: a value for every knob.
pub type Gains = [f32; KNOBS.len()];

fn idx(name: &str) -> usize {
    KNOBS.iter().position(|k| k.name == name).expect(name)
}

/// The gains the script shipped with, at the middle of the game we already know plays well.
pub const SHIPPED: Gains = [
    100.0, // glow_start
    3.0,   // glow_drain_base
    0.018, // glow_drain_per_mps
    8.0,   // glow_mote
    22.0,  // glow_star
    18.0,  // glow_stratum_refill
    0.70,  // mote_gap_start
    0.52,  // mote_gap_end
    1.75,  // rock_gap_start
    0.92,  // rock_gap_end
    0.20,  // star_chance
    0.35,  // shard_chance
    9.0,   // wall_drain
    18.0,  // rock_drain
    300.0, // corridor_base
    34.0,  // corridor_breathe
    430.0, // player_speed
    30.0,  // speed_start
    100.0, // speed_end
    8.0,   // chain_step
];

/// A value read by name, so the interface can set one knob without knowing the layout.
pub fn set(gains: &mut Gains, name: &str, value: f32) {
    if let Some(i) = KNOBS.iter().position(|k| k.name == name) {
        gains[i] = value.clamp(KNOBS[i].lo, KNOBS[i].hi);
    }
}

/// Reads the value of a knob, or NaN when there is no such knob.
pub fn get(gains: &Gains, name: &str) -> f32 {
    KNOBS.iter().position(|k| k.name == name).map(|i| gains[i]).unwrap_or(f32::NAN)
}

/// One knob's value, by index. Used by the browser to read back what it set.
pub fn by_index(gains: &Gains, i: usize) -> f32 {
    gains.get(i).copied().unwrap_or(f32::NAN)
}

/// Where a knob sits in `KNOBS`, or usize::MAX when there is no such knob.
pub fn index_of(name: &str) -> usize {
    match idx(name) {
        i if i < KNOBS.len() => i,
        _ => usize::MAX,
    }
}

/// The gains, written the way the harness prints them.
impl fmt::Display for GainsView<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, knob) in KNOBS.iter().enumerate() {
            if i > 0 {
                write!(f, " ")?;
            }
            write!(f, "{}={}", knob.name, self.0[i])?;
        }
        Ok(())
    }
}

/// A printed view over a set of gains.
pub struct GainsView<'a>(pub &'a Gains);

/// The fixed scoring and feeling constants: the run's shape, which is not a tuning knob.
pub struct Rules;

impl Rules {
    pub const PLAYER_RADIUS: f32 = 11.0;
    pub const PLAYER_ACCEL: f32 = 3400.0;
    pub const PLAYER_DRAG: f32 = 2600.0;
    pub const CORRIDOR_MIN: f32 = 210.0;
    /// A star is worth this many motes of chain.
    pub const STAR_CHAIN: i32 = 3;
    /// A rock is knocked aside with this sideways kick, and this upward one.
    pub const ROCK_KICK_X: f32 = 190.0;
    pub const ROCK_KICK_Y: f32 = 90.0;
    /// The chain multiplier tops out here.
    pub const CHAIN_MAX_MULT: f32 = 5.0;
    /// Score per metre, per mote, per star, per stratum.
    pub const SCORE_PER_METRE: f32 = 1.0;
    pub const SCORE_MOTE: f32 = 12.0;
    pub const SCORE_STAR: f32 = 40.0;
    pub const SCORE_STRATUM: f32 = 250.0;
    /// Spawning: how far ahead the world is laid out, and how many motes an arc holds.
    pub const SPAWN_AHEAD_M: f32 = 150.0;
    pub const CLUSTER_MIN: i32 = 4;
    pub const CLUSTER_MAX: i32 = 6;
    pub const ROCK_RADIUS_MIN: f32 = 15.0;
    pub const ROCK_RADIUS_MAX: f32 = 29.0;
}

/// The five strata: the run is told in bands of depth, each with its own palette and name.
pub struct Stratum {
    pub at: f32,
    pub name: &'static str,
}

pub const STRATA: &[Stratum] = &[
    Stratum { at: 0.0, name: "AZURE VEIL" },
    Stratum { at: 800.0, name: "EMBER WASTE" },
    Stratum { at: 1600.0, name: "VERDANT HUSH" },
    Stratum { at: 2400.0, name: "VIOLET REACH" },
    Stratum { at: 3200.0, name: "GILDED CORE" },
];

/// Stands for a new stratum and returns its index.
pub fn stratum_index_at(depth: f32) -> usize {
    let mut found = 0;
    for (i, s) in STRATA.iter().enumerate() {
        if depth >= s.at {
            found = i;
        }
    }
    found
}

/// The depth of the next stratum's edge, or f32::INFINITY at the core.
pub fn next_stratum_at(depth: f32) -> f32 {
    for s in STRATA {
        if s.at > depth {
            return s.at;
        }
    }
    f32::INFINITY
}

/// 0 at the start of the run, 1 at the core: everything that tightens follows this.
pub fn progress(depth: f32) -> f32 {
    (depth / GOAL_DEPTH_M).clamp(0.0, 1.0)
}

/// The descent speed at a depth, from the gains.
pub fn descend_speed_at(gains: &Gains, depth: f32) -> f32 {
    let t = progress(depth);
    gains[idx("speed_start")] + (gains[idx("speed_end")] - gains[idx("speed_start")]) * t
}

/// How fast the glow drains a second at a depth, before the mote economy is considered.
pub fn glow_drain_at(gains: &Gains, depth: f32) -> f32 {
    gains[idx("glow_drain_base")] + descend_speed_at(gains, depth) * gains[idx("glow_drain_per_mps")]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_knob_name_is_unique_and_the_shipped_gains_are_inside_the_envelope() {
        for (i, knob) in KNOBS.iter().enumerate() {
            for other in KNOBS.iter().skip(i + 1) {
                assert_ne!(knob.name, other.name, "two knobs named {}", knob.name);
            }
            let v = SHIPPED[i];
            assert!(
                (knob.lo..=knob.hi).contains(&v),
                "shipped {}={v} sits outside its envelope {}..={}",
                knob.name,
                knob.lo,
                knob.hi
            );
        }
    }

    #[test]
    fn the_gains_list_and_the_values_list_are_the_same_length() {
        assert_eq!(KNOBS.len(), SHIPPED.len());
    }

    #[test]
    fn set_clamps_to_the_envelope() {
        let mut g = SHIPPED;
        set(&mut g, "glow_mote", 1_000.0);
        assert!((get(&g, "glow_mote") - 11.0).abs() < 1e-6);
        set(&mut g, "glow_mote", -50.0);
        assert!((get(&g, "glow_mote") - 5.5).abs() < 1e-6);
        assert!(get(&g, "not_a_knob").is_nan());
    }

    #[test]
    fn the_strata_are_in_order_and_cover_the_run() {
        for pair in STRATA.windows(2) {
            assert!(pair[1].at > pair[0].at, "strata out of order at {}", pair[1].name);
        }
        assert!(STRATA.last().unwrap().at < GOAL_DEPTH_M, "the core must be reachable");
        assert_eq!(stratum_index_at(-5.0), 0);
        assert_eq!(stratum_index_at(10_000.0), STRATA.len() - 1);
    }

    #[test]
    fn a_new_stratum_is_found_exactly_once_per_edge() {
        assert_eq!(next_stratum_at(0.0), 800.0);
        assert_eq!(next_stratum_at(799.9), 800.0);
        assert_eq!(next_stratum_at(800.0), 1600.0);
        assert!(next_stratum_at(3999.0).is_infinite());
    }
}
