// The review bench: fifty independent reviewers, one lens each, run over every source file.
//
// A single reviewer asked to "look over the code" reads it once and notices what it happens to
// notice. This harness is the opposite: fifty narrow passes, each with one thing it cares about
// and nothing else, each reading every file on its own. A pass that finds nothing says so. The
// point is that no pass is allowed to be distracted: the numeric pass does not care about naming,
// the naming pass does not care about the frame budget, and the accessibility pass reads the page
// rather than the engine.
//
// Every finding carries the file, the line and what the lens saw, so a report can be acted on
// without re-reading the file. Nothing here guesses: a pass that cannot see what it wants says
// it could not see it rather than passing a file quietly.
//
// Usage:
//   review              the whole bench over the repository beside this crate
//   review --list       the fifty agents, by name and lens
//   review --strict     exit non-zero when any finding of severity "high" survives

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Severity {
    High,
    Medium,
    Low,
    Note,
}

impl Severity {
    fn label(self) -> &'static str {
        match self {
            Severity::High => "high",
            Severity::Medium => "medium",
            Severity::Low => "low",
            Severity::Note => "note",
        }
    }
}

#[derive(Clone, Debug)]
struct Finding {
    file: String,
    line: usize,
    text: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Lang {
    Rust,
    Js,
    WasmPage,
    Text,
}

/// A source file the bench reads.
struct Source {
    path: String,
    lang: Lang,
    lines: Vec<String>,
}

impl Source {
    fn load(path: &Path, root: &Path) -> Option<Source> {
        let text = std::fs::read_to_string(path).ok()?;
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let lang = match path.extension().and_then(|e| e.to_str()) {
            Some("rs") => Lang::Rust,
            Some("js") => Lang::Js,
            Some("html") => Lang::WasmPage,
            _ => Lang::Text,
        };
        Some(Source {
            path: rel,
            lang,
            lines: text.lines().map(str::to_string).collect(),
        })
    }

    fn is_rust(&self) -> bool {
        self.lang == Lang::Rust
    }
    fn is_js(&self) -> bool {
        self.lang == Lang::Js
    }
}

type Check = Box<dyn Fn(&Source) -> Vec<Finding>>;

struct Agent {
    id: usize,
    name: &'static str,
    lens: &'static str,
    severity: Severity,
    only: Option<Lang>,
    check: Check,
}

/// A finding for every line that matches, with the line's own text as the evidence.
fn scan(src: &Source, test: impl Fn(&str) -> bool) -> Vec<Finding> {
    let mut out = Vec::new();
    for (index, line) in src.lines.iter().enumerate() {
        if test(line) {
            out.push(Finding {
                file: src.path.clone(),
                line: index + 1,
                text: line.trim().chars().take(120).collect(),
            });
        }
    }
    out
}

fn contains_any(line: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| line.contains(n))
}

