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
const HOME_DIR = process.env.HOME || "/home/runner";
const SHELL_USER = process.env.USER || "runner";
const INIT_FILE = path.join(os.tmpdir(), "kali-init.sh");
const SHARE_FN = (() => {
  try { return fs.readFileSync(path.join(__dirname, "share.sh"), "utf8"); }
  catch (_) { return ""; }
})();
const AI_FN = (() => {
  try { return fs.readFileSync(path.join(__dirname, "ai.sh"), "utf8"); }
  catch (_) { return ""; }
})();
fs.writeFileSync(INIT_FILE, `#!/bin/bash
export LANG=en_US.UTF-8
export LC_ALL=C.UTF-8
export TERM=xterm-256color
export COLORTERM=truecolor
export DEBIAN_FRONTEND=noninteractive
export HISTFILE=${HOME_DIR}/.bash_history
export HISTSIZE=1000
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Load system bashrc if present
[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc 2>/dev/null || true
[ -f ${HOME_DIR}/.bashrc ] && source ${HOME_DIR}/.bashrc 2>/dev/null || true

# Escape hatch: run a command outside tor (example: notor curl ipinfo.io)
alias notor='LD_PRELOAD='
${SHARE_FN}
${AI_FN}
# Prompt
PS1='\\[\\033[1;31m\\]┌──(\\[\\033[1;32m\\]${SHELL_USER}㉿kali\\[\\033[1;31m\\])-[\\[\\033[0;1m\\]\\w\\[\\033[1;31m\\]]\\n\\[\\033[1;31m\\]└─\\[\\033[1;32m\\]# \\[\\033[0m\\]'
export PS1

# ── Banner ──────────────────────────────────────────────────────────────────
printf '\\033[1;32m'
cat << 'BANNER'

  ██╗  ██╗ █████╗ ██╗     ██╗
  ██║ ██╔╝██╔══██╗██║     ██║
  █████╔╝ ███████║██║     ██║
  ██╔═██╗ ██╔══██║██║     ██║
  ██║  ██╗██║  ██║███████╗██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  TERMINAL

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
echo -e "  \\033[1;37mShell:\\033[0m    bash (real PTY)  |  \\033[1;37mUser:\\033[0m ${SHELL_USER}"
echo -e "  \\033[1;37mPython:\\033[0m   $(python3 --version 2>&1 | cut -d' ' -f2 || echo 'n/a')  |  \\033[1;37mNode:\\033[0m $(node --version 2>&1 || echo 'n/a')"
echo ""
`);
fs.chmodSync(INIT_FILE, 0o755);

/* ── Session store ── */
const IDLE_MS  = 24 * 60 * 60 * 1000;  // 24h idle → kill PTY (survive backgrounding)
const BUF_MAX  = 131072;            // 128 KB replay buffer per session
const sessions = new Map();

/* API key */
const API_KEY = process.env.TERMINAL_API_KEY || crypto.randomBytes(20).toString("hex");
console.log(`[api-key] ${API_KEY}`);

function genToken() { return crypto.randomBytes(16).toString("hex"); }

