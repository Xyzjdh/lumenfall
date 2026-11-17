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

/// The world, if one has been made. For the v2 readers: they must never make one, because a
/// reader that starts the game would change the game.
#[allow(static_mut_refs)]
fn world() -> Option<&'static World> {
    unsafe { HOST.as_ref().map(|h| &h.world) }
}

/// The one world, for the writers: the shop buys into it, and the daily starts a new one.
#[allow(static_mut_refs)]
fn world_mut() -> Option<&'static mut World> {
    unsafe { HOST.as_mut().map(|h| &mut h.world) }
}

/// The host, made if it is not there yet: the v2 writers need somewhere to write.
#[allow(static_mut_refs)]
fn host_mut() -> &'static mut Host {
    unsafe {
        if HOST.is_none() {
            HOST = Some(Host::new());
        }
        HOST.as_mut().unwrap()
    }
}

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
    // The sheet the player has bought and the world they chose survive a restart: a reset is a
    // new descent, not a new game. `world_new_full` is how a different biome is asked for.
    let upgrades = h.world.upgrades;
    let biome = h.world.biome;
    h.world = World::with_everything(seed, gains, upgrades, biome);
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
            // The interface is one global, so this test sets up its own build rather than
            // inheriting whatever the test before it left in the gain table: a test that depends
            // on the order it ran in is a test that fails on a different machine.
            let ptr = gains_block(SHIPPED.len() as u32);
            unsafe {
                core::ptr::copy_nonoverlapping(SHIPPED.as_ptr(), ptr, SHIPPED.len());
            }
            gains_set_all(ptr, SHIPPED.len() as u32);
            world_new(7);
            // A comet that does not steer still has to meet something: a mote is always laid
            // before the first five seconds are out, so the event has to arrive by then. If it
            // does not, the spawn clock is not crossing the boundary — what this test is for.
            let mut all = 0u32;
            for _ in 0..(60 * 5) {
                all |= world_step(config::STEP, 0.0, 0.0, 0);
            }
            assert!(depth() > 0.0, "five seconds fell no metres");
            assert!(all != 0, "five seconds of descent raised no event at all: {all:#x}");
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
            // The tank is the knob, floored at 100 by the rules (plus the upgrade bonus, which is
            // nought here): a build whose knob asks for less still starts with a whole tank.
            let knob = KNOBS[config::index_of("glow_start")].lo;
            let want = knob.max(100.0);
            let start = glow();
            assert!((start - want).abs() < 1e-3, "the tank was {start}, not {want} (knob {knob})");
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

// ---------------------------------------------------------------------------------------------
// The rest of the game's state, for the page: the v2 surface. Everything here reads the same one
// global world the functions above do, and every function returns a plain number so the page
// needs no memory protocol beyond the ones it already has.
// ---------------------------------------------------------------------------------------------

/// The biome the run is played in: 0..5.
#[no_mangle]
pub extern "C" fn biome_id() -> u32 {
    world().map(|w| w.biome.id).unwrap_or(0)
}

/// A biome's name, for the HUD. Index is the biome id; out of range wraps.
#[no_mangle]
pub extern "C" fn biome_name(id: u32) -> u32 {
    const NAMES: &[&str] = &[
        "quiet", "storm", "bloom", "glacier", "volcano", "eclipse",
    ];
    let index = (id as usize) % NAMES.len();
    write_scratch(NAMES[index])
}

/// A biome's one-line blurb, for the bank.
#[no_mangle]
pub extern "C" fn biome_blurb(id: u32) -> u32 {
    let index = (id as usize) % crate::systems::Biome::COUNT as usize;
    let biome = crate::systems::Biome::from_index(index as u32);
    write_scratch(biome.blurb())
}

