// The world: the falling comet, the corridor it falls through, the motes that feed it and the
// rock that eats it. Pure state and rules: no drawing, no sound, no browser. Everything here is
// reproducible from a seed and a list of steering choices, which is what lets the screenshot
// scenes play the real rules forward and stage an honest frame — and what lets the tuning
// harness play ten thousand runs in a second.

use crate::config::*;
use crate::rng::Rng;

/// Events a step reports back, as a bit field. Kept identical to the script's constants so the
/// page reads them the same way it always did.
pub const EVENT_MOTE: u32 = 1;
pub const EVENT_STAR: u32 = 2;
pub const EVENT_HIT: u32 = 4;
pub const EVENT_WALL: u32 = 8;
pub const EVENT_OVER: u32 = 16;
pub const EVENT_WIN: u32 = 32;
pub const EVENT_STRATUM: u32 = 64;

/// What an item in the water is.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Mote,
    Star,
    Stone,
    Shard,
}

impl Kind {
    pub fn is_light(self) -> bool {
        matches!(self, Kind::Mote | Kind::Star)
    }

    /// The number the interface uses for a kind, so the page can colour by it.
    pub fn code(self) -> u32 {
        match self {
            Kind::Mote => 0,
            Kind::Star => 1,
            Kind::Stone => 2,
            Kind::Shard => 3,
        }
    }
}

/// One thing in the water: a mote, a star, a stone or a shard.
#[derive(Clone, Debug)]
pub struct Item {
    pub kind: Kind,
    /// Pixels from the middle of the corridor.
    pub x: f32,
    /// The depth it sits at, in metres of descent.
    pub at: f32,
    /// Its collision radius.
    pub r: f32,
    /// What it draws as; the collision radius is a little smaller so it plays fair.
    pub draw_r: f32,
    pub rot: f32,
    pub spin: f32,
    pub wobble: f32,
    pub phase: f32,
    pub active: bool,
}

/// The comet.
#[derive(Clone, Debug)]
pub struct Comet {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub tilt: f32,
    pub radius: f32,
    pub alive: bool,
}

/// The numbers a run is scored and measured by. The page reads these for its HUD.
#[derive(Clone, Debug, Default)]
pub struct State {
    pub depth: f32,
    pub speed: f32,
    pub glow: f32,
    pub score: f32,
    pub best: f32,
    pub chain: i32,
    pub motes_taken: u32,
    pub stars_taken: u32,
    pub hits_wall: u32,
    pub rocks_passed: u32,
    pub rock_hits: u32,
    pub stratum: usize,
    pub stratum_banner: f32,
    pub time: f32,
}

/// The corridor's middle, in pixels from the centre line, at a depth: two slow sine drifts.
pub fn corridor_centre(depth: f32) -> f32 {
    (depth / 430.0).sin() * 88.0 + (depth / 137.0 + 1.7).sin() * 42.0
}

/// The corridor's half-width at a depth: it breathes, and now and then it pinches.
pub fn corridor_half_width(gains: &Gains, depth: f32) -> f32 {
    let breathe = (depth / 220.0 + 0.9).sin() * get(gains, "corridor_breathe");
    // A pinch is a slow dip repeated every 340 m: deeper in, it bites harder.
    let bite = (depth / 108.1).sin().max(0.0).powi(6) * (26.0 + 74.0 * progress(depth));
    (get(gains, "corridor_base") + breathe - bite).max(Rules::CORRIDOR_MIN)
}

/// Where an item at a depth shows on screen, in pixels up from the bottom.
pub fn screen_y(item_depth: f32, depth: f32) -> f32 {
    home_y() + (item_depth - depth) * PIXELS_PER_METRE
}

/// What the loop asks the comet to do this step: -1..1 on each axis.
#[derive(Clone, Copy, Debug, Default)]
pub struct Steer {
    pub x: f32,
    pub y: f32,
}

/// The world, and the gains it is played with.
pub struct World {
    pub state: State,
    pub comet: Comet,
    pub items: Vec<Item>,
    pub gains: Gains,
    rng: Rng,
    mote_clock: f32,
    rock_clock: f32,
    stratum_edge: f32,
    seed: u32,
    step_count: u64,
}

impl World {
    /// A fresh, idle world at the start of the descent.
    pub fn new(seed: u32, gains: Gains) -> Self {
        let mut world = World {
            state: State::default(),
            comet: Comet {
                x: 0.0,
                y: home_y(),
                vx: 0.0,
                vy: 0.0,
                tilt: 0.0,
                radius: Rules::PLAYER_RADIUS,
                alive: true,
            },
            items: Vec::with_capacity(256),
            gains,
            rng: Rng::new(seed),
            mote_clock: 0.9,
            rock_clock: 2.2,
            stratum_edge: next_stratum_at(0.0),
            seed,
            step_count: 0,
        };
        world.reset();
        world
    }