function spawnShell(cols = 220, rows = 50) {
  const homeDir = process.env.HOME || "/home/runner";
  const USE_TOR = fs.existsSync("/usr/bin/proxychains4") && fs.existsSync("/usr/bin/tor");
  if (USE_TOR) {
    return pty.spawn("proxychains4", ["-q", "-f", "/etc/proxychains4.conf", "bash", "--rcfile", INIT_FILE, "-i"], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: homeDir,
    env: {
      ...process.env,
      TERM:        "xterm-256color",
      COLORTERM:   "truecolor",
      LANG:        "en_US.UTF-8",
      LC_ALL:      "C.UTF-8",
      DEBIAN_FRONTEND: "noninteractive",
      HOME:        homeDir,
      USER:        process.env.USER || "runner",
      LOGNAME:     process.env.USER || "runner",
    },
  });
  }
  return pty.spawn("bash", ["--rcfile", INIT_FILE, "-i"], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: homeDir,
    env: {
      ...process.env,
      TERM:        "xterm-256color",
      COLORTERM:   "truecolor",
      LANG:        "en_US.UTF-8",
      LC_ALL:      "C.UTF-8",
      DEBIAN_FRONTEND: "noninteractive",
      HOME:        homeDir,
      USER:        process.env.USER || "runner",
      LOGNAME:     process.env.USER || "runner",
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

/* ── Share: real public links published straight from the terminal ─────────
   share add [folder|file] [password]  -> prints a public URL that opens in
   ANY browser anywhere (phones included). Optional password = native
   login popup. Every visit is logged with the real IP and a live
   [share] notice lands in every open terminal session.
───────────────────────────────────────────────────────────────────────── */
const shares   = new Map();  // id -> share
const SHARE_OK = [path.resolve(HOME_DIR), "/tmp"];
const SHARE_URL = () => process.env.RENDER_EXTERNAL_URL || "";

function shareNotify(msg) {
  sessions.forEach((sess, token) => {
    try { io.to(token).emit("snotice", msg); } catch (_) {}
  });
}

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

function sharePageHtml(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + '</title><style>'
    + 'body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#0b0d10;color:#d7dbe2;display:flex;min-height:100vh;align-items:center;justify-content:center}'
    + '.card{background:#14171c;border:1px solid #23262e;border-radius:16px;padding:34px 38px;max-width:420px;width:90%;text-align:center}'
    + 'h1{font-size:19px;margin:0 0 8px;font-weight:700}p{font-size:13px;color:#8b929d;margin:6px 0;line-height:1.5}'
    + 'a{color:#32d74b;text-decoration:none;font-size:13px}'
    + 'table{width:100%;border-collapse:collapse;text-align:left}td{padding:8px 6px;border-top:1px solid #23262e;font-size:13px}'
    + '.logo{font-size:26px;margin-bottom:10px}'
    + '</style></head><body><div class="card">' + body + '</div></body></html>';
}

function dirListing(absDir, urlPath) {
  let rows = "";
  try {
    rows = fs.readdirSync(absDir).sort().map(n => {
      let st;
      try { st = fs.statSync(path.join(absDir, n)); } catch (_) { st = { isDirectory: () => false, size: 0 }; }
      const href = urlPath.replace(/\/+$/, "") + "/" + encodeURIComponent(n);
      return '<tr><td><a style="color:#5ce65e;text-decoration:none;font-size:14px" href="' + href + '">'
        + n + (st.isDirectory() ? "/" : "") + '</a></td><td style="text-align:right;color:#8b929d">'
        + (st.isDirectory() ? "&mdash;" : fmtBytes(st.size)) + "</td></tr>";
    }).join("");
  } catch (_) {}
  return sharePageHtml("Shared folder",
    '<div class="logo">&#128194;</div><h1>Shared folder</h1>'
    + '<table>' + (rows || '<tr><td>Empty</td></tr>') + "</table>");
}

app.post("/api/share", requireApiKey, (req, res) => {
  const body  = req.body || {};
  const target = path.resolve(String(body.dir || HOME_DIR));
  const allowed = SHARE_OK.some(d => target === d || target.startsWith(d + path.sep));
  if (!allowed) return res.status(400).json({ ok: false, error: "only paths inside your home or /tmp can be shared" });
  if (!fs.existsSync(target)) return res.status(404).json({ ok: false, error: "path not found: " + body.dir });

  const id  = crypto.randomBytes(4).toString("hex");
  const sh  = { id, target, visits: 0, log: [], lastPing: 0 };
  const pw  = String(body.password || "").trim();
  if (pw) {
    sh.user = crypto.randomBytes(3).toString("hex");
    sh.pass = crypto.createHash("sha256").update(pw).digest("hex");
  }
  shares.set(id, sh);
  const url = (SHARE_URL() || "") + "/s/" + id + "/";
  res.json({
    ok: true, id,
    url,
    auth: pw ? "username: " + sh.user + "  password: " + pw : null,
    hint: "share log " + id + "  |  share rm " + id,
  });
});

app.get("/api/share", requireApiKey, (req, res) => {
  const list = [...shares.values()].map(s => ({
    id: s.id, target: s.target, url: (SHARE_URL() || "") + "/s/" + s.id + "/",
    protected: !!s.pass, visits: s.visits,
  }));
  res.json({ ok: true, shares: list });
});

app.get("/api/share/:id/log", requireApiKey, (req, res) => {
  const sh = shares.get(req.params.id);
  if (!sh) return res.status(404).json({ ok: false, error: "no such share" });
  res.json({ ok: true, target: sh.target, visits: sh.visits, log: sh.log });
});

app.delete("/api/share/:id", requireApiKey, (req, res) => {
  const ok = shares.delete(req.params.id);
  res.json({ ok, error: ok ? null : "no such share" });
});

function shareHandler(req, res) {
  const sh = shares.get(req.params.id);
  if (!sh) return res.status(404).type("html").send(sharePageHtml("Expired", '<h1>Link expired</h1><p>This share was removed or never existed.</p>'));

  if (sh.pass) {
    const hdr = req.headers.authorization || "";
    let valid = false;
    if (hdr.startsWith("Basic ")) {
      const dec = Buffer.from(hdr.slice(6), "base64").toString("utf8");
      const ci  = dec.indexOf(":");
      const u   = ci < 0 ? dec : dec.slice(0, ci);
      const p   = ci < 0 ? ""  : dec.slice(ci + 1);
      valid = u === sh.user &&
        crypto.createHash("sha256").update(p).digest("hex") === sh.pass;
    }
    if (!valid) {
      res.set("WWW-Authenticate", 'Basic realm="Kali Share", charset="UTF-8"');
      return res.status(401).type("html").send(sharePageHtml("Login", '<h1>Login required</h1><p>Enter the username and password you were given.</p>'));
    }
  }

  const ip = String((req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")).split(",")[0].trim() || "unknown";
  sh.visits++;
  sh.log.push({ t: new Date().toISOString(), ip, path: req.params[0] || "/", ua: String(req.headers["user-agent"] || "").slice(0, 140) });
  if (sh.log.length > 400) sh.log.shift();

  const now = Date.now();
  if (now - sh.lastPing > 15000) {
    sh.lastPing = now;
    shareNotify("\r\n\x1b[1;33m[share]\x1b[0m \x1b[1m" + ip + "\x1b[0m opened the link\x1b[0m\r\n");
  }

  let sub = sh.target;
  if (req.params[0]) {
    sub = path.resolve(sh.target, decodeURIComponent(req.params[0]));
    if (sub !== sh.target && !sub.startsWith(sh.target + path.sep)) {
      return res.status(403).type("html").send(sharePageHtml("Nope", "<h1>Forbidden</h1>"));
    }
  }
  if (!fs.existsSync(sub)) return res.status(404).type("html").send(sharePageHtml("Missing", "<h1>Not found</h1>"));

  if (fs.statSync(sub).isDirectory()) {
    const idx = path.join(sub, "index.html");
    if (fs.existsSync(idx)) return res.sendFile(idx);
    return res.type("html").send(dirListing(sub, req.url));
  }
  return res.sendFile(sub);
}
app.get("/s/:id", shareHandler);
app.get("/s/:id/*", shareHandler);

/* ── Start ── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Kali Terminal on port ${PORT}`)
);

/* ── Keep-awake: self-ping every 10 min so the free instance never idles out ── */
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "";
if (SELF_URL) {
  setInterval(() => {
    fetch(SELF_URL + "/")
      .then((r) => console.log(`[keep-awake] ${r.status}`))
      .catch(() => {});
  }, 10 * 60 * 1000).unref();
}
