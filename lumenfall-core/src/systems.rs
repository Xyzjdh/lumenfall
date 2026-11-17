// The parts of a run that are not the comet or the corridor: where the world is standing (the
// biome), what the sky is doing (the weather), what the stratum's guardian is up to (the boss),
// how the player is playing (the combo) and what the day looks like (the daily seed).
//
// Each of these is a small piece of state with a tick and a few questions to ask of it. They live
// here so the rules file can read one line per system instead of carrying five counters inline.

use crate::rng::Rng;

// ---------------------------------------------------------------------------------------------
// Biomes: the same depth, played differently
// ---------------------------------------------------------------------------------------------

/// The biomes. The stratum says where you are; the biome says how it plays. A run picks one at
/// the start, so the same depth is a different game twice.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Biome {
    pub id: u32,
}

impl Biome {
    pub const COUNT: u32 = 6;

    pub fn from_index(id: u32) -> Biome {
        Biome { id: id % Biome::COUNT }
    }

    pub fn name(self) -> &'static str {
        match self.id {
            0 => "QUIET",
            1 => "STORM",
            2 => "BLOOM",
            3 => "GLACIER",
            4 => "VOLCANO",
            _ => "ECLIPSE",
        }
    }

    pub fn blurb(self) -> &'static str {
        match self.id {
            0 => "A clear fall. Nothing but the fall.",
            1 => "Lightning rides the wind and charges what it touches.",
            2 => "Light thickens. There is more of it, and more swimming in it.",
            3 => "The world freezes. Rock grows slow orbits and the motes frost over.",
            4 => "The vent throws cinders up ahead of you.",
            _ => "The star is gone. The corridor closes in, and the glow runs hard.",
        }
    }

    /// How much mote there is: a multiplier on the mote clock.
    pub fn mote_rate(self) -> f32 {
        match self.id {
            2 => 1.28, // bloom: more light
            4 => 0.94,
            5 => 0.86, // eclipse: less light
            _ => 1.0,
        }
    }

    /// How much rock: a multiplier on the rock clock.
    pub fn rock_rate(self) -> f32 {
        match self.id {
            1 => 1.22, // storm throws more
            3 => 1.14,
            4 => 1.08,
            5 => 1.26, // eclipse closes in
            _ => 1.0,
        }
    }

    /// How much faster the glow drains.
    pub fn glow_rate(self) -> f32 {
        match self.id {
            2 => 0.92,
            5 => 1.26,
            _ => 1.0,
        }
    }

    /// The corridor's base half-width for this biome, on top of the tuned one.
    pub fn corridor_scale(self) -> f32 {
        match self.id {
            3 => 1.06,
            5 => 0.87,
            _ => 1.0,
        }
    }

    /// How often lightning strikes, in seconds (0 for never).
    pub fn storm_period(self) -> f32 {
        if self.id == 1 {
            5.5
        } else {
            0.0
        }
    }

    /// How often the vent throws a cinder, in seconds (0 for never).
    pub fn vent_period(self) -> f32 {
        if self.id == 4 {
            2.6
        } else {
            0.0
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Weather: what the sky is doing right now
// ---------------------------------------------------------------------------------------------

/// The weather, as a state with a clock. One of these is always true; they change slowly.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Weather {
    #[default]
    Clear,
    /// A headwind: the descent slows, and the light is easier to catch.
    Headwind,
    /// A tailwind: faster descent, more score, less time to think.
    Tailwind,
    /// Fog in the corridor: the far half of the screen dims.
    Fog,
    /// Crosswind: the comet is pushed sideways, gently and constantly.
    Crosswind,
}

impl Weather {
    pub fn name(self) -> &'static str {
        match self {
            Weather::Clear => "CLEAR",
            Weather::Headwind => "HEADWIND",
            Weather::Tailwind => "TAILWIND",
            Weather::Fog => "FOG",
            Weather::Crosswind => "CROSSWIND",
        }
    }

    pub fn blurb(self) -> &'static str {
        match self {
            Weather::Clear => "The sky is still.",
            Weather::Headwind => "The fall is slower for a while.",
            Weather::Tailwind => "The fall is faster, and it pays.",
            Weather::Fog => "You cannot see as far.",
            Weather::Crosswind => "The wind leans on you.",
        }
    }

    pub fn code(self) -> u32 {
        match self {
            Weather::Clear => 0,
            Weather::Headwind => 1,
            Weather::Tailwind => 2,
            Weather::Fog => 3,
            Weather::Crosswind => 4,
        }
    }

    /// A multiplier on the descent speed.
    pub fn speed_scale(self) -> f32 {
        match self {
            Weather::Headwind => 0.86,
            Weather::Tailwind => 1.16,
            _ => 1.0,
        }
    }

    /// A multiplier on score for the metres fallen.
    pub fn score_scale(self) -> f32 {
        match self {
            Weather::Tailwind => 1.35,
            _ => 1.0,
        }
    }

    /// The sideways push on the comet, in pixels a second squared.
    pub fn cross_push(self) -> f32 {
        match self {
            Weather::Crosswind => 420.0,
            _ => 0.0,
        }
    }

    /// How much of the screen the fog eats, 0 for none.
    pub fn fog(self) -> f32 {
        match self {
            Weather::Fog => 0.62,
            _ => 0.0,
        }
    }
}

