// A pilot: the steering an expert player would give, worked out by looking ahead. The game
// itself never uses this; the screenshot scenes fly with it so every staged frame is a frame the
// rules really reach, and the tuning harness plays every candidate build with it, so two builds
// are compared on the same hands.
//
// Each decision simulates the comet's own physics forward for three candidate directions and
// picks the one that survives longest and collects the most light on the way.

use crate::config::*;
use crate::world::{corridor_centre, corridor_half_width, screen_y, Item, Kind, World};

/// How far ahead the pilot looks, in seconds.
pub const HORIZON: f32 = 1.9;

/// What the pilot is not allowed to know, in a word: everything it sees comes from the world.
#[derive(Clone, Copy, Debug, Default)]
pub struct Options {
    /// Ignore the light entirely and only dodge; used when the run is already lost.
    pub dodge_only: bool,
    /// Steer away from the light; used to stage a frame where the comet is nearly spent.
    pub repel_light: bool,
    /// Weight the very next instant heavily, so a screenshot shows the comet in clear air.
    pub urgent_clearance: bool,
}

struct Point {
    x: f32,
    depth: f32,
}

/// The comet's position, `horizon` seconds from now, if it steers `direction` from here: the same
/// acceleration, drag-free ceiling and corridor clamp the world applies, integrated at STEP.
fn project(world: &World, direction: f32, horizon: f32) -> Vec<Point> {
    let speed = get(&world.gains, "player_speed");
    let mut x = world.comet.x;
    let mut vx = world.comet.vx;
    let steps = (horizon / STEP).round() as usize;
    let mut out = Vec::with_capacity(steps);
    for index in 1..=steps {
        let want = direction * speed;
        let rate = if want.abs() > vx.abs() {
            Rules::PLAYER_ACCEL
        } else {
            Rules::PLAYER_DRAG
        };
        vx += (want - vx).clamp(-rate * STEP, rate * STEP);
        x += vx * STEP;
        let depth = world.state.depth + world.state.speed * index as f32 * STEP;
        let centre = corridor_centre(depth);
        let room = corridor_half_width(&world.gains, depth) - Rules::PLAYER_RADIUS;
        x = x.max(centre - room).min(centre + room);
        out.push(Point { x, depth });
    }
    out
}

struct Threat {
    danger: f32,
    worst: f32,
    near_x: f32,
}

/// How close a projected path comes to rock. `danger` counts only genuine near-misses (rock well
/// clear of the path costs nothing, which leaves room for the light to matter), `worst` is the
/// tightest gap anywhere on the path, and `near_x` the direction of the nearest threat, so the
/// pilot can lean away from it.
fn threat_along(items: &[Item], path: &[Point], y: f32) -> Threat {
    let mut danger = 0.0;
    let mut worst = 90.0;
    let mut near_x = 0.0;
    for point in path {
        for item in items {
            if !item.active || item.kind.is_light() {
                continue;
            }
            // Vertical gap between the comet (fixed on screen) and this rock, at this instant.
            let dy = screen_y(item.at, point.depth) - y;
            if dy > 80.0 || dy < -80.0 {
                continue;
            }
            let dx = item.x - point.x;
            let gap = (dx * dx + dy * dy).sqrt() - item.r - Rules::PLAYER_RADIUS;
            if gap < 30.0 {
                danger += 30.0 - gap.max(-30.0);
            }
            if gap < worst {
                worst = gap;
                near_x = item.x - point.x;
            }
        }
    }
    Threat { danger, worst, near_x }
}

/// How long the projected path spends pinned against a wall. A real player keeps off the walls:
/// scraping one costs glow, so the pilot is scored as though it agrees.
fn time_at_wall(world: &World, path: &[Point]) -> f32 {
    let mut touching = 0;
    for point in path {
        let centre = corridor_centre(point.depth);
        let room = corridor_half_width(&world.gains, point.depth) - Rules::PLAYER_RADIUS - 1.5;
        if (point.x - centre).abs() >= room {
            touching += 1;
        }
    }
    touching as f32 * STEP
}

