// The seeded generator. This is a faithful port of game/src/random.js, down to the 32-bit
// wrapping arithmetic, so the same seed lays out exactly the same descent in Rust as it does in
// the script the browser used to run. A run must be reproducible from a seed alone: that is what
// lets a screenshot be staged, and what lets the tuning harness compare two builds honestly.

/// A xoroshiro-style mixer over a 32-bit state: good enough for scatter and jitter, and cheap.
pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Rng {
            state: if seed == 0 { 0x9e37_79b9 } else { seed },
        }
    }

    /// The next float in [0, 1).
    pub fn next_f32(&mut self) -> f32 {
        self.state = self.state.wrapping_add(0x9e37_79b9);
        let mut z = self.state;
        z = (z ^ (z >> 15)).wrapping_mul(z | 1);
        z ^= z.wrapping_add((z ^ (z >> 7)).wrapping_mul(z | 61));
        (z ^ (z >> 14)) as f32 / 4_294_967_296.0
    }

    /// A float in [min, max).
    pub fn range(&mut self, min: f32, max: f32) -> f32 {
        min + self.next_f32() * (max - min)
    }

    /// An integer in [min, max], both ends included.
    pub fn int(&mut self, min: i32, max: i32) -> i32 {
        min + (self.next_f32() * ((max - min + 1) as f32)).floor() as i32
    }

    /// True with probability p.
    pub fn chance(&mut self, p: f32) -> bool {
        self.next_f32() < p
    }

    /// A float around 0, denser near the middle: the mean of three draws, stretched.
    pub fn centred(&mut self) -> f32 {
        (self.next_f32() + self.next_f32() + self.next_f32()) / 1.5 - 1.0
    }
}

impl Default for Rng {
    fn default() -> Self {
        Rng::new(0x9e37_79b9)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sequence_is_the_one_the_script_produced() {
        // The script's generator, run with seed 7, opens 0.0978152179159224, 0.8962424935307354,
        // 0.4732160589192063. Rust must land on the same three floats.
        let mut rng = Rng::new(7);
        let a = rng.next_f32();
        let b = rng.next_f32();
        let c = rng.next_f32();
        assert!((a - 0.097_815_22).abs() < 1e-6, "first draw was {a}");
        assert!((b - 0.896_242_5).abs() < 1e-6, "second draw was {b}");
        assert!((c - 0.473_216_06).abs() < 1e-6, "third draw was {c}");
    }

    #[test]
    fn a_centred_draw_stays_in_range() {
        let mut rng = Rng::new(19);
        for _ in 0..10_000 {
            let v = rng.centred();
            assert!((-1.0..1.0).contains(&v), "centred draw left the range: {v}");
        }
    }

    #[test]
    fn int_never_leaves_its_bounds() {
        let mut rng = Rng::new(23);
        for _ in 0..10_000 {
            let v = rng.int(4, 6);
            assert!((4..=6).contains(&v), "int draw left its bounds: {v}");
        }
    }
}

