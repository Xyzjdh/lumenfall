// What a run is made of: the things in the water, the powers the comet can be holding, and the
// upgrades that carry from one run to the next. Kept apart from `world.rs` so that the rules file
// stays about the rules and this stays about the catalogue: every entry here is a number, a name
// and a sentence, and nothing here knows how to run.

/// What an item in the water is.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Mote,
    Star,
    Stone,
    Shard,
    /// A mote that has been struck by lightning: worth more, and it moves.
    Charged,
    /// A mote inside a storm's eye: it drifts sideways, so it has to be chased.
    Swirling,
    /// Restores a share of the glow at once.
    Flask,
    /// A short shield: the next rock costs nothing.
    Shield,
    /// Slows the descent for a few seconds.
    Slow,
    /// A brief magnet: light comes to the comet.
    Lure,
    /// A multiplier gem: the chain jumps.
    Prism,
    /// A heart: one more shield charge, on top of the usual.
    Heart,
    /// Volcano: a cinder thrown up out of the vent.
    Cinder,
    /// Ice: a frozen mote, tougher but worth more.
    Frost,
    /// A rock that the glacier has locked into a slow orbit.
    Iceberg,
}

impl Kind {
    pub fn is_light(self) -> bool {
        matches!(
            self,
            Kind::Mote
                | Kind::Star
                | Kind::Charged
                | Kind::Swirling
                | Kind::Frost
                | Kind::Prism
        )
    }

    /// True for the things that hurt when met.
    pub fn is_rock(self) -> bool {
        matches!(self, Kind::Stone | Kind::Shard | Kind::Cinder | Kind::Iceberg)
    }

    /// True for the things that are taken rather than dodged, but are not simply light.
    pub fn is_pickup(self) -> bool {
        matches!(
            self,
            Kind::Flask | Kind::Shield | Kind::Slow | Kind::Lure | Kind::Prism | Kind::Heart
        )
    }

    /// How much score the thing is worth before the multiplier.
    pub fn value(self) -> f32 {
        match self {
            Kind::Mote => 12.0,
            Kind::Star => 40.0,
            Kind::Charged => 26.0,
            Kind::Swirling => 18.0,
            Kind::Frost => 22.0,
            Kind::Prism => 55.0,
            Kind::Flask => 0.0,
            Kind::Shield => 0.0,
            Kind::Slow => 0.0,
            Kind::Lure => 0.0,
            Kind::Heart => 0.0,
            _ => 0.0,
        }
    }

    /// How much glow it gives back.
    pub fn refill(self) -> f32 {
        match self {
            Kind::Mote => 8.0,
            Kind::Star => 22.0,
            Kind::Charged => 14.0,
            Kind::Swirling => 10.0,
            Kind::Frost => 13.0,
            Kind::Prism => 16.0,
            Kind::Flask => 26.0,
            _ => 0.0,
        }
    }

    /// How much chain it adds.
    pub fn chain(self) -> i32 {
        match self {
            Kind::Mote | Kind::Swirling | Kind::Frost => 1,
            Kind::Charged => 2,
            Kind::Star => 3,
            Kind::Prism => 6,
            _ => 0,
        }
    }

    /// The number the interface uses for a kind, so the page can colour by it. These are the
    /// contract with `game/src/world.js`; they must not move.
    pub fn code(self) -> u32 {
        match self {
            Kind::Mote => 0,
            Kind::Star => 1,
            Kind::Stone => 2,
            Kind::Shard => 3,
            Kind::Charged => 4,
            Kind::Swirling => 5,
            Kind::Flask => 6,
            Kind::Shield => 7,
            Kind::Slow => 8,
            Kind::Lure => 9,
            Kind::Prism => 10,
            Kind::Heart => 11,
            Kind::Cinder => 12,
            Kind::Frost => 13,
            Kind::Iceberg => 14,
        }
    }

    /// The word the page says when one is taken, for the announcement line.
    pub fn name(self) -> &'static str {
        match self {
            Kind::Mote => "mote",
            Kind::Star => "star",
            Kind::Stone => "stone",
            Kind::Shard => "shard",
            Kind::Charged => "charged mote",
            Kind::Swirling => "swirling mote",
            Kind::Flask => "glow flask",
            Kind::Shield => "shield",
            Kind::Slow => "slow fall",
            Kind::Lure => "lure",
            Kind::Prism => "prism",
            Kind::Heart => "heart",
            Kind::Cinder => "cinder",
            Kind::Frost => "frost mote",
            Kind::Iceberg => "iceberg",
        }
    }
}