/// The weather's clock. It changes every so often, and never to the same thing twice running.
#[derive(Clone, Copy, Debug)]
pub struct Sky {
    pub now: Weather,
    /// Seconds left of the current weather.
    pub left: f32,
    /// Which way the crosswind blows, -1 or 1.
    pub lean: f32,
    /// How many changes have happened, for the HUD's little ticker.
    pub changes: u32,
}

impl Sky {
    pub fn new(rng: &mut Rng) -> Sky {
        Sky {
            now: Weather::Clear,
            left: 18.0 + rng.range(0.0, 8.0),
            lean: if rng.chance(0.5) { 1.0 } else { -1.0 },
            changes: 0,
        }
    }

    /// Advances the weather. Returns true when it changed this tick.
    pub fn tick(&mut self, dt: f32, rng: &mut Rng, depth: f32) -> bool {
        self.left -= dt;
        if self.left > 0.0 {
            return false;
        }
        // Deeper in, the sky turns more often: the world gets less patient as you fall.
        let scale = 1.0 - (depth / 4000.0).clamp(0.0, 1.0) * 0.4;
        self.left = (16.0 + rng.range(0.0, 16.0)) * scale;
        let roll = rng.next_f32();
        let next = match roll {
            x if x < 0.30 => Weather::Clear,
            x if x < 0.50 => Weather::Headwind,
            x if x < 0.68 => Weather::Tailwind,
            x if x < 0.84 => Weather::Fog,
            _ => Weather::Crosswind,
        };
        // Never the same twice in a row: a change that changes nothing reads as a bug. Rolling
        // the same weather again means the sky does something else instead of nothing.
        self.now = if next == self.now {
            let nudge = match next {
                Weather::Clear => Weather::Tailwind,
                Weather::Tailwind => Weather::Clear,
                Weather::Headwind => Weather::Fog,
                Weather::Fog => Weather::Headwind,
                Weather::Crosswind => Weather::Clear,
            };
            nudge
        } else {
            next
        };
        if rng.chance(0.5) {
            self.lean = -self.lean;
        }
        self.changes += 1;
        true
    }
}

// ---------------------------------------------------------------------------------------------
// The combo: how well the player is playing, right now
// ---------------------------------------------------------------------------------------------