    /// The multiplier a run of unbroken motes earns: 1, and up to 5 as the chain grows.
    pub fn multiplier(&self) -> f32 {
        let step = get(&self.gains, "chain_step").max(1.0);
        1.0 + (self.state.chain as f32 / step).floor().min(Rules::CHAIN_MAX_MULT - 1.0)
    }

    /// The corridor under the comet right now.
    pub fn corridor(&self) -> (f32, f32) {
        (
            corridor_centre(self.state.depth),
            corridor_half_width(&self.gains, self.state.depth),
        )
    }

    /// Why the run ended, if it has: 1 for the core reached, 2 for the glow spent.
    pub fn outcome(&self) -> u32 {
        if self.state.depth >= GOAL_DEPTH_M {
            1
        } else if !self.comet.alive {
            2
        } else {
            0
        }
    }

    pub fn seed(&self) -> u32 {
        self.seed
    }

    pub fn steps(&self) -> u64 {
        self.step_count
    }

    /// Starts the descent over: a new seed lays out a new world, the same seed the same one.
    pub fn reset(&mut self) {
        self.state = State {
            depth: 0.0,
            speed: descend_speed_at(&self.gains, 0.0),
            glow: get(&self.gains, "glow_start"),
            score: 0.0,
            best: self.state.best,
            chain: 0,
            motes_taken: 0,
            stars_taken: 0,
            hits_wall: 0,
            rocks_passed: 0,
            rock_hits: 0,
            stratum: 0,
            stratum_banner: 0.0,
            time: 0.0,
        };
        self.comet.x = 0.0;
        self.comet.y = home_y();
        self.comet.vx = 0.0;
        self.comet.vy = 0.0;
        self.comet.tilt = 0.0;
        self.comet.alive = true;
        self.items.clear();
        self.rng = Rng::new(self.seed);
        self.mote_clock = 0.9;
        self.rock_clock = 2.2;
        self.stratum_edge = next_stratum_at(0.0);
        self.step_count = 0;
    }

    /// A new seed, and a fresh descent into it.
    pub fn reseed(&mut self, seed: u32) {
        self.seed = seed;
        self.reset();
    }

    /// Lay out one arc of motes, or one bright star, at a depth.
    fn spawn_mote_cluster(&mut self, at_depth: f32) {
        let half = corridor_half_width(&self.gains, at_depth);
        let centre = corridor_centre(at_depth);
        let room = half - 26.0;
        let t = progress(at_depth);

        if self.rng.chance(get(&self.gains, "star_chance")) {
            let x = centre + self.rng.centred() * room * 0.8;
            self.items.push(Item {
                kind: Kind::Star,
                x,
                at: at_depth,
                r: 15.0,
                draw_r: 15.0,
                rot: 0.0,
                spin: 0.0,
                wobble: 0.0,
                phase: self.rng.range(0.0, 6.28),
                active: true,
            });
            return;
        }

        let count = self
            .rng
            .int(Rules::CLUSTER_MIN + if t > 0.6 { 1 } else { 0 }, Rules::CLUSTER_MAX);
        // An arc across the corridor, leaning the way the corridor leans, so it rewards a sweep.
        let lean = self.rng.range(-0.55, 0.55);
        let span = (room * 1.2).min(count as f32 * 19.0);
        let start_x = centre - span / 2.0 + self.rng.range(-0.2, 0.2) * room;
        for index in 0..count {
            let f = if count == 1 { 0.5 } else { index as f32 / (count - 1) as f32 };
            let bow = (f * core::f32::consts::PI).sin() * 26.0;
            let x = start_x + f * span + bow * lean;
            let at = at_depth + (f - 0.5) * span * 0.06;
            self.items.push(Item {
                kind: Kind::Mote,
                x,
                at,
                r: 7.0,
                draw_r: 7.0,
                rot: 0.0,
                spin: 0.0,
                wobble: 0.0,
                phase: self.rng.range(0.0, 6.28),
                active: true,
            });
        }
    }