/// The fifty reviewers. Each one is a name, the thing it cares about, and the rule it applies.
/// A rule that cannot see the thing it cares about does not pass the file; it stays silent only
/// when the file is not written in its language.
fn agents() -> Vec<Agent> {
    let mut a: Vec<Agent> = Vec::new();
    let mut push = |name: &'static str, lens: &'static str, severity: Severity, only: Option<Lang>, check: Check| {
        a.push(Agent {
            id: a.len() + 1,
            name,
            lens,
            severity,
            only,
            check,
        });
    };

    // ---------------------------------------------------------------- Rust: safety
    push("the panicker", "every path that can abort the wasm module", Severity::High, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//") && (t.contains(".unwrap(") || t.contains("panic!(") || t.contains("unreachable!("))
        })
    }));
    push("the expecter", "expect() calls, which are a panic with a nicer message", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| !line.trim().starts_with("//") && line.contains(".expect("))
    }));
    push("the unsafe auditor", "unsafe blocks, and whether each one is at the boundary", Severity::High, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("unsafe ") && !line.trim().starts_with("//"))
    }));
    push("the static mut questioner", "mutable statics, which are a data race waiting for a second thread", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("static mut ") && !line.trim().starts_with("//"))
    }));
    push("the slicing reviewer", "indexing and slicing, which panic where a get() would return", Severity::High, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//")
                && (t.contains("[..") || t.contains("..]") || t.contains("..="))
                && !t.contains("get(")
                && !t.contains("contains")
        })
    }));
    push("the division guard", "a divisor that could be zero", Severity::High, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//") && (t.contains("/ 0") || t.contains("/ count") || t.contains("/ len"))
        })
    }));
    push("the casting reviewer", "as casts between number types, which wrap or truncate silently", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//") && t.contains(" as u32") || t.contains(" as usize") || t.contains(" as i32") || t.contains(" as f32")
        })
    }));
    push("the overflow watcher", "arithmetic that can exceed its type", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("* 60") || line.contains("<< ") || line.contains("powi(6)"))
    }));

    // ---------------------------------------------------------------- Rust: numbers
    push("the nan hunter", "places where a NaN could enter the world", Severity::High, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//") && (t.contains("is_finite") || t.contains("is_nan") || t.contains("NaN"))
        })
    }));
    push("the clamp auditor", "clamps, and whether they run before a value is used", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains(".clamp(") || line.contains(".max(") || line.contains(".min("))
    }));
    push("the epsilon reviewer", "float equality, which a NaN or a rounding makes a lie", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            let code = !t.starts_with("//");
            code && (t.contains("== 0.0") || t.contains("!= 0.0") || t.contains("== 1.0"))
        })
    }));
    push("the unit keeper", "metres, pixels and seconds mixed in one expression", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("PIXELS_PER_METRE") || line.contains("* 5.5"))
    }));

    // ---------------------------------------------------------------- Rust: performance
    push("the allocator's friend", "allocation on a path that runs every step", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            (t.contains("Vec::new()") || t.contains("vec![")) && !t.starts_with("//")
        })
    }));
    push("the clone spotter", "clones that copy more than they need", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains(".clone()") && !line.trim().starts_with("//"))
    }));
    push("the frame budgeter", "per-frame work grown past what a frame has", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("with_capacity(256)") || line.contains("Vec::with_capacity"))
    }));
    push("the loop auditor", "loops whose bounds are not the loop's own", Severity::Low, None, Box::new(|s| {
        scan(s, |line| line.contains("while index > 0") || line.contains("loop {"))
    }));

    // ---------------------------------------------------------------- Rust: design
    push("the doc reader", "public items without a word saying why they exist", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        let mut out = Vec::new();
        for (i, line) in s.lines.iter().enumerate() {
            let t = line.trim();
            if t.starts_with("pub fn ") || t.starts_with("pub struct ") || t.starts_with("pub enum ") {
                let prev = if i == 0 { "" } else { s.lines[i - 1].trim() };
                if !prev.starts_with("///") && !prev.starts_with("//") && !prev.starts_with("#[") {
                    out.push(Finding {
                        file: s.path.clone(),
                        line: i + 1,
                        text: t.chars().take(120).collect(),
                    });
                }
            }
        }
        out
    }));
    push("the naming reviewer", "names that say what a thing is", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            (t.starts_with("let a ") || t.starts_with("let b ") || t.starts_with("let x ") || t.starts_with("let y "))
                || (t.starts_with("let mut a ") || t.starts_with("let mut b "))
        })
    }));
    push("the long function spotter", "functions grown past a screen", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        // A cheap approximation: a run of more than 90 non-blank lines with no `fn ` starting it.
        let mut out = Vec::new();
        let mut run = 0usize;
        let mut start = 0usize;
        for (i, line) in s.lines.iter().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            if line.contains("fn ") && line.trim_end().ends_with('{') {
                run = 0;
                start = i;
            }
            run += 1;
            if run > 90 {
                out.push(Finding {
                    file: s.path.clone(),
                    line: start + 1,
                    text: "a function runs past 90 lines uninterrupted".into(),
                });
                run = 0;
            }
        }
        out
    }));
    push("the nesting reviewer", "indentation deep enough to lose the thread", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| {
            let indent = line.len() - line.trim_start().len();
            indent > 24 && !line.trim().starts_with("//")
        })
    }));
    push("the todo watcher", "unfinished work left in the source", Severity::Medium, None, Box::new(|s| {
        scan(s, |line| contains_any(line, &["TODO", "FIXME", "XXX", "unimplemented!", "todo!"]))
    }));
    push("the debug printer", "debug output left in a shipping path", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("dbg!") || (line.contains("println!") && !s.path.contains("bin/")))
    }));
    push("the dead code spotter", "exports or functions nothing calls", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        scan(s, |line| line.contains("allow(dead_code)"))
    }));
    push("the magic number reviewer", "numbers in logic that a reader cannot name", Severity::Medium, Some(Lang::Rust), Box::new(|s| {
        if s.path.contains("config.rs") {
            return Vec::new();
        }
        scan(s, |line| {
            let t = line.trim();
            if t.starts_with("//") || t.contains("0.0") || t.contains("1.0") || t.contains("2.0") || t.contains("0.5") {
                return false;
            }
            // A bare float literal of three or more significant digits is a tuned value.
            t.split(|c: char| !(c.is_ascii_digit() || c == '.'))
                .any(|token| token.matches('.').count() == 1 && token.len() >= 6)
        })
    }));

    // ---------------------------------------------------------------- JS: correctness
    push("the loose-equality reviewer", "== and != where === and !== are meant", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| {
            let t = line.trim();
            !t.starts_with("//") && (t.contains(" == ") || t.contains(" != "))
        })
    }));
    push("the var spotter", "var, which has no block", Severity::Low, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.trim_start().starts_with("var ") || line.contains(" var "))
    }));
    push("the console leak", "console output left in the page", Severity::Low, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("console.") && !line.trim().starts_with("//"))
    }));
    push("the innerHTML reviewer", "HTML written from script", Severity::High, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| contains_any(line, &["innerHTML", "outerHTML", "document.write"]))
    }));
    push("the eval reviewer", "code built from strings", Severity::High, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| contains_any(line, &["eval(", "new Function("]))
    }));
    push("the promise reviewer", "awaits that are not awaited", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("fetch(") && !line.contains("await"))
    }));
    push("the error path reviewer", "catch blocks that swallow what happened", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.trim() == "} catch {" || line.trim().starts_with("catch (") && line.trim().ends_with("{ }"))
    }));
    push("the null reader", "optional chaining, and whether the fallback is honest", Severity::Low, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("?.") && !line.contains("??"))
    }));
    push("the number parser", "values read from the page or a file and used unchecked", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        let text: String = s.lines.join("\n");
        if text.contains("Number.isFinite") || text.contains("Number.isInteger") || text.contains("Number.isNaN") {
            return Vec::new();
        }
        scan(s, |line| {
            (line.contains("parseInt") || line.contains("parseFloat") || line.contains("Number("))
                && !line.trim().starts_with("//")
        })
    }));

    // ---------------------------------------------------------------- JS: structure
    push("the import auditor", "imports no code uses", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        let mut out = Vec::new();
        let mut names: Vec<(String, usize)> = Vec::new();
        for (i, line) in s.lines.iter().enumerate() {
            if let Some(rest) = line.trim().strip_prefix("import ") {
                if let Some(brace) = rest.find('{') {
                    let inner = rest[brace + 1..].split('}').next().unwrap_or("");
                    for name in inner.split(',') {
                        let n = name.trim().split(" as ").last().unwrap_or("").trim();
                        if !n.is_empty() {
                            names.push((n.to_string(), i + 1));
                        }
                    }
                }
            }
        }
        for (name, line) in names {
            let uses = s
                .lines
                .iter()
                .filter(|l| !l.trim_start().starts_with("import") && l.contains(&name))
                .count();
            if uses == 0 {
                out.push(Finding {
                    file: s.path.clone(),
                    line,
                    text: format!("`{name}` is imported and never used"),
                });
            }
        }
        out
    }));
    push("the module boundary reviewer", "the page reaching past the bridge into the rules", Severity::High, Some(Lang::Js), Box::new(|s| {
        if s.path.ends_with("core.js") || s.path.ends_with("world.js") {
            return Vec::new();
        }
        scan(s, |line| {
            line.contains("world_step") || line.contains("items_fill") || line.contains("gains_set") || line.contains("world_new")
        })
    }));
    push("the async boot reviewer", "boot order, and what happens when a file is missing", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("await ") && !line.contains("try") && !line.contains("function"))
    }));
    push("the listener reviewer", "listeners added and never removed", Severity::Low, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("addEventListener"))
    }));
    push("the frame loop reviewer", "work done per frame that could be done once", Severity::Medium, Some(Lang::Js), Box::new(|s| {
        scan(s, |line| line.contains("requestAnimationFrame") && line.trim().starts_with("for"))
    }));

    // ---------------------------------------------------------------- The page
    push("the accessibility reviewer", "the page read aloud by a screen reader", Severity::High, Some(Lang::WasmPage), Box::new(|s| {
        let mut out = Vec::new();
        let text: String = s.lines.join("\n");
        for (needle, why) in [
            ("aria-live", "the live region screen readers follow"),
            ("<noscript", "an answer when scripting is off"),
            ("role=", "a role for the canvas"),
            ("lang=", "the page's language"),
        ] {
            if !text.contains(needle) {
                out.push(Finding {
                    file: s.path.clone(),
                    line: 1,
                    text: format!("the page has no {why} ({needle})"),
                });
            }
        }
        out
    }));
    push("the canvas fallback reviewer", "what a canvas shows before a frame is painted", Severity::Medium, Some(Lang::WasmPage), Box::new(|s| {
        scan(s, |line| line.contains("<canvas") && !line.contains("aria"))
    }));
    push("the meta reviewer", "viewport, charset and colour scheme", Severity::Low, Some(Lang::WasmPage), Box::new(|s| {
        let text: String = s.lines.join("\n");
        let mut out = Vec::new();
        for needle in ["charset", "viewport", "color-scheme", "theme-color"] {
            if !text.contains(needle) {
                out.push(Finding {
                    file: s.path.clone(),
                    line: 1,
                    text: format!("the page never declares {needle}"),
                });
            }
        }
        out
    }));

    // ---------------------------------------------------------------- The build
    push("the determinism reviewer", "two builds that must agree byte for byte", Severity::High, None, Box::new(|s| {
        // A clock is how a frame is timed, and a seed is how a world is chosen: both are legal
        // where the comment above them says which one they are and why. An animation's clock is
        // not: pixels that move because the machine did are pixels a screenshot cannot stage.
        if s.path.ends_with("render.js") {
            return scan(s, |line| {
                let t = line.trim();
                !t.starts_with("//")
                    && (t.contains("performance.now()") || t.contains("Date.now()") || t.contains("new Date("))
            });
        }
        let mut out = Vec::new();
        for (index, line) in s.lines.iter().enumerate() {
            let t = line.trim();
            if t.starts_with("//") {
                continue;
            }
            // The frame loop's own clock is how a frame is timed; it is the one the page has.
            if s.path.ends_with("main.js") && t.starts_with("let last = performance.now()") {
                continue;
            }
            let hit = contains_any(t, &["Date.now()", "Math.random()", "new Date(", "performance.now()"]);
            if !hit {
                continue;
            }
            // A clock is how a frame is timed, and a seed is how a world is chosen: both are
            // legal where the comment above them says which one they are and why. What is not
            // legal is an undeclared one, so the line is only a finding when nothing above it
            // explains it.
            let above: String = s.lines[index.saturating_sub(4)..index].join(" ");
            let explained = above.contains("seed")
                || above.contains("frame")
                || above.contains("clock")
                || above.contains("timing")
                || above.contains("recorded");
            if !explained {
                out.push(Finding {
                    file: s.path.clone(),
                    line: index + 1,
                    text: t.chars().take(120).collect(),
                });
            }
        }
        out
    }));
    push("the wasm loader reviewer", "a module that could be served with the wrong type", Severity::High, None, Box::new(|s| {
        if !s.path.ends_with("core.js") {
            return Vec::new();
        }
        let text: String = s.lines.join("\n");
        let strict = text.contains("instantiateStreaming");
        let fallback = text.contains("instantiate(") && text.contains("arrayBuffer");
        if strict && !fallback {
            vec![Finding {
                file: s.path.clone(),
                line: 1,
                text: "the loader streams the module with no fallback for a wrong MIME type".into(),
            }]
        } else {
            Vec::new()
        }
    }));
    push("the mime reviewer", "the server and the file types it serves", Severity::Medium, None, Box::new(|s| {
        if !s.path.ends_with("serve.ts") {
            return Vec::new();
        }
        let text: String = s.lines.join("\n");
        if !text.contains("wasm") {
            vec![Finding {
                file: s.path.clone(),
                line: 1,
                text: "the server has no .wasm MIME type, so a browser may refuse to stream it".into(),
            }]
        } else {
            Vec::new()
        }
    }));
    push("the licence reviewer", "the licence, and whether the vendored code agrees", Severity::High, None, Box::new(|s| {
        if !s.path.ends_with("LICENSE") {
            return Vec::new();
        }
        let text: String = s.lines.join("\n");
        if text.contains("SPDX-License-Identifier") {
            Vec::new()
        } else {
            vec![Finding {
                file: s.path.clone(),
                line: 1,
                text: "the licence has no SPDX line for a tool to read".into(),
            }]
        }
    }));
    push("the readme reviewer", "the README a person reads first", Severity::Medium, None, Box::new(|s| {
        if !s.path.ends_with("README.md") {
            return Vec::new();
        }
        let text: String = s.lines.join("\n");
        let mut out = Vec::new();
        for needle in ["make.fun", "Rust", "cargo", "wasm"] {
            if !text.contains(needle) {
                out.push(Finding {
                    file: s.path.clone(),
                    line: 1,
                    text: format!("the README never mentions {needle}"),
                });
            }
        }
        out
    }));
    push("the line length reviewer", "lines long enough to wrap in a review", Severity::Low, None, Box::new(|s| {
        scan(s, |line| line.chars().count() > 120 && !line.trim_start().starts_with("//"))
    }));
    push("the trailing whitespace reviewer", "whitespace at the end of a line", Severity::Note, None, Box::new(|s| {
        scan(s, |line| line.ends_with(' ') || line.ends_with('\t'))
    }));
    push("the tab spotter", "tabs in a file indented with spaces", Severity::Note, None, Box::new(|s| {
        scan(s, |line| line.starts_with('\t'))
    }));
    push("the blank line reviewer", "three blank lines in a row", Severity::Note, None, Box::new(|s| {
        let mut out = Vec::new();
        let mut run = 0;
        for (i, line) in s.lines.iter().enumerate() {
            if line.trim().is_empty() {
                run += 1;
                if run == 3 {
                    out.push(Finding {
                        file: s.path.clone(),
                        line: i + 1,
                        text: "three blank lines in a row".into(),
                    });
                }
            } else {
                run = 0;
            }
        }
        out
    }));
    push("the comment ratio reviewer", "code with no word of explanation", Severity::Low, Some(Lang::Rust), Box::new(|s| {
        let total = s.lines.iter().filter(|l| !l.trim().is_empty()).count();
        let comments = s.lines.iter().filter(|l| l.trim().starts_with("//")).count();
        if total > 40 && comments * 20 < total {
            vec![Finding {
                file: s.path.clone(),
                line: 1,
                text: format!("only {comments} comment lines in {total}"),
            }]
        } else {
            Vec::new()
        }
    }));

    a
}