/// A judgement on a run in progress. The chain says how many light things in a row; the combo
/// says how clean it has been, and pays for it.
#[derive(Clone, Copy, Debug, Default)]
pub struct Combo {
    /// Motes and everything light, in an unbroken run.
    pub chain: i32,
    /// The best chain this run reached.
    pub best_chain: i32,
    /// A rating word for the HUD, 0..5.
    pub rating: u32,
    /// How long since the last thing was taken, in seconds. Clean play keeps this low.
    pub since_taken: f32,
    /// Seconds of perfect play: no rock, no wall. The clean streak.
    pub clean: f32,
    /// The best clean streak this run.
    pub best_clean: f32,
}

impl Combo {
    /// Called when anything worth chain is taken.
    pub fn took(&mut self, chain: i32) {
        self.chain += chain;
        self.best_chain = self.best_chain.max(self.chain);
        self.since_taken = 0.0;
        self.refresh_rating();
    }

    /// Called when the chain breaks (a rock, a wall, or nothing taken for too long).
    pub fn broke(&mut self) {
        self.chain = 0;
        self.clean = 0.0;
        self.refresh_rating();
    }

    pub fn tick(&mut self, dt: f32, playing: bool) {
        if !playing {
            return;
        }
        self.since_taken += dt;
        self.clean += dt;
        self.best_clean = self.best_clean.max(self.clean);
        // Nothing taken for a while: the chain is a memory, and the memory fades.
        if self.since_taken > 3.2 && self.chain > 0 {
            self.chain = (self.chain / 2).max(0);
            self.since_taken = 2.0;
            self.refresh_rating();
        }
    }

    fn refresh_rating(&mut self) {
        self.rating = match self.chain {
            c if c >= 40 => 5,
            c if c >= 24 => 4,
            c if c >= 12 => 3,
            c if c >= 5 => 2,
            c if c >= 1 => 1,
            _ => 0,
        };
    }