/// A power the comet is holding, and how long is left of it.
#[derive(Clone, Copy, Debug, Default)]
pub struct Powers {
    /// Seconds of slowed descent left.
    pub slow: f32,
    /// Seconds of magnet left.
    pub lure: f32,
    /// Shield charges: each one eats a rock for nothing.
    pub shields: u32,
    /// Seconds of doubled score left.
    pub double: f32,
    /// Seconds the comet is invulnerable left (a run start, or after a hit with a charm).
    pub mercy: f32,
}

impl Powers {
    pub fn any(&self) -> bool {
        self.slow > 0.0 || self.lure > 0.0 || self.shields > 0 || self.double > 0.0
    }
}

/// One upgrade the player can buy between runs. The list is the catalogue; the shop is the UI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Upgrade {
    Tank,
    Thrift,
    Harvest,
    Charm,
    Head,
    Reach,
    Greed,
}

impl Upgrade {
    pub const ALL: [Upgrade; 7] = [
        Upgrade::Tank,
        Upgrade::Thrift,
        Upgrade::Harvest,
        Upgrade::Charm,
        Upgrade::Head,
        Upgrade::Reach,
        Upgrade::Greed,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Upgrade::Tank => "Lantern",
            Upgrade::Thrift => "Thrift",
            Upgrade::Harvest => "Harvest",
            Upgrade::Charm => "Charm",
            Upgrade::Head => "Head Start",
            Upgrade::Reach => "Reach",
            Upgrade::Greed => "Greed",
        }
    }

    pub fn blurb(self) -> &'static str {
        match self {
            Upgrade::Tank => "The glow tank holds a little more.",
            Upgrade::Thrift => "The glow drains a little slower.",
            Upgrade::Harvest => "Every mote gives a little more.",
            Upgrade::Charm => "Begin each run with a shield charge.",
            Upgrade::Head => "Begin each run further down.",
            Upgrade::Reach => "Motes are gathered from a little further away.",
            Upgrade::Greed => "Score rises faster with the chain.",
        }
    }

    /// What it costs at level 0, 1, 2, ...
    pub fn cost(self, level: u32) -> u32 {
        let base = match self {
            Upgrade::Tank => 60,
            Upgrade::Thrift => 80,
            Upgrade::Harvest => 70,
            Upgrade::Charm => 120,
            Upgrade::Head => 100,
            Upgrade::Reach => 90,
            Upgrade::Greed => 110,
        };
        base + level * (base / 2).max(30)
    }

    pub fn max_level(self) -> u32 {
        match self {
            Upgrade::Tank => 5,
            Upgrade::Thrift => 5,
            Upgrade::Harvest => 5,
            Upgrade::Charm => 3,
            Upgrade::Head => 4,
            Upgrade::Reach => 3,
            Upgrade::Greed => 4,
        }
    }

    pub fn index(self) -> u32 {
        match self {
            Upgrade::Tank => 0,
            Upgrade::Thrift => 1,
            Upgrade::Harvest => 2,
            Upgrade::Charm => 3,
            Upgrade::Head => 4,
            Upgrade::Reach => 5,
            Upgrade::Greed => 6,
        }
    }

    pub fn from_index(index: u32) -> Option<Upgrade> {
        Upgrade::ALL.iter().copied().find(|u| u.index() == index)
    }
}

/// What the player has bought, carried between runs. Seven small numbers and a balance.
#[derive(Clone, Copy, Debug, Default)]
pub struct Upgrades {
    pub levels: [u32; 7],
    /// Light carried over: score spent is score banked, spent on upgrades.
    pub banked: u32,
}

impl Upgrades {
    pub fn level(&self, which: Upgrade) -> u32 {
        self.levels[which.index() as usize]
    }

    /// The extra glow the tank holds.
    pub fn tank_bonus(&self) -> f32 {
        self.level(Upgrade::Tank) as f32 * 6.0
    }

    /// A multiplier on the glow's drain, below 1 for a thriftier comet.
    pub fn thrift(&self) -> f32 {
        1.0 - self.level(Upgrade::Thrift) as f32 * 0.07
    }

    /// A multiplier on what a mote gives back.
    pub fn harvest(&self) -> f32 {
        1.0 + self.level(Upgrade::Harvest) as f32 * 0.08
    }

    /// Shields at the start of a run.
    pub fn charm(&self) -> u32 {
        self.level(Upgrade::Charm).min(3)
    }

    /// Metres already fallen when a run begins.
    pub fn head_start(&self) -> f32 {
        self.level(Upgrade::Head) as f32 * 150.0
    }

    /// Extra pixels the comet can gather from.
    pub fn reach(&self) -> f32 {
        self.level(Upgrade::Reach) as f32 * 9.0
    }

    /// A multiplier on score, folded in with the chain.
    pub fn greed(&self) -> f32 {
        1.0 + self.level(Upgrade::Greed) as f32 * 0.1
    }
}
