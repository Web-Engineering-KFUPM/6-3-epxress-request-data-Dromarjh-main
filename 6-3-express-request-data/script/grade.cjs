/* eslint-disable no-console */
/**
 * Flexible autograder for 6-3 Express Request Data lab
 * Scoring:
 * - Total 100 = 80 (lab TODOs) + 20 (submission timing)
 * - Each TODO = 16 points: 8 completeness, 4 correctness, 4 quality
 * - Late submission (after 2025-11-12 23:59:59 +03:00 Riyadh) = 10/20; on time = 20/20
 * - If the student implements some tasks (partial progress), floor lab score at 60/80 (but not for zero work)
 * - Checks are intentionally flexible and top-level; no strict code structure requirements
 *
 * Output:
 * - Writes artifacts to dist/grading/
 *   - grade.json (structured scores and feedback)
 *   - grade.txt (human-readable summary)
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// -------------------- Config --------------------
const DUE_STR = "2025-11-12T23:59:59+03:00"; // Riyadh time
const DEADLINE = new Date(DUE_STR).getTime(); // convert to ms
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "dist", "grading");
fs.mkdirSync(OUT_DIR, { recursive: true });

// candidate entry files (flexible)
const ENTRY_CANDIDATES = [
  "app.js",
  "server.js",
  "index.js",
  "main.js",
  "src/app.js",
  "src/server.js",
  "src/index.js",
];

// candidate ports to probe (do not require 3000)
const PORTS = Array.from({ length: 20 }, (_, i) => 3000 + i); // 3000..3019

// request helpers
const FETCH_OPTS = { method: "GET" };
const REQ_TIMEOUT_MS = 4000;
const STARTUP_TIMEOUT_MS = 12000;

function timeout(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function safeFetch(url, opts = {}, timeoutMs = REQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function nowUtcIso() {
  return new Date().toISOString();
}

function isLate() {
  const now = Date.now();
  return now > DEADLINE;
}

// Attempt to start the student app
async function startStudentApp() {
  // Prefer explicit entry file if exists, else npm start
  let entry = ENTRY_CANDIDATES.find((p) => fs.existsSync(path.join(ROOT, p)));
  let child;
  let usedCommand = "";

  if (entry) {
    usedCommand = `node ${entry}`;
    child = spawn(process.execPath, [path.join(ROOT, entry)], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    // try npm start
    usedCommand = "npm start";
    child = spawn(/^win/.test(process.platform) ? "npm.cmd" : "npm", ["start"], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  let stdoutBuf = "";
  let stderrBuf = "";

  child.stdout.on("data", (d) => (stdoutBuf += d.toString()));
  child.stderr.on("data", (d) => (stderrBuf += d.toString()));

  // Try to detect port from logs like "http://localhost:3001" or "listening on 3002"
  let detectedPort = null;
  const portRegexes = [
    /http:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
    /listening(?:\s+on)?\s+port\s+(\d{2,5})/i,
    /PORT(?:=|:)\s*(\d{2,5})/i,
  ];

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS && child.exitCode === null) {
    // try to parse a port from logs
    const logs = stdoutBuf + "\n" + stderrBuf;
    for (const rgx of portRegexes) {
      const m = logs.match(rgx);
      if (m && m[1]) {
        detectedPort = Number(m[1]);
        break;
      }
    }
    if (detectedPort) break;
    await timeout(300);
  }

  return { child, stdoutBuf, stderrBuf, detectedPort, usedCommand };
}

async function probePorts() {
  // If a port is detected from logs, we try that first; else scan defaults
  return PORTS;
}

async function findWorkingBaseUrl(detectedPort = null) {
  const candidates = [];
  if (detectedPort) candidates.push(detectedPort);
  for (const p of PORTS) if (!candidates.includes(p)) candidates.push(p);

  for (const p of candidates) {
    const url = `http://127.0.0.1:${p}/`;
    const res = await safeFetch(url, FETCH_OPTS);
    if (res && (res.ok || res.status === 404)) {
      return `http://127.0.0.1:${p}`;
    }
  }
  return null;
}

// Scoring helpers
function makeTodoScore() {
  return { completeness: 0, correctness: 0, quality: 0, notes: [] };
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function pointsFrom(score) {
  return clamp(score.completeness, 0, 8)
    + clamp(score.correctness, 0, 4)
    + clamp(score.quality, 0, 4);
}

// ----------- Endpoint checks (flexible) -----------
async function checkTodo1(base) {
  const s = makeTodoScore();
  // Completeness: server responds to GET /
  const res = await safeFetch(`${base}/`, FETCH_OPTS);
  if (res) {
    s.completeness = 8; // server is up
    s.notes.push("Server responded on root path.");
    // Correctness: status 200 is a good sign
    if (res.status === 200) {
      s.correctness = 4;
      s.notes.push("Root returned 200 OK.");
    } else {
      s.notes.push(`Root returned status ${res.status}.`);
    }
    // Quality: JSON response (optional, lenient)
    try {
      await res.clone().json();
      s.quality = 4;
      s.notes.push("Root returned JSON.");
    } catch {
      s.notes.push("Root not JSON (quality points not granted).");
    }
  } else {
    s.notes.push("No response from root path.");
  }
  return s;
}

async function checkTodo2(base) {
  const s = makeTodoScore();
  // Good request
  const good = await safeFetch(`${base}/echo?name=Ali&age=22`, FETCH_OPTS);
  if (good) {
    s.completeness += 4; // route exists
    try {
      const j = await good.clone().json();
      if (good.status === 200) s.correctness += 2;
      if (j && j.ok === true && "name" in j && "age" in j && typeof j.msg === "string") {
        s.quality += 2;
        s.notes.push("Echo success: ok/name/age/msg present.");
      } else {
        s.notes.push("Echo success JSON shape is different (still acceptable).");
      }
    } catch {
      s.notes.push("Echo success did not return JSON.");
    }
  } else {
    s.notes.push("GET /echo not reachable.");
  }

  // Missing param case
  const bad = await safeFetch(`${base}/echo?name=Ali`, FETCH_OPTS);
  if (bad) {
    s.completeness += 4; // validation path exists
    try {
      const j = await bad.clone().json();
      if (bad.status === 400) s.correctness += 2;
      if (j && j.ok === false && typeof j.error === "string") {
        s.quality += 2;
        s.notes.push("Echo error: ok:false and error message present.");
      } else {
        s.notes.push("Echo error JSON shape is different (still acceptable).");
      }
    } catch {
      s.notes.push("Echo error did not return JSON.");
    }
  } else {
    s.notes.push("GET /echo missing-param case not reachable.");
  }

  // cap by max per band
  s.completeness = Math.min(s.completeness, 8);
  s.correctness = Math.min(s.correctness, 4);
  s.quality = Math.min(s.quality, 4);
  return s;
}

async function checkTodo3(base) {
  const s = makeTodoScore();
  const res = await safeFetch(`${base}/profile/Jack/Black`, FETCH_OPTS);
  if (res) {
    s.completeness = 8; // route exists
    try {
      const j = await res.clone().json();
      if (res.status === 200) s.correctness = 4;
      if (j && j.ok === true && typeof j.fullName === "string") {
        s.quality = 4; // quality points for structured JSON
        s.notes.push(`Profile returned fullName: ${j.fullName}`);
      } else {
        s.notes.push("Profile JSON shape is different (still acceptable).");
      }
    } catch {
      s.notes.push("Profile did not return JSON.");
    }
  } else {
    s.notes.push("GET /profile/:first/:last not reachable.");
  }
  return s;
}

async function checkTodo4and5(base) {
  // We infer app.param validator behavior via /users/:userId responses
  const s4 = makeTodoScore(); // param middleware
  const s5 = makeTodoScore(); // users route

  // Valid id
  const ok = await safeFetch(`${base}/users/42`, FETCH_OPTS);
  if (ok) {
    s5.completeness += 8; // route exists
    try {
      const j = await ok.clone().json();
      if (ok.status === 200) s5.correctness += 4;
      if (j && j.ok === true && ("userId" in j)) {
        s5.quality += 4;
        s5.notes.push("Users success: ok:true and userId present.");
      } else {
        s5.notes.push("Users success JSON shape is different (still acceptable).");
      }
    } catch {
      s5.notes.push("Users success did not return JSON.");
    }
  } else {
    s5.notes.push("GET /users/:userId not reachable.");
  }

  // Invalid id (string)
  const bad1 = await safeFetch(`${base}/users/abc`, FETCH_OPTS);
  if (bad1) {
    s4.completeness += 4; // validator exists
    try {
      const j = await bad1.clone().json();
      if (bad1.status === 400) s4.correctness += 2;
      if (j && j.ok === false && typeof j.error === "string") {
        s4.quality += 2;
        s4.notes.push("Validator rejected non-numeric userId with 400.");
      } else {
        s4.notes.push("Validator error JSON shape is different (still acceptable).");
      }
    } catch {
      s4.notes.push("Validator (abc) did not return JSON.");
    }
  } else {
    s4.notes.push("GET /users/abc not reachable (validator not observed).");
  }

  // Invalid id (negative)
  const bad2 = await safeFetch(`${base}/users/-5`, FETCH_OPTS);
  if (bad2) {
    s4.completeness += 4; // validator handling of sign
    try {
      const j = await bad2.clone().json();
      if (bad2.status === 400) s4.correctness += 2;
      if (j && j.ok === false && typeof j.error === "string") {
        s4.quality += 2;
        s4.notes.push("Validator rejected negative userId with 400.");
      } else {
        s4.notes.push("Validator error JSON shape (negative) is different (still acceptable).");
      }
    } catch {
      s4.notes.push("Validator (negative) did not return JSON.");
    }
  } else {
    s4.notes.push("GET /users/-5 not reachable (validator not observed).");
  }

  // cap bands
  s4.completeness = Math.min(s4.completeness, 8);
  s4.correctness = Math.min(s4.correctness, 4);
  s4.quality = Math.min(s4.quality, 4);

  s5.completeness = Math.min(s5.completeness, 8);
  s5.correctness = Math.min(s5.correctness, 4);
  s5.quality = Math.min(s5.quality, 4);

  return { s4, s5 };
}

// -------------------- Main --------------------
(async () => {
  const startInfo = await startStudentApp();
  console.log(`Attempted to start: ${startInfo.usedCommand}`);

  const baseUrl = await findWorkingBaseUrl(startInfo.detectedPort);
  if (!baseUrl) {
    console.error("Could not detect a running server on localhost common ports.");
  } else {
    console.log(`Detected base URL: ${baseUrl}`);
  }

  const feedback = [];
  let totalLabPoints = 0;

  let todo1 = makeTodoScore();
  let todo2 = makeTodoScore();
  let todo3 = makeTodoScore();
  let todo4 = makeTodoScore();
  let todo5 = makeTodoScore();

  if (baseUrl) {
    todo1 = await checkTodo1(baseUrl);
    todo2 = await checkTodo2(baseUrl);
    todo3 = await checkTodo3(baseUrl);
    const { s4, s5 } = await checkTodo4and5(baseUrl);
    todo4 = s4;
    todo5 = s5;
  } else {
    // No server: leave everything at zero but with notes
    todo1.notes.push("Server not reachable; cannot run endpoint checks.");
    todo2.notes.push("Server not reachable.");
    todo3.notes.push("Server not reachable.");
    todo4.notes.push("Server not reachable.");
    todo5.notes.push("Server not reachable.");
  }

  const p1 = pointsFrom(todo1);
  const p2 = pointsFrom(todo2);
  const p3 = pointsFrom(todo3);
  const p4 = pointsFrom(todo4);
  const p5 = pointsFrom(todo5);

  totalLabPoints = p1 + p2 + p3 + p4 + p5;

  // If there is some progress but < 60/80, floor to 60
  const someProgress = [p1, p2, p3, p4, p5].some((x) => x > 0);
  if (someProgress && totalLabPoints < 60) {
    totalLabPoints = 60;
  }

  // Submission timing points
  const submissionPoints = isLate() ? 10 : 20;

  const totalPoints = totalLabPoints + submissionPoints;

  // Build human-readable feedback per TODO
  function summarizeTodo(name, s, pts) {
    const missed = [];
    if (s.completeness < 8) missed.push("completeness");
    if (s.correctness < 4) missed.push("correctness");
    if (s.quality < 4) missed.push("quality");
    return {
      name,
      points: pts,
      breakdown: { completeness: s.completeness, correctness: s.correctness, quality: s.quality },
      implemented: s.notes.filter((n) => n.toLowerCase().includes("returned") || n.toLowerCase().includes("respond")),
      missed: missed.length ? missed : ["None"],
      notes: s.notes,
    };
  }

  const report = {
    meta: {
      graded_at_utc: nowUtcIso(),
      deadline_local: DUE_STR,
      is_late: isLate(),
      base_url: baseUrl || null,
      command_used: startInfo.usedCommand,
    },
    scoring: {
      todo_points: {
        TODO_1: p1,
        TODO_2: p2,
        TODO_3: p3,
        TODO_4: p4,
        TODO_5: p5,
      },
      lab_points: totalLabPoints,
      submission_points: submissionPoints,
      total_points: totalPoints,
      rubric: "Each TODO = 16 (8 completeness, 4 correctness, 4 quality). Lab total 80 + submission 20.",
    },
    feedback: [
      summarizeTodo("TODO-1 (Server Setup)", todo1, p1),
      summarizeTodo("TODO-2 (/echo route)", todo2, p2),
      summarizeTodo("TODO-3 (/profile route)", todo3, p3),
      summarizeTodo("TODO-4 (param middleware)", todo4, p4),
      summarizeTodo("TODO-5 (/users/:userId)", todo5, p5),
    ],
  };

  // Write artifacts
  const jsonPath = path.join(OUT_DIR, "grade.json");
  const txtPath = path.join(OUT_DIR, "grade.txt");

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  const lines = [];
  lines.push("==== 6-3 Express Request Data — Grade Summary ====");
  lines.push(`Graded at (UTC): ${report.meta.graded_at_utc}`);
  lines.push(`Deadline (Riyadh): ${report.meta.deadline_local}`);
  lines.push(`Late submission? ${report.meta.is_late ? "Yes (10/20)" : "No (20/20)"}`);
  lines.push(`Detected base URL: ${report.meta.base_url || "N/A"}`);
  lines.push("");
  lines.push("Per-TODO Points:");
  for (const [k, v] of Object.entries(report.scoring.todo_points)) {
    lines.push(`- ${k}: ${v}/16`);
  }
  lines.push("");
  lines.push(`Lab Points: ${report.scoring.lab_points}/80`);
  lines.push(`Submission Points: ${report.scoring.submission_points}/20`);
  lines.push(`TOTAL: ${report.scoring.total_points}/100`);
  lines.push("");
  lines.push("Feedback Summary (what was implemented / missed):");
  for (const item of report.feedback) {
    lines.push(`\n## ${item.name} — ${item.points}/16`);
    lines.push(`Breakdown: completeness=${item.breakdown.completeness}, correctness=${item.breakdown.correctness}, quality=${item.breakdown.quality}`);
    lines.push("- Implemented:");
    if (item.implemented.length) {
      for (const note of item.implemented) lines.push(`  • ${note}`);
    } else {
      lines.push("  • (no implemented notes captured)");
    }
    lines.push("- Missed:");
    for (const m of item.missed) lines.push(`  • ${m}`);
  }

  fs.writeFileSync(txtPath, lines.join("\n"), "utf-8");

  // Print short summary to Actions logs
  console.log(lines.join("\n"));

  // Ensure process ends; kill child if still running
  try {
    if (startInfo.child && startInfo.child.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(startInfo.child.pid), "/f", "/t"]);
      } else {
        process.kill(-startInfo.child.pid, "SIGKILL");
        process.kill(startInfo.child.pid, "SIGKILL");
      }
    }
  } catch (e) {
    // ignore
  }
})().catch((e) => {
  console.error("Grader crashed:", e);
  process.exitCode = 1;
});