    /// Drop one rock at a depth, kept clear of the corridor's walls so it can always be passed.
    fn spawn_rock(&mut self, at_depth: f32) {
        let half = corridor_half_width(&self.gains, at_depth);
        let centre = corridor_centre(at_depth);
        let t = progress(at_depth);
        let size = self
            .rng
            .range(Rules::ROCK_RADIUS_MIN, Rules::ROCK_RADIUS_MAX);
        let room = (half - size - 16.0).max(0.0);
        // Keep the rock's own line clear of the comet's resting line near where it will be met:
        // fair play, and it stops a rock being laid exactly under the comet in a staged frame.
        let mut x = centre + self.rng.centred() * room;
        if at_depth - self.state.depth < 170.0 && x.abs() < size + Rules::PLAYER_RADIUS + 26.0 {
            let clear = size + Rules::PLAYER_RADIUS + 26.0 + self.rng.range(0.0, 40.0);
            x = if x >= 0.0 { clear } else { -clear };
            x = x.max(centre - room).min(centre + room);
        }
        let shard = self.rng.chance(get(&self.gains, "shard_chance"));
        let spin = self.rng.range(-0.5, 0.5) * (0.6 + t);
        let rot = self.rng.range(0.0, 6.28);
        let wobble = self.rng.range(0.0, 6.28);
        let phase = self.rng.range(0.0, 6.28);
        self.items.push(Item {
            kind: if shard { Kind::Shard } else { Kind::Stone },
            x,
            at: at_depth,
            r: size * 0.92,
            draw_r: size,
            rot,
            spin,
            wobble,
            phase,
            active: true,
        });
    }

    /// Put the world's litter out ahead of the comet. Each kind keeps its own clock, in seconds of
    /// descent: when the clock comes due, the item is placed at the depth it would be met at, and
    /// the clock moves on. The look-ahead horizon in metres is only there so nothing pops in late.
    fn spawn_ahead(&mut self, dt: f32) {
        if dt <= 0.0 {
            return;
        }
        let t = progress(self.state.depth);
        let horizon = self.state.depth + Rules::SPAWN_AHEAD_M;

        self.mote_clock -= dt;
        while self.mote_clock <= 0.0 {
            let due_depth = self.state.depth + (-self.mote_clock).max(0.0) * self.state.speed;
            if due_depth > horizon {
                break;
            }
            self.spawn_mote_cluster(due_depth);
            let gap = lerp(
                get(&self.gains, "mote_gap_start"),
                get(&self.gains, "mote_gap_end"),
                t,
            );
            self.mote_clock += gap * self.rng.range(0.82, 1.18);
        }

        self.rock_clock -= dt;
        while self.rock_clock <= 0.0 {
            let due_depth = self.state.depth + (-self.rock_clock).max(0.0) * self.state.speed;
            if due_depth > horizon {
                break;
            }
            self.spawn_rock(due_depth);
            // Deeper in, a second rock sometimes falls close behind the first.
            if t > 0.5 && self.rng.chance(0.16 + 0.26 * t) {
                let behind = due_depth + self.rng.range(26.0, 46.0);
                self.spawn_rock(behind);
            }
            let gap = lerp(
                get(&self.gains, "rock_gap_start"),
                get(&self.gains, "rock_gap_end"),
                t,
            );
            self.rock_clock += gap * self.rng.range(0.85, 1.15);
        }
    }

