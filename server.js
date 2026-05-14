const express  = require("express");
const http     = require("http");
const { Server } = require("socket.io");
const pty      = require("node-pty");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const os       = require("os");
const crypto   = require("crypto");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ── ANSI strip ── */
function stripAnsi(s) {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[()][A-Z0-9]/g, "")
    .replace(/\x1b[@-_][0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

/* ── Prompt detector (real Kali two-line prompt OR simple root@kali) ── */
const PROMPT_RE = /root@kali|#\s*$/m;

/* ── Init script (written once on startup) ──────────────────────────────────
   In the Docker image we are already root, tools are pre-installed.
   This script just sets environment, prompt and prints the banner.
   No sudo setup needed — we ARE root.
── */
const INIT_FILE = path.join(os.tmpdir(), "kali-init.sh");
fs.writeFileSync(INIT_FILE, `#!/bin/bash
# Fast init — pre-installed Docker image, already root
export LANG=en_US.UTF-8
export LC_ALL=C.UTF-8
export TERM=xterm-256color
export COLORTERM=truecolor
export DEBIAN_FRONTEND=noninteractive
export HISTFILE=/root/.bash_history
export HISTSIZE=1000
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/share/metasploit-framework:/root/go/bin"

# Load system bashrc if present
[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc 2>/dev/null || true
[ -f /root/.bashrc ]    && source /root/.bashrc    2>/dev/null || true

# Real Kali two-line prompt
PS1='\\[\\033[1;31m\\]┌──(\\[\\033[1;32m\\]root㉿kali\\[\\033[1;31m\\])-[\\[\\033[0;1m\\]\\w\\[\\033[1;31m\\]]\\n\\[\\033[1;31m\\]└─\\[\\033[1;32m\\]# \\[\\033[0m\\]'
export PS1

# ── Banner ──────────────────────────────────────────────────────────────────
printf '\\033[1;32m'
cat << 'BANNER'

  ██╗  ██╗ █████╗ ██╗     ██╗
  ██║ ██╔╝██╔══██╗██║     ██║
  █████╔╝ ███████║██║     ██║
  ██╔═██╗ ██╔══██║██║     ██║
  ██║  ██╗██║  ██║███████╗██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  LINUX

BANNER
printf '\\033[0;32m'
cat << 'DRAGON'
        /\\_____/\\
       /  o   o  \\   The quieter you become,
      ( ==  ^  == )   the more you are able to hear.
       )         (
      (  (  )  ( ) )
     (__(__)__(__)__)

DRAGON
printf '\\033[0m'
echo -e "  \\033[1;37mOS:\\033[0m       Kali Linux Rolling  |  \\033[1;37mShell:\\033[0m bash (real PTY)"
echo -e "  \\033[1;37mUser:\\033[0m     root  |  \\033[1;37mPython:\\033[0m $(python3 --version 2>&1 | cut -d' ' -f2)"
echo -e "  \\033[1;37mTools:\\033[0m    nmap · hydra · sqlmap · metasploit · hashcat · gobuster · nikto · john"
echo -e "  \\033[1;37mLists:\\033[0m    /usr/share/wordlists/rockyou.txt  |  /usr/share/seclists/"
echo -e "  \\033[1;37mMSF:\\033[0m      msfconsole · msfvenom · msfdb"
echo ""
`);
fs.chmodSync(INIT_FILE, 0o755);

/* ── Session store ── */
const IDLE_MS  = 30 * 60 * 1000;   // 30-min idle → kill PTY
const BUF_MAX  = 131072;            // 128 KB replay buffer per session
const sessions = new Map();

/* API key */
const API_KEY = process.env.TERMINAL_API_KEY || crypto.randomBytes(20).toString("hex");
console.log(`[api-key] ${API_KEY}`);

function genToken() { return crypto.randomBytes(16).toString("hex"); }

function spawnShell(cols = 220, rows = 50) {
  return pty.spawn("bash", ["--rcfile", INIT_FILE, "-i"], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: "/root",
    env: {
      ...process.env,
      TERM:        "xterm-256color",
      COLORTERM:   "truecolor",
      LANG:        "en_US.UTF-8",
      LC_ALL:      "C.UTF-8",
      DEBIAN_FRONTEND: "noninteractive",
      HOME:        "/root",
      USER:        "root",
      LOGNAME:     "root",
    },
  });
}

function scheduleKill(sess) {
  clearTimeout(sess.killTimer);
  sess.killTimer = setTimeout(() => {
    try { sess.shell.kill(); } catch (_) {}
    sessions.delete(sess.token);
    console.log(`[expired] ${sess.token.slice(0, 8)}`);
  }, IDLE_MS);
}

function makeSession(token) {
  let readyResolve;
  const readyPromise = new Promise(r => { readyResolve = r; });
  const shell = spawnShell();

  const sess = {
    token,
    shell,
    buf:          "",
    clients:      new Set(),
    killTimer:    null,
    listeners:    new Set(),
    ready:        false,
    readyPromise,
    readyResolve,
  };

  shell.onData(d => {
    sess.buf += d;
    if (sess.buf.length > BUF_MAX) sess.buf = sess.buf.slice(-BUF_MAX);
    io.to(sess.token).emit("output", d);
    sess.listeners.forEach(fn => fn(d));

    /* mark ready once first prompt appears */
    if (!sess.ready && PROMPT_RE.test(stripAnsi(sess.buf))) {
      sess.ready = true;
      readyResolve();
    }
  });

  shell.onExit(({ exitCode }) => {
    const msg = `\r\n\x1b[31m[session ended — exit ${exitCode}]\x1b[0m\r\n`;
    io.to(sess.token).emit("output", msg);
    sessions.delete(sess.token);
  });

  sessions.set(token, sess);
  console.log(`[new] ${token.slice(0, 8)}`);
  return sess;
}

function getOrCreate(token) {
  if (token && sessions.has(token)) {
    const sess = sessions.get(token);
    clearTimeout(sess.killTimer);
    return { sess, created: false };
  }
  const t = token || genToken();
  return { sess: makeSession(t), created: true };
}

/* ── Socket.IO ────────────────────────────────────────────────────────────── */
io.on("connection", socket => {
  const clientToken = socket.handshake.auth.token || null;
  const { sess } = getOrCreate(clientToken);

  socket.emit("session_token", sess.token);
  if (sess.buf) socket.emit("output", sess.buf);   // replay buffer

  sess.clients.add(socket.id);
  socket.join(sess.token);

  socket.on("input",  d              => { try { sess.shell.write(d); }            catch (_) {} });
  socket.on("resize", ({ cols, rows }) => { try { sess.shell.resize(cols, rows); } catch (_) {} });
  socket.on("disconnect", () => {
    sess.clients.delete(socket.id);
    socket.leave(sess.token);
    if (sess.clients.size === 0) scheduleKill(sess);
  });
});

/* ── REST API ─────────────────────────────────────────────────────────────── */
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized — set X-Api-Key header" });
  }
  next();
}

