/* eslint-disable no-console */
/**
 * Resilient autograder for 6-3 Express Request Data
 * - Total 100 = 80 (lab TODOs) + 20 (submission timing)
 * - Each TODO = 16 (8 completeness, 4 correctness, 4 quality)
 * - On-time = 20/20, Late (after Riyadh 2025-11-12 23:59:59 +03:00) = 10/20
 * - If some progress but lab_points < 60, floor to 60/80
 * - Flexible, top-level checks only; no strict code structure
 *
 * Artifacts:
 *   dist/grading/grade.json
 *   dist/grading/grade.txt
 *
 * Also writes the pretty summary to GitHub Actions job summary.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DUE_STR = "2025-11-12T23:59:59+03:00";
const DEADLINE = new Date(DUE_STR).getTime();

const REQ_TIMEOUT_MS = 3500;
const STARTUP_TIMEOUT_MS = 12000;
const SCAN_PORTS = Array.from({ length: 24 }, (_, i) => 3000 + i); // 3000..3023

// --------------------- helpers ---------------------
function nowUtcIso() { return new Date().toISOString(); }
function isLate() { return Date.now() > DEADLINE; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeFetch(url, opts = {}, to = REQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), to);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function ensureOutDir(root) {
  const out = path.join(root, "dist", "grading");
  fs.mkdirSync(out, { recursive: true });
  return out;
}

function makeTodoScore() {
  return { completeness: 0, correctness: 0, quality: 0, notes: [] };
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function bandPoints(s) {
  return clamp(s.completeness, 0, 8) + clamp(s.correctness, 0, 4) + clamp(s.quality, 0, 4);
}

function pushOK(arr, msg) { arr.push(`✅ ${msg}`); }
function pushWARN(arr, msg) { arr.push(`⚠️ ${msg}`); }
function pushX(arr, msg) { arr.push(`❌ ${msg}`); }

// --------------------- detect lab dir ---------------------
const REPO_ROOT = process.cwd();
let LAB_DIR = REPO_ROOT;

// If server.js not in root, try known subfolder
const ROOT_HAS_SERVER = fs.existsSync(path.join(REPO_ROOT, "server.js"));
const SUB_LAB = path.join(REPO_ROOT, "6-3-express-request-data");
const SUB_HAS_SERVER = fs.existsSync(path.join(SUB_LAB, "server.js"));
if (!ROOT_HAS_SERVER && SUB_HAS_SERVER) {
  LAB_DIR = SUB_LAB;
  process.chdir(LAB_DIR);
} else if (ROOT_HAS_SERVER) {
  LAB_DIR = REPO_ROOT;
} else if (fs.existsSync(SUB_LAB)) {
  // Fall back anyway if the folder exists (server may be named differently)
  LAB_DIR = SUB_LAB;
  process.chdir(LAB_DIR);
}

// For artifacts
const OUT_DIR = ensureOutDir(LAB_DIR);

// --------------------- start student app ---------------------
const ENTRY_CANDIDATES = [
  "server.js",
  "app.js",
  "index.js",
  "main.js",
  "src/server.js",
  "src/app.js",
  "src/index.js",
];

async function startStudentApp() {
  let entry = ENTRY_CANDIDATES.find(p => fs.existsSync(path.join(LAB_DIR, p)));
  let usedCommand = "";
  let child;

  const pkgPath = path.join(LAB_DIR, "package.json");
  const hasPkg = fs.existsSync(pkgPath);
  const hasStart = hasPkg && (() => {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return pkg.scripts && pkg.scripts.start;
    } catch { return false; }
  })();

  if (entry) {
    usedCommand = `node ${entry}`;
    child = spawn(process.execPath, [path.join(LAB_DIR, entry)], {
      cwd: LAB_DIR,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else if (hasStart) {
    usedCommand = "npm start";
    child = spawn(/^win/.test(process.platform) ? "npm.cmd" : "npm", ["start"], {
      cwd: LAB_DIR,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    // Last resort: try server.js anyway
    if (fs.existsSync(path.join(LAB_DIR, "server.js"))) {
      usedCommand = "node server.js";
      child = spawn(process.execPath, [path.join(LAB_DIR, "server.js")], {
        cwd: LAB_DIR,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      usedCommand = "(no entry found)";
      return { child: null, stdoutBuf: "", stderrBuf: "No entry file or npm start.", detectedPort: null, usedCommand };
    }
  }

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.on("data", d => stdoutBuf += d.toString());
  child.stderr.on("data", d => stderrBuf += d.toString());

  let detectedPort = null;
  const portRegexes = [
    /http:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i,
    /listening(?:\s+on)?\s+port\s+(\d{2,5})/i,
    /\bPORT(?:=|:)\s*(\d{2,5})\b/i,
  ];

  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS && child.exitCode === null) {
    const logs = stdoutBuf + "\n" + stderrBuf;
    for (const rx of portRegexes) {
      const m = logs.match(rx);
      if (m && m[1]) { detectedPort = Number(m[1]); break; }
    }
    if (detectedPort) break;
    await sleep(250);
  }

  return { child, stdoutBuf, stderrBuf, detectedPort, usedCommand };
}

async function findBaseUrl(detectedPort = null) {
  const candidates = [];
  if (detectedPort) candidates.push(detectedPort);
  for (const p of SCAN_PORTS) if (!candidates.includes(p)) candidates.push(p);

  for (const p of candidates) {
    const url = `http://127.0.0.1:${p}/`;
    const res = await safeFetch(url);
    if (res && (res.ok || res.status === 404)) {
      return `http://127.0.0.1:${p}`;
    }
  }
  return null;
}

// --------------------- checks ---------------------
async function checkTodo1(base) {
  const s = makeTodoScore();
  // Root responds?
  const res = await safeFetch(`${base}/`);
  if (res) {
    s.completeness = 8;
    pushOK(s.notes, "Server responded on `/`.");
    if (res.status === 200) { s.correctness = 4; pushOK(s.notes, "`/` returned 200."); }
    else { pushWARN(s.notes, `\`/\` returned status ${res.status}.`); }

    try {
      await res.clone().json();
      s.quality = 4;
      pushOK(s.notes, "`/` returned JSON.");
    } catch {
      pushWARN(s.notes, "`/` did not return JSON.");
    }
  } else {
    pushX(s.notes, "No response from `/`.");
  }
  return s;
}

async function checkTodo2(base) {
  const s = makeTodoScore();

  // good case
  const ok = await safeFetch(`${base}/echo?name=Ali&age=22`);
  if (ok) {
    s.completeness += 4;
    if (ok.status === 200) { s.correctness += 2; pushOK(s.notes, "`/echo` success returned 200."); }
    try {
      const j = await ok.clone().json();
      if (j && j.ok === true && "name" in j && "age" in j && typeof j.msg === "string") {
        s.quality += 2; pushOK(s.notes, "`/echo` success JSON has ok/name/age/msg.");
      } else {
        pushWARN(s.notes, "`/echo` success JSON shape differs (accepted).");
      }
    } catch { pushWARN(s.notes, "`/echo` success not JSON."); }
  } else {
    pushX(s.notes, "GET `/echo` not reachable.");
  }

  // missing param case
  const bad = await safeFetch(`${base}/echo?name=Ali`);
  if (bad) {
    s.completeness += 4;
    if (bad.status === 400) { s.correctness += 2; pushOK(s.notes, "`/echo` error returned 400."); }
    try {
      const j = await bad.clone().json();
      if (j && j.ok === false && typeof j.error === "string") {
        s.quality += 2; pushOK(s.notes, "`/echo` error JSON has ok:false + error.");
      } else {
        pushWARN(s.notes, "`/echo` error JSON shape differs (accepted).");
      }
    } catch { pushWARN(s.notes, "`/echo` error not JSON."); }
  } else {
    pushX(s.notes, "GET `/echo` missing-param case not reachable.");
  }

  s.completeness = Math.min(8, s.completeness);
  s.correctness = Math.min(4, s.correctness);
  s.quality = Math.min(4, s.quality);
  return s;
}

async function checkTodo3(base) {
  const s = makeTodoScore();
  const res = await safeFetch(`${base}/profile/Jack/Black`);
  if (res) {
    s.completeness = 8; pushOK(s.notes, "`/profile/:first/:last` reachable.");
    if (res.status === 200) { s.correctness = 4; pushOK(s.notes, "`/profile` returned 200."); }
    try {
      const j = await res.clone().json();
      if (j && j.ok === true && typeof j.fullName === "string") {
        s.quality = 4; pushOK(s.notes, "`/profile` JSON contains ok:true and fullName.");
      } else {
        pushWARN(s.notes, "`/profile` JSON shape differs (accepted).");
      }
    } catch { pushWARN(s.notes, "`/profile` not JSON."); }
  } else {
    pushX(s.notes, "GET `/profile/:first/:last` not reachable.");
  }
  return s;
}

async function checkTodo4and5(base) {
  const s4 = makeTodoScore();
  const s5 = makeTodoScore();

  // valid id
  const good = await safeFetch(`${base}/users/42`);
  if (good) {
    s5.completeness += 8; pushOK(s5.notes, "`/users/:userId` reachable with valid id.");
    if (good.status === 200) { s5.correctness += 4; pushOK(s5.notes, "`/users` valid returned 200."); }
    try {
      const j = await good.clone().json();
      if (j && j.ok === true && ("userId" in j)) {
        s5.quality += 4; pushOK(s5.notes, "`/users` success JSON contains ok:true and userId.");
      } else {
        pushWARN(s5.notes, "`/users` success JSON shape differs (accepted).");
      }
    } catch { pushWARN(s5.notes, "`/users` success not JSON."); }
  } else {
    pushX(s5.notes, "GET `/users/:userId` not reachable.");
  }

  // invalid: non-numeric
  const bad1 = await safeFetch(`${base}/users/abc`);
  if (bad1) {
    s4.completeness += 4;
    if (bad1.status === 400) { s4.correctness += 2; pushOK(s4.notes, "Param middleware rejected non-numeric id with 400."); }
    try {
      const j = await bad1.clone().json();
      if (j && j.ok === false && typeof j.error === "string") {
        s4.quality += 2; pushOK(s4.notes, "Error JSON includes ok:false + error.");
      } else {
        pushWARN(s4.notes, "Error JSON shape (non-numeric) differs (accepted).");
      }
    } catch { pushWARN(s4.notes, "Error (non-numeric) not JSON."); }
  } else {
    pushX(s4.notes, "`/users/abc` path not reachable (param middleware not observed).");
  }

  // invalid: negative
  const bad2 = await safeFetch(`${base}/users/-5`);
  if (bad2) {
    s4.completeness += 4;
    if (bad2.status === 400) { s4.correctness += 2; pushOK(s4.notes, "Param middleware rejected negative id with 400."); }
    try {
      const j = await bad2.clone().json();
      if (j && j.ok === false && typeof j.error === "string") {
        s4.quality += 2; pushOK(s4.notes, "Error JSON includes ok:false + error (negative).");
      } else {
        pushWARN(s4.notes, "Error JSON shape (negative) differs (accepted).");
      }
    } catch { pushWARN(s4.notes, "Error (negative) not JSON."); }
  } else {
    pushX(s4.notes, "`/users/-5` path not reachable (param middleware not observed).");
  }

  s4.completeness = Math.min(8, s4.completeness);
  s4.correctness = Math.min(4, s4.correctness);
  s4.quality = Math.min(4, s4.quality);
  s5.completeness = Math.min(8, s5.completeness);
  s5.correctness = Math.min(4, s5.correctness);
  s5.quality = Math.min(4, s5.quality);

  return { s4, s5 };
}

// --------------------- main ---------------------
(async () => {
  const startInfo = await startStudentApp();
  const usedCmd = startInfo.usedCommand;
  const baseUrl = await findBaseUrl(startInfo.detectedPort);

  // scoring
  let t1 = makeTodoScore();
  let t2 = makeTodoScore();
  let t3 = makeTodoScore();
  let t4 = makeTodoScore();
  let t5 = makeTodoScore();

  if (baseUrl) {
    t1 = await checkTodo1(baseUrl);
    t2 = await checkTodo2(baseUrl);
    t3 = await checkTodo3(baseUrl);
    const r = await checkTodo4and5(baseUrl);
    t4 = r.s4;
    t5 = r.s5;
  } else {
    t1.notes.push("Server not reachable; cannot run endpoint checks.");
    t2.notes.push("Server not reachable.");
    t3.notes.push("Server not reachable.");
    t4.notes.push("Server not reachable.");
    t5.notes.push("Server not reachable.");
  }

  const p1 = bandPoints(t1);
  const p2 = bandPoints(t2);
  const p3 = bandPoints(t3);
  const p4 = bandPoints(t4);
  const p5 = bandPoints(t5);

  let labPoints = p1 + p2 + p3 + p4 + p5;
  const someProgress = [p1, p2, p3, p4, p5].some(x => x > 0);
  if (someProgress && labPoints < 60) labPoints = 60;

  const subPoints = isLate ? (isLate() ? 10 : 20) : 20; // guard if moved
  const totalPoints = labPoints + subPoints;

  function sectionFor(name, s, pts) {
    const lines = [];
    lines.push(`## ${name} — ${pts}/16`);
    lines.push(`Completeness: ${Math.min(8, s.completeness)}/8, Correctness: ${Math.min(4, s.correctness)}/4, Quality: ${Math.min(4, s.quality)}/4`);
    if (s.notes.length) {
      for (const n of s.notes) lines.push(n);
    } else {
      lines.push("—");
    }
    lines.push(""); return lines.join("\n");
  }

  const report = {
    meta: {
      graded_at_utc: nowUtcIso(),
      deadline_riyadh: DUE_STR,
      is_late: isLate(),
      repo_root: REPO_ROOT,
      lab_dir: LAB_DIR,
      command_used: usedCmd,
      detected_base_url: baseUrl || null,
    },
    scoring: {
      per_todo: { TODO_1: p1, TODO_2: p2, TODO_3: p3, TODO_4: p4, TODO_5: p5 },
      lab_points: labPoints,
      submission_points: subPoints,
      total_points: totalPoints,
    },
  };

  // ----- human summary (sample-like) -----
  const summary = [];
  summary.push("==== 6-3 Express Request Data — Grade Summary ====");
  summary.push(`Graded at (UTC): ${report.meta.graded_at_utc}`);
  summary.push(`Deadline (Riyadh): ${report.meta.deadline_riyadh}`);
  summary.push(`Late submission? ${report.meta.is_late ? "Yes (10/20)" : "No (20/20)"}`);
  summary.push(`Detected base URL: ${report.meta.detected_base_url || "N/A"}`);
  summary.push("");
  summary.push("Per-TODO Points:");
  summary.push(`- TODO_1: ${p1}/16`);
  summary.push(`- TODO_2: ${p2}/16`);
  summary.push(`- TODO_3: ${p3}/16`);
  summary.push(`- TODO_4: ${p4}/16`);
  summary.push(`- TODO_5: ${p5}/16`);
  summary.push("");
  summary.push(`Lab Points: ${labPoints}/80`);
  summary.push(`Submission Points: ${subPoints}/20`);
  summary.push(`TOTAL: ${totalPoints}/100`);
  summary.push("");
  summary.push("Per-TODO Feedback (what you implemented vs. what's missing)");
  summary.push(sectionFor("TODO 1: Server Setup (`/`)", t1, p1));
  summary.push(sectionFor("TODO 2: `/echo` route", t2, p2));
  summary.push(sectionFor("TODO 3: `/profile/:first/:last`", t3, p3));
  summary.push(sectionFor("TODO 4: `app.param('userId', ...)`", t4, p4));
  summary.push(sectionFor("TODO 5: `/users/:userId`", t5, p5));

  const gradeTxt = summary.join("\n");
  const gradeJsonPath = path.join(OUT_DIR, "grade.json");
  const gradeTxtPath = path.join(OUT_DIR, "grade.txt");

  fs.writeFileSync(gradeJsonPath, JSON.stringify(report, null, 2), "utf-8");
  fs.writeFileSync(gradeTxtPath, gradeTxt, "utf-8");

  // Print to logs
  console.log(gradeTxt);

  // Publish to Actions Job Summary
  try {
    const sumPath = process.env.GITHUB_STEP_SUMMARY;
    if (sumPath) {
      const md = [
        "## 6-3 Express Request Data — Grade Summary",
        "",
        "```txt",
        gradeTxt,
        "```",
        "",
        "**Lab dir:** " + report.meta.lab_dir,
        "",
      ].join("\n");
      fs.appendFileSync(sumPath, md, "utf-8");
    }
  } catch {}

  // Cleanup spawned process
  try {
    if (startInfo.child && startInfo.child.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(startInfo.child.pid), "/f", "/t"]);
      } else {
        try { process.kill(-startInfo.child.pid, "SIGKILL"); } catch {}
        try { process.kill(startInfo.child.pid, "SIGKILL"); } catch {}
      }
    }
  } catch {}

})().catch(e => {
  console.error("Grader crashed:", e);
  process.exitCode = 1;
});