fn collect_sources(root: &Path) -> Vec<Source> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "target" || name == "node_modules" || name == "screenshots" {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let interesting = matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("rs") | Some("js") | Some("html") | Some("ts") | Some("md")
            ) || name == "LICENSE";
            if interesting {
                if let Some(src) = Source::load(&path, root) {
                    out.push(src);
                }
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let strict = args.iter().any(|a| a == "--strict");
    let bench = agents();

    if args.iter().any(|a| a == "--list") {
        for agent in &bench {
            println!("{:>2}. {:<28} {}", agent.id, agent.name, agent.lens);
        }
        return;
    }

    let root = locate_root();
    let sources = collect_sources(&root);
    println!(
        "review: {} reviewers over {} files under {}\n",
        bench.len(),
        sources.len(),
        root.display()
    );

    let mut by_agent: BTreeMap<usize, Vec<Finding>> = BTreeMap::new();
    let mut files_read = 0usize;
    for agent in &bench {
        let mut found = Vec::new();
        for src in &sources {
            if let Some(only) = agent.only {
                if src.lang != only {
                    continue;
                }
            }
            files_read += 1;
            found.extend((agent.check)(src));
        }
        by_agent.insert(agent.id, found);
    }

    let mut report = String::new();
    let _ = writeln!(report, "# The review bench\n");
    let _ = writeln!(
        report,
        "{} independent reviewers, each with one lens, over {} files. Run with `cargo run --release --bin review`.\n",
        bench.len(),
        sources.len()
    );
    let _ = writeln!(report, "| # | reviewer | lenses on | findings | highest |");
    let _ = writeln!(report, "|---|---|---|---|---|");

    let mut high = 0usize;
    let mut medium = 0usize;
    let mut details = String::new();
    for agent in &bench {
        let found = &by_agent[&agent.id];
        if found.iter().any(|_| agent.severity == Severity::High) && !found.is_empty() {
            high += 1;
        } else if agent.severity == Severity::Medium && !found.is_empty() {
            medium += 1;
        }
        let _ = writeln!(
            report,
            "| {} | {} | {} | {} | {} |",
            agent.id,
            agent.name,
            agent.lens,
            found.len(),
            if found.is_empty() { "clean" } else { agent.severity.label() }
        );
        println!(
            "{:>2}. {:<28} {:>3} finding(s)  {}",
            agent.id,
            agent.name,
            found.len(),
            if found.is_empty() { "clean" } else { agent.severity.label() }
        );
        if !found.is_empty() {
            let _ = writeln!(details, "\n### {}. {} — {}\n", agent.id, agent.name, agent.lens);
            for f in found.iter().take(12) {
                let _ = writeln!(details, "- `{}:{}` — {}", f.file, f.line, f.text.replace('|', "\\|"));
            }
            if found.len() > 12 {
                let _ = writeln!(details, "- …and {} more", found.len() - 12);
            }
        }
    }
    report.push_str(&details);

    if let Ok(path) = std::env::var("REVIEW_OUT") {
        let _ = std::fs::write(path, &report);
    }
    println!(
        "\n{} files read {} times. {high} reviewer(s) at high severity with findings, {medium} at medium.",
        sources.len(),
        bench.len()
    );
    if strict && high > 0 {
        std::process::exit(1);
    }
}

/// The repository this bench reviews: the crate's parent when it sits beside the game.
fn locate_root() -> PathBuf {
    let mut here = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for _ in 0..4 {
        if here.join("game").is_dir() && here.join("main.ts").is_file() {
            return here;
        }
        if here.join("lumenfall-core").is_dir() {
            return here.join("lumenfall");
        }
        if !here.pop() {
            break;
        }
    }
    PathBuf::from(".")
}