    /// The word for the rating, for the HUD.
    pub fn rating_word(&self) -> &'static str {
        match self.rating {
            5 => "UNREAL",
            4 => "PERFECT",
            3 => "SHARP",
            2 => "GOOD",
            1 => "STEADY",
            _ => "—",
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The guardian: a boss at the mouth of the core
// ---------------------------------------------------------------------------------------------

/// The thing that stands between the comet and the core. It is not a monster with a health bar
/// in the middle of the screen: it is the corridor itself, for the last stretch, and it has to be
/// outlasted rather than shot.
#[derive(Clone, Copy, Debug, Default)]
pub struct Guardian {
    /// 0 before it wakes, 1 while the fight is on, 2 when it is beaten.
    pub phase: u32,
    /// How much of the fight is left, 1 down to 0.
    pub health: f32,
    /// The arena's half-width, which closes as the fight goes on.
    pub arena: f32,
    /// Seconds left of the current attack.
    pub attack_left: f32,
    /// Which attack it is on, 0..3.
    pub attack: u32,
    /// How many of its attacks the player has survived.
    pub survived: u32,
    /// A pulse for the renderer, 0..1, rising when it stirs.
    pub stir: f32,
}

impl Guardian {
    pub fn new() -> Guardian {
        Guardian {
            phase: 0,
            health: 1.0,
            arena: 1.0,
            attack_left: 0.0,
            attack: 0,
            survived: 0,
            stir: 0.0,
        }
    }

    /// The depths it wakes and is beaten at.
    pub const WAKES_AT: f32 = 3400.0;
    pub const BEATEN_AT: f32 = 4000.0;

    /// Advances the fight. Returns the events it raised (a step bit field).
    pub fn tick(&mut self, dt: f32, depth: f32, rng: &mut Rng) -> u32 {
        use crate::world::{EVENT_GUARDIAN, EVENT_GUARDIAN_END, EVENT_GUARDIAN_START};
        let mut events = 0;
        if depth >= Self::WAKES_AT && depth < Self::BEATEN_AT {
            if self.phase == 0 {
                self.phase = 1;
                self.health = 1.0;
                self.attack_left = 2.4;
                self.attack = 0;
                events |= EVENT_GUARDIAN_START;
            }
            self.stir = (self.stir + dt * 1.6).min(1.0);
            // Health is the depth still to cross: the guardian is the gap.
            self.health = ((Self::BEATEN_AT - depth) / (Self::BEATEN_AT - Self::WAKES_AT)).clamp(0.0, 1.0);
            // The arena closes as the fight goes on.
            self.arena = 1.0 - (1.0 - self.health) * 0.34;

            self.attack_left -= dt;
            if self.attack_left <= 0.0 {
                self.survived += 1;
                self.attack = (self.attack + 1) % 3;
                // The attacks come faster as it weakens.
                self.attack_left = 1.8 + self.health * 1.8 + rng.range(0.0, 0.6);
                events |= EVENT_GUARDIAN;
            }
        } else if self.phase == 1 {
            self.phase = 2;
            self.stir = 0.0;
            self.health = 0.0;
            events |= EVENT_GUARDIAN_END;
        }
        events
    }

    pub fn active(&self) -> bool {
        self.phase == 1
    }

    /// What the current attack is called, for the banner.
    pub fn attack_name(&self) -> &'static str {
        match self.attack {
            0 => "THE CORRIDOR TIGHTENS",
            1 => "THE WALLS PRESS IN",
            _ => "THE CORE ROARS",
        }
    }

    /// How many extra rocks the current attack throws.
    pub fn rock_pressure(&self) -> f32 {
        if !self.active() {
            return 1.0;
        }
        match self.attack {
            1 => 1.8,
            2 => 2.3,
            _ => 1.3,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The daily: one seed a day, for everybody
// ---------------------------------------------------------------------------------------------

/// The daily run's seed, from a day number. Everyone who plays "today" falls into the same world,
/// which is what makes a score worth comparing. Pure arithmetic: no clock, so a build stays
/// reproducible and a test can ask about any day.
pub fn daily_seed(day: u32) -> u32 {
    let mut z = day.wrapping_mul(0x9e37_79b9) ^ 0x85eb_ca6b;
    z ^= z >> 13;
    z = z.wrapping_mul(0xc2b2_ae35);
    z ^= z >> 16;
    z
}

/// The day number a run belongs to, from the seconds since the epoch. The page passes its own
/// clock in; nothing in here reads one.
pub fn day_of(epoch_seconds: i64) -> u32 {
    (epoch_seconds.max(0) / 86_400) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kinds::{Upgrade, Upgrades};
    use crate::rng::Rng;

    #[test]
    fn the_daily_seed_is_the_same_for_everyone_on_the_same_day_and_different_across_days() {
        assert_eq!(daily_seed(20_000), daily_seed(20_000));
        assert_ne!(daily_seed(20_000), daily_seed(20_001));
        assert_ne!(daily_seed(0), daily_seed(1));
    }

    #[test]
    fn the_day_number_never_goes_backwards_with_the_clock() {
        let a = day_of(1_700_000_000);
        let b = day_of(1_700_000_000 + 86_400);
        assert_eq!(b, a + 1);
        assert_eq!(day_of(0), 0);
        assert_eq!(day_of(-500), 0);
    }

    #[test]
    fn every_biome_has_a_name_a_blurb_and_a_place() {
        for id in 0..Biome::COUNT {
            let b = Biome::from_index(id);
            assert!(!b.name().is_empty());
            assert!(!b.blurb().is_empty());
            assert!(b.mote_rate() > 0.0 && b.rock_rate() > 0.0);
            assert!(b.corridor_scale() > 0.0);
        }
        // Out of range wraps rather than panics: a corrupt id cannot stop a run.
        assert_eq!(Biome::from_index(99).id, 99 % Biome::COUNT);
    }

    #[test]
    fn the_weather_changes_and_never_repeats_itself() {
        let mut rng = Rng::new(5);
        let mut sky = Sky::new(&mut rng);
        let mut previous: Option<Weather> = None;
        let mut changes = 0;
        for _ in 0..2000 {
            let before = sky.now;
            if sky.tick(0.1, &mut rng, 1200.0) {
                assert_ne!(sky.now, before, "the weather changed to itself");
                if let Some(was) = previous {
                    // The weather before this one: never the same weather twice running.
                    assert_ne!(sky.now, was, "the same weather came back to back");
                }
                previous = Some(sky.now);
                changes += 1;
            }
        }
        assert!(changes > 3, "the weather barely changed: {changes}");
    }

    #[test]
    fn the_combo_rating_climbs_with_the_chain_and_falls_when_it_breaks() {
        let mut combo = Combo::default();
        assert_eq!(combo.rating, 0);
        for _ in 0..10 {
            combo.took(1);
        }
        assert_eq!(combo.rating, 2);
        for _ in 0..30 {
            combo.took(1);
        }
        assert_eq!(combo.rating, 5);
        combo.broke();
        assert_eq!(combo.rating, 0);
        assert_eq!(combo.chain, 0);
    }

    #[test]
    fn a_chain_fades_when_nothing_is_taken() {
        let mut combo = Combo::default();
        for _ in 0..20 {
            combo.took(1);
        }
        let was = combo.chain;
        // A long idle: no light taken at all.
        for _ in 0..400 {
            combo.tick(0.1, true);
        }
        assert!(combo.chain < was, "the chain never faded");
    }

    #[test]
    fn the_guardian_wakes_survives_and_is_beaten() {
        let mut rng = Rng::new(11);
        let mut g = Guardian::new();
        assert!(!g.active());
        let start = g.tick(1.0 / 60.0, 3390.0, &mut rng);
        assert_eq!(start, 0, "it woke early");
        let woke = g.tick(1.0 / 60.0, 3401.0, &mut rng);
        assert_eq!(woke & crate::world::EVENT_GUARDIAN_START, crate::world::EVENT_GUARDIAN_START);
        assert!(g.active());
        let mut attacks = 0;
        for _ in 0..2000 {
            let e = g.tick(1.0 / 60.0, 3700.0, &mut rng);
            if e & crate::world::EVENT_GUARDIAN != 0 {
                attacks += 1;
            }
            assert!(g.arena > 0.0 && g.arena <= 1.0);
        }
        assert!(attacks > 3, "the guardian hardly attacked: {attacks}");
        let end = g.tick(1.0 / 60.0, 4001.0, &mut rng);
        assert_eq!(end & crate::world::EVENT_GUARDIAN_END, crate::world::EVENT_GUARDIAN_END);
        assert!(!g.active());
    }

    #[test]
    fn the_upgrade_costs_and_caps_make_sense() {
        for u in Upgrade::ALL {
            assert!(u.cost(0) > 0);
            // Every level costs more than the one before it.
            for level in 1..u.max_level() {
                assert!(u.cost(level) > u.cost(level - 1), "{} level {level} got cheaper", u.name());
            }
            assert_eq!(Upgrade::from_index(u.index()), Some(u));
        }
        assert_eq!(Upgrade::from_index(99), None);
    }

    #[test]
    fn the_upgrades_do_what_they_say() {
        let mut up = Upgrades::default();
        assert_eq!(up.tank_bonus(), 0.0);
        assert!((up.thrift() - 1.0).abs() < 1e-6);
        up.levels[Upgrade::Tank.index() as usize] = 5;
        assert!((up.tank_bonus() - 30.0).abs() < 1e-6);
        up.levels[Upgrade::Thrift.index() as usize] = 5;
        assert!(up.thrift() < 0.7, "five levels of thrift barely helped");
        up.levels[Upgrade::Charm.index() as usize] = 2;
        assert_eq!(up.charm(), 2);
        up.levels[Upgrade::Charm.index() as usize] = 9;
        assert_eq!(up.charm(), 3, "charm ran past its cap");
    }
}
