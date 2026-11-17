// A quick probe: play one descent with the pilot and print what the systems did.
use lumenfall_core::config::SHIPPED;
use lumenfall_core::kinds::Upgrades;
use lumenfall_core::pilot;
use lumenfall_core::systems::Biome;
use lumenfall_core::world::{Steer, World};

fn main() {
    for biome in 0..Biome::COUNT {
        let mut w = World::with_everything(17, SHIPPED, Upgrades::default(), Biome::from_index(biome));
        let mut steps = 0u64;
        let mut events = 0u32;
        let mut weathers = 0;
        let mut guardians = 0;
        while steps < 60 * 90 && w.comet.alive && w.state.depth < 4000.0 {
            let x = pilot::steer(&w, 0.0);
            let e = w.step(1.0 / 60.0, Steer { x, y: 0.0 }, false);
            events |= e;
            if e & 256 != 0 { weathers += 1; }
            if e & 512 != 0 { guardians += 1; }
            steps += 1;
        }
        println!(
            "biome {} {:9} depth {:6.0} glow {:5.1} score {:7.0} pickups {:2} grazes {:2} chain {:3} rating {} milestone {:5.0} weather {} guardian {} events {:#x}",
            biome, Biome::from_index(biome).name(), w.state.depth, w.state.glow, w.state.score,
            w.state.pickups_taken, w.state.grazes, w.state.best_chain, w.state.rating,
            w.state.milestone, weathers, guardians, events
        );
    }
    // And without the pilot: idle steering, ten seconds.
    let mut w = World::new(7, SHIPPED);
    let mut all = 0u32;
    for _ in 0..600 { all |= w.step(1.0 / 60.0, Steer { x: 0.0, y: 0.0 }, false); }
    println!("idle: events {all:#x} depth {:.0} glow {:.1}", w.state.depth, w.state.glow);
}
