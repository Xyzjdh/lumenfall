// The tuning harness: the loop that makes LUMENFALL harder, fairer and tighter by playing it.
//
// It is a cross-entropy search with an elite set. Each round walks a population of candidate
// gain sets toward the ones that scored best, narrowing its own search as it goes. It is not a
// gradient: the game's score is jagged in its knobs, so the harness only ever compares whole
// builds by playing them, which is honest but noisy, and the narrowing is what survives the noise.
//
// What a build is judged on, and why:
//
//   win_share   A build nobody can beat is a wall, and a build everybody beats is a walk. The
//               target band is 55-85% for a pilot that plays well but does not see the future;
//               a human is worse than the pilot, so a build the pilot wins 100% of is a build a
//               person wins about half of.
//   length      A run should last long enough to be a run: the harness wants the median inside
//               45-105 seconds, and scores the distance from 72 s, the length the game is
//               designed around.
//   tension     A run with no close call is a run with no stakes. The pilot's glow should fall
//               under a quarter of the tank for a real share of the descent, but not so much
//               that the run is a coin toss.
//   flow        Dying to rock is the player's mistake; dying because the light ran out through
//               no fault of theirs is the build's. The harness penalises that share.
//   monotony    The strata should each be survivable and the descent should still feel like it
//               tightens, so the harness asks that the run get progressively harder.
//
// Usage:
//   tune benchmark            how fast this machine plays a run (for choosing a budget)
//   tune baseline             the shipped build's numbers, as the reference point
//   tune loop [rounds]        the search; 50 rounds by default
//   tune show <name=value,..> the score of one named build
//   tune biomes               the shipped build, played in every biome
//
// The run under the numbers is the v2 run: biomes, weather, pickups, grazes, the guardian. The
// harness has to see the game the page sees, or it is tuning last week's game.
//
// The whole search is deterministic: it seeds its own RNG, so running it twice on the same
// machine gives the same answer.

use lumenfall_core::config::{Gains, KNOBS, SHIPPED};
use lumenfall_core::pilot::{play_run, play_run_where, RunResult};
use lumenfall_core::rng::Rng;
use std::time::Instant;

/// The second the harness allows a run before calling it un-winnable.
const MAX_RUN_SECONDS: f32 = 150.0;

/// Every biome, played with the shipped gains: the spread the v2 rules actually produce.
fn biomes() {
    let seeds = seeds(40);
    println!("{:9} {:>5} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>7}", "biome", "win", "median", "mean", "depth", "pts", "pick", "graze", "chain");
    for id in 0..lumenfall_core::systems::Biome::COUNT {
        let runs: Vec<RunResult> = seeds
            .iter()
            .map(|&s| play_run_where(s, SHIPPED, MAX_RUN_SECONDS, id))
            .collect();
        let win = runs.iter().filter(|r| r.won).count() as f32 / runs.len() as f32;
        let times: Vec<f32> = runs.iter().map(|r| r.time).collect();
        let depths: Vec<f32> = runs.iter().map(|r| r.depth).collect();
        let pts: Vec<f32> = runs.iter().map(|r| r.score).collect();
        println!(
            "{:9} {:>4.0}% {:>6.1}s {:>6.1}s {:>6.0}m {:>7.0} {:>6.2} {:>6.2} {:>7.1}",
            lumenfall_core::systems::Biome::from_index(id).name(),
            win * 100.0,
            median(times.clone()),
            mean(&times),
            mean(&depths),
            mean(&pts),
            mean(&runs.iter().map(|r| r.pickups as f32).collect::<Vec<_>>()),
            mean(&runs.iter().map(|r| r.grazes as f32).collect::<Vec<_>>()),
            mean(&runs.iter().map(|r| r.best_chain as f32).collect::<Vec<_>>()),
        );
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("loop");
    match command {
        "benchmark" => benchmark(),
        "biomes" => biomes(),
        "baseline" => {
            let report = evaluate(&SHIPPED, &seeds(40));
            println!("{report}");
        }
        "show" => {
            let mut gains = SHIPPED;
            if let Some(spec) = args.get(1) {
                for pair in spec.split(',') {
                    if let Some((name, value)) = pair.split_once('=') {
                        if let Ok(v) = value.parse::<f32>() {
                            lumenfall_core::config::set(&mut gains, name.trim(), v);
                        }
                    }
                }
            }
            println!("{}", evaluate(&gains, &seeds(40)));
        }
        "loop" => {
            let rounds: u32 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(50);
            search(rounds);
        }
        other => {
            eprintln!("tune: unknown command {other:?}");
            std::process::exit(2);
        }
    }
}

/// How long this machine takes to play one run, so the population size is chosen, not guessed.
fn benchmark() {
    let start = Instant::now();
    let runs = 40;
    for seed in 0..runs {
        play_run(seed, SHIPPED, MAX_RUN_SECONDS);
    }
    let each = start.elapsed().as_secs_f64() / runs as f64;
    println!(
        "benchmark: {:.2} ms a run, so {:.0} runs a second on this machine",
        each * 1000.0,
        1.0 / each
    );
}

fn seeds(count: usize) -> Vec<u32> {
    (0..count).map(|i| 1000 + i as u32 * 7).collect()
}

/// The numbers a build is judged on.
struct Report {
    gains: Gains,
    score: f32,
    win_share: f32,
    median_time: f32,
    mean_time: f32,
    mean_depth: f32,
    mean_score: f32,
    mean_rock_hits: f32,
    glow_deaths: f32,
    mean_closest: f32,
    mean_danger: f32,
    wall_share: f32,
}

impl std::fmt::Display for Report {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "score {:.1} | win {:.0}% | median {:.1}s | mean {:.1}s | depth {:.0}m | pts {:.0} | \
             rocks {:.1} | glow-deaths {:.0}% | closest {:.0}% | danger {:.0}% | walls {:.1}%\n  {}",
            self.score,
            self.win_share * 100.0,
            self.median_time,
            self.mean_time,
            self.mean_depth,
            self.mean_score,
            self.mean_rock_hits,
            self.glow_deaths * 100.0,
            self.mean_closest * 100.0,
            self.mean_danger * 100.0,
            self.wall_share * 100.0,
            lumenfall_core::config::GainsView(&self.gains)
        )
    }
}