/* GET /api/status */
app.get("/api/status", requireApiKey, (req, res) => {
  res.json({
    ok:       true,
    sessions: sessions.size,
    uptime:   Math.round(process.uptime()),
    ready:    [...sessions.values()].filter(s => s.ready).length,
  });
});

/* GET /api/sessions */
app.get("/api/sessions", requireApiKey, (req, res) => {
  const list = [];
  sessions.forEach((s, token) =>
    list.push({ token, clients: s.clients.size, ready: s.ready })
  );
  res.json({ ok: true, sessions: list });
});

/*
  POST /api/exec
  ─────────────────────────────────────────────────────────────────────────────
  Body  : { cmd, token?, timeout_ms? }
  Header: X-Api-Key: <key>

  How it works:
    1. Wait for shell to be ready (prompt visible — up to 12 s for a cold start).
    2. Write the command followed by a unique end-marker echo.
    3. Collect all PTY output until the marker appears, or timeout fires.
    4. Strip ANSI codes, strip the echoed command line, strip the marker line.
    5. Return clean plain-text output.

  This is reliable for ALL commands — even ones that produce no output,
  error output, or take several seconds to finish.
*/
app.post("/api/exec", requireApiKey, async (req, res) => {
  const { cmd, timeout_ms } = req.body || {};
  const inToken = req.body.token || null;

  if (!cmd || typeof cmd !== "string") {
    return res.status(400).json({ ok: false, error: "cmd is required" });
  }

  const maxWait = Math.min(parseInt(timeout_ms) || 15000, 120000);
  const { sess } = getOrCreate(inToken);

  /* 1 — Wait for shell ready */
  try {
    await Promise.race([
      sess.readyPromise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("shell not ready")), 12000)
      ),
    ]);
  } catch (e) {
    return res.status(503).json({
      ok: false,
      error: "Shell is still starting — retry in a moment",
      token: sess.token,
    });
  }

  /* 2 — Write cmd + unique end marker */
  const marker  = `__KALI_END_${crypto.randomBytes(8).toString("hex")}__`;
  let   rawOut  = "";
  let   settled = false;

  const output = await new Promise(resolve => {
    function onData(d) {
      rawOut += d;
      if (rawOut.includes(marker) && !settled) {
        settled = true;
        sess.listeners.delete(onData);
        /* tiny delay so terminal echo finishes flushing */
        setTimeout(() => resolve(rawOut), 80);
      }
    }
    sess.listeners.add(onData);

    /* hard timeout */
    setTimeout(() => {
      if (!settled) {
        settled = true;
        sess.listeners.delete(onData);
        resolve(rawOut);
      }
    }, maxWait);

    try {
      sess.shell.write(cmd + "\n");
      sess.shell.write(`echo "${marker}"\n`);
    } catch (e) {
      if (!settled) { settled = true; sess.listeners.delete(onData); resolve(""); }
    }
  });

  /* 3 — Clean and extract */
  const clean  = stripAnsi(output);
  const lines  = clean.split("\n");

  /* Skip lines before (and including) the echoed command */
  let start = 0;
  const cmdSnippet = cmd.trim().slice(0, 40);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(cmdSnippet)) { start = i + 1; break; }
  }

  /* Stop before the marker line */
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes(marker)) { end = i; break; }
  }

  const result = lines
    .slice(start, end)
    .filter(l => !l.includes(`echo "${marker}"`))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")   // collapse excessive blank lines
    .trim();

  res.json({
    ok:     true,
    token:  sess.token,
    output: result || "(no output)",
  });
});

/* POST /api/session — create a fresh named session */
app.post("/api/session", requireApiKey, (req, res) => {
  const { sess } = getOrCreate(null);
  res.json({ ok: true, token: sess.token, ready: sess.ready });
});

/* GET /api/key — retrieve key if already authenticated */
app.get("/api/key", (req, res) => {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (key === API_KEY) return res.json({ ok: true, api_key: API_KEY });
  res.status(401).json({ ok: false, hint: "Check Render environment variables" });
});

/* ── Start ── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Kali Terminal on port ${PORT}`)
);
