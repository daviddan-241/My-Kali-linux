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
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ── ANSI strip helper ── */
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
          .replace(/\x1b\][^\x07]*\x07/g, "")
          .replace(/\x1b[()][A-Z0-9]/g, "")
          .replace(/\r/g, "");
}

/* ── Prompt pattern ── */
const PROMPT_RE = /root@kali/;

/* ── Init script ── */
const INIT_FILE = path.join(os.tmpdir(), "kali-init.sh");
fs.writeFileSync(INIT_FILE, `#!/bin/bash
[ -f /etc/profile ] && source /etc/profile 2>/dev/null || true
[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc 2>/dev/null || true

export LANG=en_US.UTF-8
export LC_ALL=C.UTF-8
export LANGUAGE=en_US.UTF-8
export HOSTNAME=kali
export TERM=xterm-256color
export COLORTERM=truecolor
export DEBIAN_FRONTEND=noninteractive

# ── Strip nmap setcap so it can actually exec on restricted hosts ──
setcap -r /usr/lib/nmap/nmap 2>/dev/null || true
setcap -r /usr/bin/nmap 2>/dev/null || true

# ── Make sudo passwordless ──
if command -v sudo &>/dev/null; then
  SFILE="/etc/sudoers.d/kali-term-nopasswd"
  U="$(id -un)"
  (echo "$U ALL=(ALL) NOPASSWD:ALL" | sudo -n tee "$SFILE" > /dev/null 2>&1) || true
  sudo -n chmod 0440 "$SFILE" 2>/dev/null || true
fi

# ── PATH extensions ──
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin:/usr/local/bin"

# ── Kali-style prompt ──
export PS1='\\[\\033[1;32m\\]root@kali\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]# '

# ── Welcome banner ──
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
      ( ==  ^  == )   the more you can hear.
       )           (
      (  (  )  (  ) )
     (__(__)___(__)__)

DRAGON
printf '\\033[1;32m'
echo -e " \\033[1;37m*\\033[0m OS:       Kali Linux Rolling"
echo -e " \\033[1;37m*\\033[0m Shell:    bash (real PTY)"
echo -e " \\033[1;37m*\\033[0m Docs:     https://www.kali.org/docs/"
echo -e " \\033[1;37m*\\033[0m Tools:    nmap  hydra  sqlmap  ffuf  curl  python3"
echo -e " \\033[1;37m*\\033[0m Tip:      type 'sudo <cmd>' — no password needed"
echo ""
printf '\\033[0m'
`);
fs.chmodSync(INIT_FILE, 0o755);

/* ── Session store ── */
const IDLE_TIMEOUT = 30 * 60 * 1000;
const BUF_MAX      = 65536;
const sessions     = new Map();

/* API key */
const API_KEY = process.env.TERMINAL_API_KEY || crypto.randomBytes(20).toString("hex");
console.log(`[api-key] ${API_KEY}`);

function genToken() { return crypto.randomBytes(16).toString("hex"); }

function spawnShell(cols, rows) {
  return pty.spawn("bash", ["--rcfile", INIT_FILE], {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || "/tmp",
    env: {
      ...process.env,
      TERM:      "xterm-256color",
      COLORTERM: "truecolor",
      LANG:      "en_US.UTF-8",
      LC_ALL:    "C.UTF-8",
      LANGUAGE:  "en_US.UTF-8",
      DEBIAN_FRONTEND: "noninteractive",
    },
  });
}

function scheduleKill(sess) {
  clearTimeout(sess.killTimer);
  sess.killTimer = setTimeout(() => {
    try { sess.shell.kill(); } catch (_) {}
    sessions.delete(sess.token);
    console.log(`[expired] ${sess.token.slice(0, 8)}`);
  }, IDLE_TIMEOUT);
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

  shell.onData((d) => {
    sess.buf += d;
    if (sess.buf.length > BUF_MAX) sess.buf = sess.buf.slice(-BUF_MAX);
    io.to(sess.token).emit("output", d);
    sess.listeners.forEach((fn) => fn(d));

    /* mark shell ready once prompt appears */
    if (!sess.ready && PROMPT_RE.test(stripAnsi(sess.buf))) {
      sess.ready = true;
      readyResolve();
    }
  });

  shell.onExit(({ exitCode }) => {
    const msg = `\r\n\x1b[31m[session ended: ${exitCode}]\x1b[0m\r\n`;
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
  const newToken = token || genToken();
  return { sess: makeSession(newToken), created: true };
}

/* ── Socket.IO ── */
io.on("connection", (socket) => {
  const clientToken = socket.handshake.auth.token || null;
  const { sess } = getOrCreate(clientToken);

  socket.emit("session_token", sess.token);
  if (sess.buf) socket.emit("output", sess.buf);

  sess.clients.add(socket.id);
  socket.join(sess.token);

  socket.on("input",  (d)             => { try { sess.shell.write(d); }            catch (_) {} });
  socket.on("resize", ({ cols, rows }) => { try { sess.shell.resize(cols, rows); } catch (_) {} });
  socket.on("disconnect", () => {
    sess.clients.delete(socket.id);
    socket.leave(sess.token);
    if (sess.clients.size === 0) scheduleKill(sess);
  });
});

/* ── REST API ── */
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorized — set X-Api-Key header" });
  }
  next();
}