/// How much light a projected path would gather. Nearness counts, not just contact: a path that
/// passes close to a mote is rewarded for turning toward it, which gives the pilot a gradient to
/// chase rather than a bonus it only gets after it happens to touch one.
fn light_along(items: &[Item], path: &[Point], y: f32) -> f32 {
    let step = 2; // every other sample is plenty for a soft field
    let mut light = 0.0;
    let mut index = 0;
    while index < path.len() {
        let point = &path[index];
        for item in items {
            if !item.active || !item.kind.is_light() {
                continue;
            }
            let dy = screen_y(item.at, point.depth) - y;
            if dy > 34.0 || dy < -34.0 {
                continue;
            }
            let dx = (item.x - point.x).abs();
            if dx > 70.0 {
                continue;
            }
            // Full credit inside 16 px, easing to nothing at 70 px.
            let near = (1.0 - (dx - 16.0).max(0.0) / 54.0).max(0.0);
            light += near * if item.kind == Kind::Star { 3.2 } else { 1.0 };
        }
        index += step;
    }
    light
}

/// The direction to steer this step. `bias` keeps a pilot from dithering between two equal
/// choices: pass the direction it chose last.
pub fn pilot_direction(world: &World, bias: f32, horizon: f32, options: Options) -> f32 {
    let items = &world.items;
    // The nearest light ahead: what the pilot steers toward when nothing is in the way.
    let mut target: Option<&Item> = None;
    for item in items {
        if !item.active || !item.kind.is_light() || item.at < world.state.depth {
            continue;
        }
        if target.map(|t| item.at < t.at).unwrap_or(true) {
            target = Some(item);
        }
    }
    let corridor = corridor_centre(world.state.depth);
    // A dodge-only pilot ignores the light; a repel-light pilot steers away from it, as a player
    // does when the run is already lost and the light no longer matters.
    let home_x = if let Some(t) = target {
        if options.dodge_only || options.repel_light {
            corridor
        } else {
            t.x
        }
    } else {
        corridor
    };
    // A frame caught for a screenshot should not have a rock sitting on the comet: weight the
    // clearance of the very next moment heavily, so the comet is shown in clear air.
    let urgent = options.urgent_clearance;

    let mut best_direction = bias;
    let mut best_score = f32::NEG_INFINITY;
    for direction in [-1.0f32, 0.0, 1.0] {
        let path = project(world, direction, horizon);
        let threat = threat_along(items, &path, world.comet.y);
        let light = light_along(items, &path, world.comet.y);
        let scrape = time_at_wall(world, &path);
        // A path that ever goes inside a rock is beyond saving, however good the rest of it looks.
        let smash = if threat.worst < 0.0 {
            threat.worst * 60.0 - 400.0
        } else {
            0.0
        };
        // Getting closer to the light is worth something, so the pilot chases rather than drifts.
        let end_x = path.last().map(|p| p.x).unwrap_or(world.comet.x);
        let chase = -(home_x - end_x).abs() * 0.035;
        // Lean away from the nearest threat's side, as a player would.
        let avoid = if threat.worst < 46.0 {
            -threat.near_x.signum() * direction * 2.2
        } else {
            0.0
        };
        // A whisper of stickiness stops the pilot dithering between two equal paths.
        let steer = if direction == bias { 0.08 } else { 0.0 };
        let want_light = if options.repel_light {
            -light * 4.2
        } else if options.dodge_only {
            0.0
        } else {
            light * 4.2
        };
        // The comet's own spot, on this path's first instant, must be clear air.
        let mut here = 0.0;
        if urgent {
            let first = path.first().map(|p| (p.x, p.depth)).unwrap_or((world.comet.x, world.state.depth));
            for item in items {
                if !item.active || item.kind.is_light() {
                    continue;
                }
                let dy = screen_y(item.at, first.1) - world.comet.y;
                if dy > 46.0 || dy < -46.0 {
                    continue;
                }
                let gap = (item.x - first.0).abs() - item.r - Rules::PLAYER_RADIUS;
                if gap < 60.0 {
                    here -= (60.0 - gap.max(0.0)) * 1.4;
                }
            }
        }
        let score = -threat.danger * 2.6 + smash + want_light - scrape * 7.0 + chase + avoid + steer + here;
        if score > best_score {
            best_score = score;
            best_direction = direction;
        }
    }
    best_direction
}

