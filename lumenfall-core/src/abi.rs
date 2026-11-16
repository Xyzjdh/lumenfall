// The WebAssembly boundary: the only surface between Rust and the page.
//
// There is no wasm-bindgen here, and no package to install. The module exports plain integers and
// floats, the page allocates one block of memory for the item table at start-up, and everything
// else is a call with scalar arguments. That keeps the module small and the interface obvious
// enough to read in the page's own code.
//
// Item table: a flat run of ITEM_WORDS f32 per item, in the order the page reads it:
//   0 kind (0 mote, 1 star, 2 stone, 3 shard)
//   1 x, 2 at, 3 r (collision), 4 draw_r, 5 rot, 6 spin, 7 wobble, 8 phase

use crate::config::{self, Gains, SHIPPED};
use crate::pilot::{self, Options};
use crate::world::{Steer, World};

/// Words per item in the table the page reads.
pub const ITEM_WORDS: usize = 9;

/// One live world. The page keeps exactly one, but the type is a struct so a future replay tool
/// could hold several at once.
struct Host {
    world: World,
    gains: Gains,
    table: Vec<f32>,
    last_events: u32,
    bias: f32,
}

impl Host {
    fn new() -> Self {
        Host {
            world: World::new(1, SHIPPED),
            gains: SHIPPED,
            table: Vec::with_capacity(ITEM_WORDS * 256),
            last_events: 0,
            bias: 0.0,
        }
    }

    /// Writes the item table the page reads: kind, position, size and the numbers the renderer
    /// animates with. Called on demand rather than every step, so a step stays a step.
    fn fill_table(&mut self) -> usize {
        self.table.clear();
        for item in &self.world.items {
            self.table.push(item.kind.code() as f32);
            self.table.push(item.x);
            self.table.push(item.at);
            self.table.push(item.r);
            self.table.push(item.draw_r);
            self.table.push(item.rot);
            self.table.push(item.spin);
            self.table.push(item.wobble);
            self.table.push(item.phase);
        }
        self.world.items.len()
    }
}

static mut HOST: Option<Host> = None;

#[allow(static_mut_refs)]
fn host() -> &'static mut Host {
    // Single-threaded by construction: a wasm module is one linear memory on one thread, and the
    // page calls into it from the animation frame and nowhere else.
    unsafe {
        if HOST.is_none() {
            HOST = Some(Host::new());
        }
        HOST.as_mut().unwrap()
    }
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

/// The interface version the page checks before it trusts anything else.
#[no_mangle]
pub extern "C" fn abi_version() -> u32 {
    crate::ABI_VERSION
}

/// A fresh world at a seed, played with the last gains set.
#[no_mangle]
pub extern "C" fn world_new(seed: u32) -> f32 {
    let h = host();
    let gains = h.gains;
    h.world = World::new(seed, gains);
    h.last_events = 0;
    h.bias = 0.0;
    0.0
}

/// The descent again, into a new seed: the same seed replays the same world.
#[no_mangle]
pub extern "C" fn world_reseed(seed: u32) {
    host().world.reseed(seed);
}

/// One fixed step. Returns the event bit field for the step.
#[no_mangle]
pub extern "C" fn world_step(dt: f32, steer_x: f32, steer_y: f32, idle: u32) -> u32 {
    let h = host();
    let events = h.world.step(dt, Steer { x: steer_x, y: steer_y }, idle != 0);
    h.last_events = events;
    events
}

/// The events of the last step, for a caller that would rather ask than keep them.
#[no_mangle]
pub extern "C" fn world_events() -> u32 {
    host().last_events
}

// ---------------------------------------------------------------------------------------------
// Reading the world: every number the page's HUD and renderer need, one call each
// ---------------------------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn depth() -> f32 {
    host().world.state.depth
}
#[no_mangle]
pub extern "C" fn speed() -> f32 {
    host().world.state.speed
}
#[no_mangle]
pub extern "C" fn glow() -> f32 {
    host().world.state.glow
}
#[no_mangle]
pub extern "C" fn score() -> f32 {
    host().world.state.score
}
#[no_mangle]
pub extern "C" fn chain() -> f32 {
    host().world.state.chain as f32
}
#[no_mangle]
pub extern "C" fn multiplier() -> f32 {
    host().world.multiplier()
}
#[no_mangle]
pub extern "C" fn motes_taken() -> u32 {
    host().world.state.motes_taken
}
#[no_mangle]
pub extern "C" fn stars_taken() -> u32 {
    host().world.state.stars_taken
}
#[no_mangle]
pub extern "C" fn rock_hits() -> u32 {
    host().world.state.rock_hits
}
#[no_mangle]
pub extern "C" fn wall_hits() -> u32 {
    host().world.state.hits_wall
}
#[no_mangle]
pub extern "C" fn stratum() -> u32 {
    host().world.state.stratum as u32
}
#[no_mangle]
pub extern "C" fn stratum_banner() -> f32 {
    host().world.state.stratum_banner
}
#[no_mangle]
pub extern "C" fn run_time() -> f32 {
    host().world.state.time
}
/// 0 while the run goes on, 1 for the core reached, 2 for the glow spent.
#[no_mangle]
pub extern "C" fn outcome() -> u32 {
    host().world.outcome()
}