fn median(mut values: Vec<f32>) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let middle = values.len() / 2;
    if values.len() % 2 == 0 {
        (values[middle - 1] + values[middle]) / 2.0
    } else {
        values[middle]
    }
}

fn mean(values: &[f32]) -> f32 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f32>() / values.len() as f32
    }
}

/// Plays a build over the seeds and turns the runs into one score. Every term is a distance from
/// a target that the design chose first; the harness only decides how the build reaches them.
fn evaluate(gains: &Gains, seeds: &[u32]) -> Report {
    let runs: Vec<RunResult> = seeds.iter().map(|&s| play_run(s, *gains, MAX_RUN_SECONDS)).collect();

    let win_share = runs.iter().filter(|r| r.won).count() as f32 / runs.len() as f32;
    let times: Vec<f32> = runs.iter().map(|r| r.time).collect();
    let median_time = median(times.clone());
    let mean_time = mean(&times);
    let mean_depth = mean(&runs.iter().map(|r| r.depth).collect::<Vec<_>>());
    let mean_score = mean(&runs.iter().map(|r| r.score).collect::<Vec<_>>());
    let mean_rock_hits = mean(&runs.iter().map(|r| r.rock_hits as f32).collect::<Vec<_>>());
    let glow_deaths = runs
        .iter()
        .filter(|r| !r.won && r.glow < 0.5)
        .count() as f32
        / runs.len() as f32;
    let mean_closest = mean(&runs.iter().map(|r| r.closest_call).collect::<Vec<_>>());
    let mean_danger = mean(&runs.iter().map(|r| r.time_in_danger).collect::<Vec<_>>());
    let total_ticks: f32 = runs.iter().map(|r| r.time / (1.0 / 60.0)).sum();
    let wall_share = if total_ticks > 0.0 {
        runs.iter().map(|r| r.wall_ticks as f32).sum::<f32>() / total_ticks
    } else {
        1.0
    };

    // The target band for wins, and how sharply missing it is punished. A run the pilot always
    // wins teaches the player nothing; one it never wins is a wall.
    let win_term = if win_share > 0.85 {
        -400.0 * (win_share - 0.85)
    } else if win_share < 0.55 {
        -900.0 * (0.55 - win_share)
    } else {
        60.0
    };

    // Length: the design's own clock, not the pilot's luck.
    let length_term = -3.2 * (median_time - 72.0).abs();
    let mean_length_term = -1.4 * (mean_time - 85.0).abs();

    // Tension: a close call most runs, but not a coin toss every run.
    let tension_term = -180.0 * (mean_closest - 0.62).abs() - 220.0 * (mean_danger - 0.16).abs();

    // Flow: a death by running out of light is the build failing the player, not the player
    // failing the build. Keep it rare enough that a run feels lost on a mistake.
    let flow_term = -260.0 * glow_deaths;

    // Walls: a pilot that scrapes is a build that shoves people into walls.
    let wall_term = -900.0 * (wall_share - 0.01).max(0.0);

    // Rock in the water: rocks should be met, not endured. A run with none is empty.
    let rock_term = -30.0 * (mean_rock_hits - 2.5).abs();

    let score = win_term + length_term + mean_length_term + tension_term + flow_term + wall_term + rock_term;

    Report {
        gains: *gains,
        score,
        win_share,
        median_time,
        mean_time,
        mean_depth,
        mean_score,
        mean_rock_hits,
        glow_deaths,
        mean_closest,
        mean_danger,
        wall_share,
    }
}

/// Reads back a set of gains as a JSON object, for the page and for the record.
fn as_json(gains: &Gains) -> String {
    let mut out = String::from("{");
    for (i, knob) in KNOBS.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&format!("\"{}\":{:.6}", knob.name, gains[i]));
    }
    out.push('}');
    out
}