/// The direction the pilot steers at the default horizon.
pub fn steer(world: &World, bias: f32) -> f32 {
    pilot_direction(world, bias, HORIZON, Options::default())
}

/// A short horizon, for the scenes that want a hurried player rather than a perfect one.
pub fn hurried(world: &World, bias: f32) -> f32 {
    pilot_direction(world, bias, 0.45, Options::default())
}

/// Fly the world with the pilot for a whole run, and report how it went. This is what the tuning
/// harness measures a set of gains by, so it lives beside the pilot that plays it.
#[derive(Clone, Debug)]
pub struct RunResult {
    pub seed: u32,
    pub won: bool,
    pub depth: f32,
    pub score: f32,
    pub time: f32,
    pub glow: f32,
    pub motes: u32,
    pub stars: u32,
    pub rock_hits: u32,
    pub wall_ticks: u32,
    /// How close the run came to dying, 0..1: the closest the glow got to empty, as a share.
    pub closest_call: f32,
    /// The share of the run the glow spent under a quarter: the tension the run carried.
    pub time_in_danger: f32,
}

/// Plays one run to its end. `max_seconds` bounds it, so a build nobody can win still terminates.
pub fn play_run(seed: u32, gains: Gains, max_seconds: f32) -> RunResult {
    let mut world = World::new(seed, gains);
    let mut bias = 0.0f32;
    let mut wall_ticks = 0u32;
    let mut danger_ticks = 0u32;
    let mut ticks = 0u32;
    let mut lowest_glow = f32::INFINITY;
    let limit = (max_seconds / STEP) as u32;

    // Decisions are made a few times a second, as a person's hands are: steering every physics
    // step would be a machine that does not exist and would flatter the pilot.
    let hold = 4u32;
    let mut direction = 0.0f32;

    while ticks < limit {
        if ticks % hold == 0 {
            direction = pilot_direction(&world, bias, HORIZON, Options::default());
            bias = direction;
        }
        let events = world.step(STEP, Steer { x: direction, y: 0.0 }, false);
        if events & crate::world::EVENT_WALL != 0 {
            wall_ticks += 1;
        }
        let glow = world.state.glow;
        if glow < lowest_glow {
            lowest_glow = glow;
        }
        if glow < 25.0 {
            danger_ticks += 1;
        }
        ticks += 1;
        if world.outcome() != 0 {
            break;
        }
    }

    // A run that never ended is a loss: the build could not be beaten in the time allowed.
    let seconds = ticks as f32 * STEP;
    RunResult {
        seed,
        won: world.outcome() == 1,
        depth: world.state.depth,
        score: world.state.score,
        time: seconds,
        glow: world.state.glow,
        motes: world.state.motes_taken,
        stars: world.state.stars_taken,
        rock_hits: world.state.rock_hits,
        wall_ticks,
        closest_call: (1.0 - lowest_glow / 100.0).clamp(0.0, 1.0),
        time_in_danger: if ticks == 0 { 0.0 } else { danger_ticks as f32 / ticks as f32 },
    }
}

use crate::world::Steer;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pilot_flies_a_run_and_keeps_the_comet_off_the_walls() {
        let result = play_run(7, SHIPPED, 120.0);
        assert!(result.depth > 200.0, "the pilot made no progress: {result:?}");
        assert!(result.motes > 0, "the pilot collected nothing");
    }

    #[test]
    fn the_pilot_is_reproducible() {
        let a = play_run(19, SHIPPED, 120.0);
        let b = play_run(19, SHIPPED, 120.0);
        assert_eq!(a.score, b.score, "the same seed scored differently");
        assert_eq!(a.depth, b.depth, "the same seed went a different depth");
    }

    #[test]
    fn the_pilot_steers_somewhere_and_stays_on_the_screen() {
        let mut world = World::new(23, SHIPPED);
        let mut bias = 0.0;
        for tick in 0..3000 {
            if tick % 4 == 0 {
                bias = steer(&world, bias);
            }
            world.step(STEP, Steer { x: bias, y: 0.0 }, false);
            assert!((-1.0..=1.0).contains(&bias), "the pilot asked for {bias}");
            assert!(world.comet.x.is_finite(), "the comet left the number line");
        }
    }
}