#[no_mangle]
pub extern "C" fn comet_x() -> f32 {
    host().world.comet.x
}
#[no_mangle]
pub extern "C" fn comet_y() -> f32 {
    host().world.comet.y
}
#[no_mangle]
pub extern "C" fn comet_tilt() -> f32 {
    host().world.comet.tilt
}
/// The corridor under the comet: middle, then half-width.
#[no_mangle]
pub extern "C" fn corridor_centre_now() -> f32 {
    host().world.corridor().0
}
#[no_mangle]
pub extern "C" fn corridor_half_now() -> f32 {
    host().world.corridor().1
}
/// The corridor at any depth, for drawing the walls ahead of the comet.
#[no_mangle]
pub extern "C" fn corridor_centre_at(at: f32) -> f32 {
    crate::world::corridor_centre(at)
}
#[no_mangle]
pub extern "C" fn corridor_half_at(at: f32) -> f32 {
    crate::world::corridor_half_width(&host().gains, at)
}
/// Where an item at a given depth sits on screen now.
#[no_mangle]
pub extern "C" fn screen_y_of(item_depth: f32) -> f32 {
    crate::world::screen_y(item_depth, host().world.state.depth)
}

// ---------------------------------------------------------------------------------------------
// The item table
// ---------------------------------------------------------------------------------------------

/// Fills the table and returns how many items are in it.
#[no_mangle]
pub extern "C" fn items_fill() -> u32 {
    host().fill_table() as u32
}

/// Where the item table starts in the module's memory, as a byte offset.
#[no_mangle]
pub extern "C" fn items_ptr() -> *const f32 {
    host().table.as_ptr()
}

/// How many words one item occupies, so the page does not have to assume it.
#[no_mangle]
pub extern "C" fn items_stride() -> u32 {
    ITEM_WORDS as u32
}

// ---------------------------------------------------------------------------------------------
// The pilot: the same steering the harness plays with, offered to the page for its screenshots
// ---------------------------------------------------------------------------------------------

/// The direction the pilot would steer: -1, 0 or 1.
#[no_mangle]
pub extern "C" fn pilot_steer(bias: f32, horizon: f32, urgent: u32) -> f32 {
    let h = host();
    let options = Options {
        dodge_only: false,
        repel_light: false,
        urgent_clearance: urgent != 0,
    };
    let direction = pilot::pilot_direction(&h.world, bias, horizon, options);
    h.bias = direction;
    direction
}

/// The direction a pilot steering away from the light would give, for a staged losing frame.
#[no_mangle]
pub extern "C" fn pilot_steer_away(bias: f32) -> f32 {
    let h = host();
    let options = Options {
        dodge_only: false,
        repel_light: true,
        urgent_clearance: true,
    };
    pilot::pilot_direction(&h.world, bias, pilot::HORIZON, options)
}

// ---------------------------------------------------------------------------------------------
// The gains: what the page plays with, and what the harness chose
// ---------------------------------------------------------------------------------------------

/// Sets every gain at once, from a table the page already holds. Unknown knobs are ignored and
/// every value is clamped to the design envelope, so a corrupt table cannot make an unplayable
/// game.
#[no_mangle]
pub extern "C" fn gains_set_all(ptr: *const f32, len: u32) -> u32 {
    let count = (len as usize).min(config::KNOBS.len());
    if ptr.is_null() {
        return 0;
    }
    let values = unsafe { core::slice::from_raw_parts(ptr, count) };
    let h = host();
    for (i, value) in values.iter().enumerate() {
        h.gains[i] = value.clamp(config::KNOBS[i].lo, config::KNOBS[i].hi);
    }
    // The world keeps the gains it was started with, so hand it the new set too.
    h.world.gains = h.gains;
    count as u32
}