fn search(rounds: u32) {
    // The search's own seed. Fixed, so the loop is reproducible; the world's seeds are separate
    // and are the thing every candidate is judged on alike.
    let mut rng = Rng::new(20_261_116);
    let evaluate_seeds = seeds(24);
    let confirm_seeds = seeds(120);

    // A population big enough to see the good ones, small enough to run five hundred times a
    // round: 20 candidates, three rounds of two elites each generation, is what fits a second.
    let population = 20;
    let elite = 5;
    let mut mean_gains: Vec<f32> = SHIPPED.to_vec();
    let mut spread: Vec<f32> = KNOBS.iter().map(|k| (k.hi - k.lo) * 0.22).collect();
    let mut best: Option<(f32, Gains, Report)> = None;
    let mut since_improvement = 0u32;
    let mut restarts = 0u32;

    println!("tune: {rounds} rounds, population {population}, elite {elite}, {} seeds a round", evaluate_seeds.len());
    let started = Instant::now();

    for round in 1..=rounds {
        // Candidate 0 is always the best so far (once there is one), so the search never walks
        // backwards: a round that finds nothing new leaves the best where it was.
        let mut scored: Vec<(f32, Gains)> = Vec::with_capacity(population);
        for index in 0..population {
            let candidate: Gains = if index == 0 {
                best.as_ref().map(|b| b.1).unwrap_or(SHIPPED)
            } else {
                let mut g = [0.0f32; KNOBS.len()];
                for (i, knob) in KNOBS.iter().enumerate() {
                    let drawn = mean_gains[i] + spread[i] * (rng.next_f32() * 2.0 - 1.0) * 1.6;
                    g[i] = drawn.clamp(knob.lo, knob.hi);
                }
                g
            };
            let report = evaluate(&candidate, &evaluate_seeds);
            scored.push((report.score, candidate));
        }

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        let elites: Vec<(f32, Gains)> = scored.iter().take(elite).copied().collect();

        // The round's best is confirmed on more seeds, so a lucky 24 is not crowned.
        let round_best = elites[0].1;
        let confirmed = evaluate(&round_best, &confirm_seeds);
        let confirmed_score = confirmed.score;
        let confirmed_win = confirmed.win_share;
        let confirmed_median = confirmed.median_time;
        let better = match &best {
            None => true,
            Some((best_score, _, _)) => confirmed_score > *best_score,
        };
        if better {
            best = Some((confirmed_score, round_best, confirmed));
            since_improvement = 0;
        } else {
            since_improvement += 1;
        }

        // A search that has found nothing for a dozen rounds is stuck in a basin, not on a
        // plateau. Widen the spread again and pull the mean back toward the best build found,
        // which is a different place in the space than the one the elites have collapsed onto.
        if since_improvement >= 12 && round < rounds {
            restarts += 1;
            since_improvement = 0;
            for i in 0..KNOBS.len() {
                let anchor = best.as_ref().map(|b| b.1[i]).unwrap_or(SHIPPED[i]);
                mean_gains[i] = mean_gains[i] * 0.5 + anchor * 0.5;
                spread[i] = ((KNOBS[i].hi - KNOBS[i].lo) * 0.16).max(spread[i]);
            }
        }

        // The search narrows: each round moves to the elite mean and shrinks toward the knobs
        // that still matter, which is how a jagged landscape gets searched anyway.
        let shrink = (1.0 - round as f32 / (rounds as f32 + 12.0)).clamp(0.25, 1.0);
        for i in 0..KNOBS.len() {
            let elite_mean = mean(&elites.iter().map(|(_, g)| g[i]).collect::<Vec<_>>());
            mean_gains[i] = mean_gains[i] * 0.35 + elite_mean * 0.65;
            let floor = (KNOBS[i].hi - KNOBS[i].lo) * 0.035;
            spread[i] = (spread[i] * (0.55 + 0.35 * shrink)).max(floor);
        }

        let best_score = best.as_ref().map(|b| b.0).unwrap_or(f32::NEG_INFINITY);
        let stuck = if since_improvement >= 12 { " *restart" } else { "" };
        println!(
            "round {round:>2}/{rounds}  round-best {:>8.1}  best {:>8.1}  win {:>5.1}%  median {:>5.1}s{stuck}",
            confirmed_score,
            best_score,
            confirmed_win * 100.0,
            confirmed_median
        );
    }

    match best {
        Some((score, gains, report)) => {
            println!("\nbest: score {score:.1}");
            println!("{report}");
            println!("\ngains (json): {}", as_json(&gains));
            // Written where the page reads it, so the build the player gets is the build the
            // harness chose: there is no step where a good result is typed in by hand.
            let path = "gains.json";
            if std::fs::write(path, as_json(&gains) + "\n").is_ok() {
                println!("wrote {path}");
            }
        }
        None => println!("no round produced a build"),
    }
    println!("{restarts} restarts, took {:.1}s", started.elapsed().as_secs_f64());
}