    /// Advance the world one fixed step. `steer` is -1..1 on each axis; `idle` runs the corridor
    /// and the comet without spawning or draining, for a title screen with the world in motion.
    /// Returns the events of the step.
    pub fn step(&mut self, dt: f32, steer: Steer, idle: bool) -> u32 {
        let mut events = 0u32;

        if !idle {
            self.state.speed = descend_speed_at(&self.gains, self.state.depth);
            self.state.depth += self.state.speed * dt;
            self.state.time += dt;
        }

        // The comet: steer toward what was asked, bleed off drift when nothing is asked.
        // A steering value that is not a number is read as no steering: a NaN here would pass
        // every clearance test and quietly collect the whole world.
        let steer_x = if steer.x.is_finite() { steer.x } else { 0.0 };
        let steer_y = if steer.y.is_finite() { steer.y } else { 0.0 };
        let speed = get(&self.gains, "player_speed");
        let want_x = steer_x * speed;
        let want_y = steer_y * speed * 0.72;
        let rate_x = if want_x.abs() > self.comet.vx.abs() {
            Rules::PLAYER_ACCEL
        } else {
            Rules::PLAYER_DRAG
        };
        let rate_y = if want_y.abs() > self.comet.vy.abs() {
            Rules::PLAYER_ACCEL
        } else {
            Rules::PLAYER_DRAG
        };
        self.comet.vx += (want_x - self.comet.vx).clamp(-rate_x * dt, rate_x * dt);
        self.comet.vy += (want_y - self.comet.vy).clamp(-rate_y * dt, rate_y * dt);
        self.comet.x += self.comet.vx * dt;
        self.comet.y += self.comet.vy * dt;
        self.comet.tilt += (self.comet.vx / speed * 0.42 - self.comet.tilt) * (dt * 9.0).min(1.0);

        // Home line: a gentle spring back, so a mouse left alone does not strand the comet low.
        if steer_y == 0.0 {
            self.comet.y += (home_y() - self.comet.y) * (dt * 1.5).min(1.0);
        }
        self.comet.y = self
            .comet
            .y
            .max(home_y() - STEER_Y)
            .min(home_y() + STEER_Y);

        // The corridor's pressure: past its wall the comet is shoved home and the glow bleeds.
        let centre = corridor_centre(self.state.depth);
        let half = corridor_half_width(&self.gains, self.state.depth);
        let offset = self.comet.x - centre;
        let room = half - self.comet.radius;
        if offset.abs() > room {
            let side = if offset >= 0.0 { 1.0 } else { -1.0 };
            self.comet.x = centre + side * room;
            self.comet.vx *= -0.18;
            if !idle {
                self.state.glow -= get(&self.gains, "wall_drain") * dt;
                events |= EVENT_WALL;
                if self.state.hits_wall == 0 {
                    self.state.hits_wall = 1;
                }
                // A wall scrape breaks the chain, but not to nothing: it halves it.
                self.state.chain /= 2;
            }
        }

        self.spawn_ahead(if idle { 0.0 } else { dt });

        // Every item climbs the screen as the comet falls. Walk backwards so a removal is cheap.
        let mut index = self.items.len();
        while index > 0 {
            index -= 1;
            let y = screen_y(self.items[index].at, self.state.depth);
            if y < -70.0 {
                if !self.items[index].kind.is_light() {
                    self.state.rocks_passed += 1;
                }
                self.items.swap_remove(index);
                continue;
            }
            if idle {
                continue;
            }
            let dy = y - self.comet.y;
            if dy > 46.0 || dy < -46.0 {
                continue;
            }
            let dx = self.items[index].x - self.comet.x;
            let near = self.items[index].r + self.comet.radius;
            if dx * dx + dy * dy > near * near {
                continue;
            }

            let kind = self.items[index].kind;
            let item_x = self.items[index].x;
            if kind.is_light() {
                let value = if kind == Kind::Star {
                    self.state.stars_taken += 1;
                    self.state.chain += Rules::STAR_CHAIN;
                    Rules::SCORE_STAR
                } else {
                    self.state.motes_taken += 1;
                    self.state.chain += 1;
                    Rules::SCORE_MOTE
                };
                let refill = if kind == Kind::Star {
                    get(&self.gains, "glow_star")
                } else {
                    get(&self.gains, "glow_mote")
                };
                let max_glow = get(&self.gains, "glow_start").max(100.0);
                self.state.glow = (self.state.glow + refill).min(max_glow);
                self.state.score += value * self.multiplier();
                events |= if kind == Kind::Star { EVENT_STAR } else { EVENT_MOTE };
            } else {
                // Rock: the glow is torn away, the chain breaks, and the comet is knocked aside.
                self.state.glow -= get(&self.gains, "rock_drain");
                self.state.chain = 0;
                self.state.rock_hits += 1;
                self.comet.vx += if self.comet.x >= item_x {
                    Rules::ROCK_KICK_X
                } else {
                    -Rules::ROCK_KICK_X
                };
                self.comet.vy -= Rules::ROCK_KICK_Y;
                events |= EVENT_HIT;
            }
            self.items.swap_remove(index);
        }

        if !idle {
            // The glow drains faster as the descent speeds up, and the depth itself pays score.
            self.state.glow -= glow_drain_at(&self.gains, self.state.depth) * dt;
            self.state.score += self.state.speed * dt * Rules::SCORE_PER_METRE * self.multiplier();

            // A new stratum: named on screen, and a little light back in the tank.
            if self.stratum_edge.is_finite() && self.state.depth >= self.stratum_edge {
                self.state.stratum = stratum_index_at(self.state.depth);
                self.state.stratum_banner = 2.4;
                let max_glow = get(&self.gains, "glow_start").max(100.0);
                self.state.glow =
                    (self.state.glow + get(&self.gains, "glow_stratum_refill")).min(max_glow);
                self.state.score += Rules::SCORE_STRATUM;
                events |= EVENT_STRATUM;
                self.stratum_edge = next_stratum_at(self.state.depth);
            }
            if self.state.stratum_banner > 0.0 {
                self.state.stratum_banner = (self.state.stratum_banner - dt).max(0.0);
            }

            if self.state.depth >= GOAL_DEPTH_M {
                self.state.glow = self.state.glow.max(0.0);
                events |= EVENT_WIN;
            } else if self.state.glow <= 0.0 {
                self.state.glow = 0.0;
                self.comet.alive = false;
                events |= EVENT_OVER;
            }
        }

        self.step_count += 1;
        events
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> World {
        World::new(7, SHIPPED)
    }

    #[test]
    fn a_fresh_world_starts_at_the_top_of_the_corridor() {
        let w = fresh();
        assert_eq!(w.state.depth, 0.0);
        assert_eq!(w.state.glow, 100.0);
        assert!(w.comet.alive);
        assert_eq!(w.outcome(), 0);
    }

    #[test]
    fn the_same_seed_and_steering_play_the_same_run_twice() {
        // The contract the page relies on: a seed replays a descent exactly.
        let play = |seed: u32| {
            let mut w = World::new(seed, SHIPPED);
            for tick in 0..900 {
                let steer = Steer {
                    x: ((tick as f32) / 40.0).sin(),
                    y: 0.0,
                };
                w.step(STEP, steer, false);
            }
            (w.state.score, w.state.depth, w.state.glow, w.items.len())
        };
        let a = play(31);
        let b = play(31);
        assert_eq!(a, b, "the same seed played differently: {a:?} vs {b:?}");

        // Depth alone cannot tell two seeds apart: it is a function of the clock, not the RNG.
        // The layout is what the seed owns, so compare the first items each seed lays down.
        let layout = |seed: u32| {
            let mut w = World::new(seed, SHIPPED);
            for _ in 0..120 {
                w.step(STEP, Steer { x: 0.0, y: 0.0 }, false);
            }
            w.items
                .iter()
                .map(|i| (i.kind.code(), i.x, i.at))
                .collect::<Vec<_>>()
        };
        let one = layout(31);
        let two = layout(32);
        assert!(!one.is_empty(), "no items to compare");
        assert_ne!(one, two, "two seeds laid out the same world: the seed is not reaching the RNG");
    }

    #[test]
    fn a_nan_steer_is_read_as_no_steer() {
        // The bug the script once had: a NaN steering value passed every clearance test and let
        // the comet collect the whole world.
        let mut w = fresh();
        for _ in 0..60 {
            w.step(STEP, Steer { x: f32::NAN, y: f32::NAN }, false);
        }
        assert!(w.comet.x.is_finite(), "a NaN steer reached the comet");
        assert!(w.comet.y.is_finite(), "a NaN steer reached the comet");
    }

    #[test]
    fn the_glow_never_goes_below_zero_nor_above_its_maximum() {
        let mut w = fresh();
        for tick in 0..4000 {
            let steer = Steer {
                x: ((tick as f32) / 17.0).sin(),
                y: 0.0,
            };
            w.step(STEP, steer, false);
            assert!(w.state.glow >= 0.0, "glow under zero at tick {tick}");
            assert!(w.state.glow <= 100.0, "glow over its maximum at tick {tick}");
        }
    }

    #[test]
    fn the_comet_stays_inside_the_corridor() {
        let mut w = fresh();
        for tick in 0..2400 {
            // Steer hard into one wall, then the other.
            let x = if (tick / 120) % 2 == 0 { 1.0 } else { -1.0 };
            w.step(STEP, Steer { x, y: 0.0 }, false);
            let (centre, half) = w.corridor();
            let room = half - w.comet.radius;
            assert!(
                (w.comet.x - centre).abs() <= room + 1e-2,
                "the comet left the corridor at tick {tick}"
            );
        }
    }

    #[test]
    fn every_item_carries_a_radius_its_collision_can_use() {
        let mut w = fresh();
        for _ in 0..300 {
            w.step(STEP, Steer { x: 0.0, y: 0.0 }, false);
        }
        assert!(!w.items.is_empty(), "nothing spawned in five seconds");
        for item in &w.items {
            assert!(item.r > 0.0 && item.r.is_finite(), "item with radius {}", item.r);
            assert!(item.draw_r >= item.r, "an item draws smaller than it collides");
            assert!(item.x.is_finite() && item.at.is_finite(), "item with a bad position");
        }
    }

    #[test]
    fn the_multiplier_climbs_with_the_chain_and_stops_at_five() {
        let mut w = fresh();
        w.state.chain = 0;
        assert_eq!(w.multiplier(), 1.0);
        w.state.chain = 8;
        assert_eq!(w.multiplier(), 2.0);
        w.state.chain = 1_000;
        assert_eq!(w.multiplier(), Rules::CHAIN_MAX_MULT);
    }
}