/// Send a string to the page: the offset of its bytes from the module's scratch, and the length
/// returned to the caller as the value. The page reads `bytes_alloc(0) + offset`.
fn write_scratch(text: &str) -> u32 {
    let room = unsafe { core::slice::from_raw_parts_mut(bytes_alloc(0), 256) };
    // Trim at a character boundary, not a byte count: slicing a UTF-8 string mid-character
    // panics, and a string that does not fit must be cut short rather than abort the module.
    let mut end = text.len().min(room.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    let bytes = &text.as_bytes()[..end];
    room[..end].copy_from_slice(bytes);
    end as u32
}

// ---- the shop -------------------------------------------------------------------------------

/// How many upgrades the shop sells.
#[no_mangle]
pub extern "C" fn upgrades_count() -> u32 {
    crate::kinds::Upgrade::ALL.len() as u32
}

/// An upgrade's name, in the scratch, length returned.
#[no_mangle]
pub extern "C" fn upgrade_name(index: u32) -> u32 {
    match crate::kinds::Upgrade::from_index(index) {
        Some(u) => write_scratch(u.name()),
        None => write_scratch("?"),
    }
}

/// An upgrade's blurb, in the scratch.
#[no_mangle]
pub extern "C" fn upgrade_blurb(index: u32) -> u32 {
    match crate::kinds::Upgrade::from_index(index) {
        Some(u) => write_scratch(u.blurb()),
        None => write_scratch("?"),
    }
}

/// What the next level of an upgrade costs, or 0 when it is already full.
#[no_mangle]
pub extern "C" fn upgrade_cost(index: u32) -> u32 {
    world()
        .map(|w| match crate::kinds::Upgrade::from_index(index) {
            Some(u) => {
                let level = w.upgrades.level(u);
                if level >= u.max_level() {
                    0
                } else {
                    u.cost(level)
                }
            }
            None => 0,
        })
        .unwrap_or(0)
}

/// How many levels of an upgrade are held.
#[no_mangle]
pub extern "C" fn upgrade_level(index: u32) -> u32 {
    world()
        .map(|w| match crate::kinds::Upgrade::from_index(index) {
            Some(u) => w.upgrades.level(u),
            None => 0,
        })
        .unwrap_or(0)
}

/// The most levels an upgrade can hold.
#[no_mangle]
pub extern "C" fn upgrade_max(index: u32) -> u32 {
    crate::kinds::Upgrade::from_index(index)
        .map(|u| u.max_level())
        .unwrap_or(0)
}

/// Buy one level. Returns 1 when it was bought, 0 when it could not be (full, or too dear).
/// The shards are handed in by the page: the ledger lives there, because it must survive the tab.
#[no_mangle]
pub extern "C" fn upgrade_buy(index: u32, shards: u32) -> u32 {
    let Some(u) = crate::kinds::Upgrade::from_index(index) else {
        return 0;
    };
    let Some(w) = world_mut() else { return 0 };
    let level = w.upgrades.level(u);
    if level >= u.max_level() {
        return 0;
    }
    let cost = u.cost(level);
    if shards < cost {
        return 0;
    }
    w.upgrades.levels[u.index() as usize] = level + 1;
    cost // the page subtracts exactly what was reported
}

/// The cheapest thing the shop sells that the player cannot yet afford, for the HUD's nudge.
#[no_mangle]
pub extern "C" fn upgrade_cheapest() -> u32 {
    world()
        .map(|w| {
            crate::kinds::Upgrade::ALL
                .iter()
                .filter(|u| w.upgrades.level(**u) < u.max_level())
                .map(|u| u.cost(w.upgrades.level(*u)))
                .min()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

// ---- the daily ------------------------------------------------------------------------------

/// The seed for a day number: the same day is the same descent everywhere.
#[no_mangle]
pub extern "C" fn daily_seed_of(day: u32) -> u32 {
    crate::systems::daily_seed(day)
}

/// Which day a UNIX time falls on, in the game's own calendar.
#[no_mangle]
pub extern "C" fn day_of_epoch(seconds: i64) -> u32 {
    crate::systems::day_of(seconds)
}

// ---- the run, read back ---------------------------------------------------------------------

/// The combo's rating, 0..5.
#[no_mangle]
pub extern "C" fn combo_rating() -> u32 {
    world().map(|w| w.combo.rating).unwrap_or(0)
}

/// The rating's word, in the scratch.
#[no_mangle]
pub extern "C" fn combo_word() -> u32 {
    match world() {
        Some(w) => write_scratch(w.combo.rating_word()),
        None => write_scratch("—"),
    }
}

/// Seconds of unbroken clean play.
#[no_mangle]
pub extern "C" fn combo_clean() -> f32 {
    world().map(|w| w.combo.clean).unwrap_or(0.0)
}

/// Which weather is blowing: a `Weather::code`.
#[no_mangle]
pub extern "C" fn weather_code() -> u32 {
    world().map(|w| w.sky.now.code()).unwrap_or(0)
}

/// Its name, in the scratch.
#[no_mangle]
pub extern "C" fn weather_name() -> u32 {
    match world() {
        Some(w) => write_scratch(w.sky.now.name()),
        None => write_scratch("clear"),
    }
}

/// The guardian's phase: 0 asleep, 1 fighting, 2 beaten.
#[no_mangle]
pub extern "C" fn guardian_phase() -> u32 {
    world().map(|w| w.guardian.phase).unwrap_or(0)
}

/// How much of it is left, 1 down to 0.
#[no_mangle]
pub extern "C" fn guardian_health() -> f32 {
    world().map(|w| w.guardian.health).unwrap_or(0.0)
}

/// What its current attack is called.
#[no_mangle]
pub extern "C" fn guardian_attack_name() -> u32 {
    match world() {
        Some(w) => write_scratch(w.guardian.attack_name()),
        None => write_scratch(""),
    }
}

/// Shield charges held.
#[no_mangle]
pub extern "C" fn shields_held() -> u32 {
    world().map(|w| w.state.shields).unwrap_or(0)
}

/// Seconds of slow left.
#[no_mangle]
pub extern "C" fn slow_left() -> f32 {
    world().map(|w| w.state.slow).unwrap_or(0.0)
}

/// Seconds of lure left.
#[no_mangle]
pub extern "C" fn lure_left() -> f32 {
    world().map(|w| w.state.lure).unwrap_or(0.0)
}

/// Seconds of doubled score left.
#[no_mangle]
pub extern "C" fn double_left() -> f32 {
    world().map(|w| w.state.double).unwrap_or(0.0)
}

/// Near misses this run.
#[no_mangle]
pub extern "C" fn grazes() -> u32 {
    world().map(|w| w.state.grazes).unwrap_or(0)
}

/// Non-light pickups taken this run.
#[no_mangle]
pub extern "C" fn pickups_taken() -> u32 {
    world().map(|w| w.state.pickups_taken).unwrap_or(0)
}

/// The milestone last reached, in metres.
#[no_mangle]
pub extern "C" fn milestone() -> f32 {
    world().map(|w| w.state.milestone).unwrap_or(0.0)
}

/// The best clean streak this run, in seconds.
#[no_mangle]
pub extern "C" fn best_clean() -> f32 {
    world().map(|w| w.combo.best_clean).unwrap_or(0.0)
}

/// Start a world in a given biome with a given upgrade sheet, for the daily and the shop.
#[no_mangle]
pub extern "C" fn world_new_full(seed: u32, biome: u32) -> u32 {
    let gains = host().gains;
    let upgrades = world().map(|w| w.upgrades).unwrap_or_default();
    host_mut().world = crate::world::World::with_everything(
        seed,
        gains,
        upgrades,
        crate::systems::Biome::from_index(biome),
    );
    host().world.state.depth as u32
}

/// The best chain this run reached.
#[no_mangle]
pub extern "C" fn best_chain_key() -> i32 {
    world().map(|w| w.combo.best_chain).unwrap_or(0)
}

/// The chain as it stands right now.
#[no_mangle]
pub extern "C" fn chain_now() -> i32 {
    world().map(|w| w.combo.chain).unwrap_or(0)
}

/// How many motes and stars the run has taken, as one number: the ledger's currency.
#[no_mangle]
pub extern "C" fn motes_run() -> u32 {
    world()
        .map(|w| w.state.motes_taken + w.state.stars_taken)
        .unwrap_or(0)
}

/// Puts a level on an upgrade without charging for it: the page owns the ledger, and at boot it
/// hands back the sheet it has kept. Returns the level now held.
#[no_mangle]
pub extern "C" fn upgrade_set(index: u32, level: u32) -> u32 {
    let Some(u) = crate::kinds::Upgrade::from_index(index) else {
        return 0;
    };
    let Some(w) = world_mut() else { return 0 };
    let level = level.min(u.max_level());
    w.upgrades.levels[u.index() as usize] = level;
    level
}

/// A whole sheet at once, as one word per upgrade from the lowest index: the boot's fast path.
/// The page writes the levels into the bytes scratch as one byte each, so eight levels cross the
/// boundary in one call instead of eight.
#[no_mangle]
pub extern "C" fn upgrades_set_block(levels_ptr: *const u8, count: u32) -> u32 {
    if levels_ptr.is_null() {
        return 0;
    }
    let Some(w) = world_mut() else { return 0 };
    let bytes = unsafe { core::slice::from_raw_parts(levels_ptr, count as usize) };
    let total = crate::kinds::Upgrade::ALL.len().min(bytes.len());
    for (index, byte) in bytes.iter().take(total).enumerate() {
        if let Some(u) = crate::kinds::Upgrade::from_index(index as u32) {
            w.upgrades.levels[index] = (*byte as u32).min(u.max_level());
        }
    }
    total as u32
}

/// The tank's ceiling under the current sheet: the knob, floored at 100, plus the Lantern bonus.
/// The HUD reads this so a bought tank shows as full rather than as over 100 %.
#[no_mangle]
pub extern "C" fn max_glow_now() -> f32 {
    world().map(|w| w.max_glow()).unwrap_or(100.0)
}