/* GET /api/status */
app.get("/api/status", requireApiKey, (req, res) => {
  res.json({ ok: true, sessions: sessions.size, uptime: Math.round(process.uptime()) });
});

/* GET /api/sessions */
app.get("/api/sessions", requireApiKey, (req, res) => {
  const list = [];
  sessions.forEach((s, token) => list.push({ token, clients: s.clients.size, ready: s.ready }));
  res.json({ ok: true, sessions: list });
});

/*
  POST /api/exec
  Body: { cmd, token?, timeout_ms? }

  HOW IT WORKS:
  1. Waits for the shell to be ready (prompt appeared after init script).
  2. Writes the command + a unique end-marker echo.
  3. Collects PTY output until the marker line appears OR timeout.
  4. Extracts only the output between the command echo and the marker.
  5. Returns clean plain text.
*/
app.post("/api/exec", requireApiKey, async (req, res) => {
  const { cmd, timeout_ms } = req.body || {};
  const inToken = req.body.token || null;

  if (!cmd || typeof cmd !== "string") {
    return res.status(400).json({ ok: false, error: "cmd required" });
  }

  const maxWait = Math.min(parseInt(timeout_ms) || 15000, 60000);
  const { sess } = getOrCreate(inToken);

  /* 1 — Wait for shell ready (up to 10 s for brand new session) */
  try {
    await Promise.race([
      sess.readyPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("shell not ready")), 10000)),
    ]);
  } catch (e) {
    return res.status(503).json({ ok: false, error: "shell not ready in time", token: sess.token });
  }

  /* 2 — Write command + unique end marker */
  const marker = `__KALI_END_${crypto.randomBytes(6).toString("hex")}__`;
  let rawOut   = "";
  let resolved = false;

  const output = await new Promise((resolve) => {
    function onData(d) {
      rawOut += d;
      if (rawOut.includes(marker)) {
        if (!resolved) { resolved = true; sess.listeners.delete(onData); resolve(rawOut); }
      }
    }
    sess.listeners.add(onData);

    /* hard timeout fallback */
    setTimeout(() => {
      if (!resolved) { resolved = true; sess.listeners.delete(onData); resolve(rawOut); }
    }, maxWait);

    try {
      sess.shell.write(cmd + "\n");
      sess.shell.write(`echo "${marker}"\n`);
    } catch (e) {
      if (!resolved) { resolved = true; sess.listeners.delete(onData); resolve(""); }
    }
  });

  /* 3 — Extract output: strip ANSI, find what's between cmd echo and marker */
  const clean = stripAnsi(output);
  const lines  = clean.split("\n");

  /* Find line that echoes the command (PTY echoes input) */
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(cmd.slice(0, 30))) { start = i + 1; break; }
  }
  /* Find marker line */
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes(marker)) { end = i; break; }
  }

  const result = lines
    .slice(start, end)
    .filter(l => !l.includes(`echo "${marker}"`))
    .join("\n")
    .trim();

  res.json({
    ok:     true,
    token:  sess.token,
    output: result || "(no output)",
  });
});

/* POST /api/session */
app.post("/api/session", requireApiKey, (req, res) => {
  const { sess } = getOrCreate(null);
  res.json({ ok: true, token: sess.token });
});

/* GET /api/key */
app.get("/api/key", (req, res) => {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (key === API_KEY) return res.json({ ok: true, api_key: API_KEY });
  res.status(401).json({ ok: false, hint: "Check server logs for the API key" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => console.log(`Kali Terminal on port ${PORT}`));