/// Sets one gain by name, and returns the value it settled on (NaN for an unknown name).
#[no_mangle]
pub extern "C" fn gains_set(name_ptr: *const u8, name_len: u32, value: f32) -> f32 {
    let name = match unsafe { core::slice::from_raw_parts(name_ptr, name_len as usize) } {
        bytes if bytes.is_empty() => return f32::NAN,
        bytes => match core::str::from_utf8(bytes) {
            Ok(text) => text,
            Err(_) => return f32::NAN,
        },
    };
    let h = host();
    let mut gains = h.gains;
    config::set(&mut gains, name, value);
    h.gains = gains;
    h.world.gains = gains;
    config::get(&gains, name)
}

/// Whether a name the page passes is a knob, and which one: 1 for a match, 0 for no such knob.
/// The bytes are read once, inside this call, so the page can hand over a fresh string each time
/// and never depend on a table staying put in the module's memory between calls.
#[no_mangle]
pub extern "C" fn gains_has_name(name_ptr: *const u8, name_len: u32) -> u32 {
    if name_ptr.is_null() {
        return 0;
    }
    let bytes = unsafe { core::slice::from_raw_parts(name_ptr, name_len as usize) };
    match core::str::from_utf8(bytes) {
        Ok(name) => u32::from(config::KNOBS.iter().any(|k| k.name == name)),
        Err(_) => 0,
    }
}

/// Which index a name stands for, or 0xFFFFFFFF when it names no knob. Same contract as above:
/// the name is read inside the call and not held.
#[no_mangle]
pub extern "C" fn gains_index_of(name_ptr: *const u8, name_len: u32) -> u32 {
    if name_ptr.is_null() {
        return u32::MAX;
    }
    let bytes = unsafe { core::slice::from_raw_parts(name_ptr, name_len as usize) };
    match core::str::from_utf8(bytes) {
        Ok(name) => config::KNOBS
            .iter()
            .position(|k| k.name == name)
            .map(|i| i as u32)
            .unwrap_or(u32::MAX),
        Err(_) => u32::MAX,
    }
}

/// One gain, by its index in the published list.
#[no_mangle]
pub extern "C" fn gains_get(index: u32) -> f32 {
    config::by_index(&host().gains, index as usize)
}

/// A scratch block for a name: the page writes one here, the call reads it, and nothing holds it.
/// One block is enough because names are compared one at a time and never kept.
static mut BYTES_SCRATCH: [u8; 256] = [0; 256];

/// Where the name scratch starts, in bytes.
#[no_mangle]
pub extern "C" fn bytes_alloc(len: u32) -> *mut u8 {
    let _ = len;
    unsafe { core::ptr::addr_of_mut!(BYTES_SCRATCH) as *mut u8 }
}

/// The matching release. Nothing outlives a call in this module, so it only exists so the page
/// does not have to know that.
#[no_mangle]
pub extern "C" fn bytes_free(_ptr: *mut u8, _len: u32) {}

/// A block of memory the page may write the whole gain table into before gains_set_all: the
/// boundary takes floats, not objects, so the page needs somewhere to put them.
static mut GAINS_SCRATCH: [f32; 64] = [0.0; 64];

/// Where the scratch block starts, in bytes.
#[no_mangle]
pub extern "C" fn gains_block(len: u32) -> *mut f32 {
    // The block is fixed and larger than any gain table; a longer table simply stops at its end.
    let _ = len;
    unsafe { core::ptr::addr_of_mut!(GAINS_SCRATCH) as *mut f32 }
}

/// How many knobs there are.
#[no_mangle]
pub extern "C" fn gains_count() -> u32 {
    config::KNOBS.len() as u32
}

/// The gains, printed, for a browser console that wants to see what it is playing with.
#[cfg(test)]
fn gains_line() -> String {
    format!("{}", crate::config::GainsView(&host().gains))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::KNOBS;

    /// The interface is a global; tests that touch it run one at a time.
    fn serial<T>(f: impl FnOnce() -> T) -> T {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        f()
    }

    #[test]
    fn the_abi_version_is_what_the_page_expects() {
        assert_eq!(abi_version(), 1);
    }

    #[test]
    fn a_fresh_world_reads_back_its_own_start() {
        serial(|| {
            // The module is one global: start every test from the build the game ships with.
            let ptr = gains_block(SHIPPED.len() as u32);
            unsafe {
                core::ptr::copy_nonoverlapping(SHIPPED.as_ptr(), ptr, SHIPPED.len());
            }
            gains_set_all(ptr, SHIPPED.len() as u32);
            world_new(7);
            assert_eq!(depth(), 0.0);
            assert!((glow() - 100.0).abs() < 1e-3);
            assert_eq!(outcome(), 0);
            assert_eq!(stratum(), 0);
        });
    }

    #[test]
    fn stepping_moves_the_world_and_reports_events() {
        serial(|| {
            world_new(7);
            let mut all = 0u32;
            for _ in 0..180 {
                all |= world_step(config::STEP, 0.0, 0.0, 0);
            }
            assert!(depth() > 0.0, "three seconds fell no metres");
            assert!(all != 0, "three seconds of descent raised no event at all");
            let last = world_step(config::STEP, 0.0, 0.0, 0);
            assert_eq!(world_events(), last, "world_events did not report the last step");
        });
    }

    #[test]
    fn the_item_table_is_filled_with_one_row_per_item() {
        serial(|| {
            world_new(19);
            for _ in 0..600 {
                world_step(config::STEP, 0.0, 0.0, 0);
            }
            let count = items_fill() as usize;
            assert!(count > 0, "ten seconds of descent filled no table");
            let stride = items_stride() as usize;
            assert_eq!(stride, ITEM_WORDS);
            let h = host();
            assert_eq!(h.table.len(), count * stride);
            for row in 0..count {
                let kind = h.table[row * stride];
                assert!((0.0..=3.0).contains(&kind), "item with kind {kind}");
                let at = h.table[row * stride + 2];
                assert!(at.is_finite(), "item with a bad depth");
            }
        });
    }

    #[test]
    fn the_pilot_answers_with_one_of_three_directions() {
        serial(|| {
            world_new(23);
            for _ in 0..300 {
                let d = pilot_steer(0.0, pilot::HORIZON, 0);
                assert!([-1.0, 0.0, 1.0].contains(&d), "the pilot answered {d}");
                world_step(config::STEP, d, 0.0, 0);
            }
        });
    }

    #[test]
    fn a_gain_block_set_before_the_world_is_the_world_the_world_plays() {
        // The page's order: write the whole table, then start a world. The old world_new raced
        // that order and the descent kept the numbers the module shipped with — this is the test
        // that would have caught it.
        serial(|| {
            world_new(7);
            let mut values = [0.0f32; KNOBS.len()];
            for (i, knob) in KNOBS.iter().enumerate() {
                values[i] = knob.lo;
            }
            let ptr = gains_block(values.len() as u32);
            unsafe {
                core::ptr::copy_nonoverlapping(values.as_ptr(), ptr, values.len());
            }
            gains_set_all(ptr, values.len() as u32);
            world_new(7);
            assert!((gains_get(config::index_of("corridor_base") as u32) - KNOBS[config::index_of("corridor_base")].lo).abs() < 1e-3);
            // And the world the page will step really is played with them: a starting glow at the
            // envelope's floor is a fact only the new world can show.
            let start = glow();
            assert!((start - KNOBS[config::index_of("glow_start")].lo).abs() < 1e-3, "glow_start was {start}");
        });
    }

    #[test]
    fn a_gain_set_by_name_is_clamped_and_read_back() {
        serial(|| {
            let name = b"glow_mote";
            let settled = gains_set(name.as_ptr(), name.len() as u32, 9_999.0);
            assert!((settled - KNOBS[config::index_of("glow_mote")].hi).abs() < 1e-6);
            gains_set(name.as_ptr(), name.len() as u32, 7.5);
            assert!((gains_get(config::index_of("glow_mote") as u32) - 7.5).abs() < 1e-6);
            let unknown = b"not_a_knob";
            assert!(gains_set(unknown.as_ptr(), unknown.len() as u32, 1.0).is_nan());
        });
    }

    #[test]
    fn every_knob_name_fits_the_name_scratch() {
        for knob in config::KNOBS {
            assert!(knob.name.len() < 256, "{} is longer than the scratch block", knob.name);
        }
        let ptr = bytes_alloc(8);
        assert!(!ptr.is_null());
    }

    #[test]
    fn a_name_is_recognised_and_mapped_to_its_index() {
        serial(|| {
            let name = b"rock_gap_end";
            assert_eq!(gains_has_name(name.as_ptr(), name.len() as u32), 1);
            let index = gains_index_of(name.as_ptr(), name.len() as u32);
            assert_eq!(index as usize, config::index_of("rock_gap_end"));
            let unknown = b"not_a_knob";
            assert_eq!(gains_has_name(unknown.as_ptr(), unknown.len() as u32), 0);
            assert_eq!(gains_index_of(unknown.as_ptr(), unknown.len() as u32), u32::MAX);
        });
    }

    #[test]
    fn the_gains_print_as_a_line_the_record_can_keep() {
        serial(|| {
            let line = gains_line();
            assert!(line.contains("glow_mote="), "the printed gains lost a knob: {line}");
            assert_eq!(line.matches('=').count(), KNOBS.len());
        });
    }
}
