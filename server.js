const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const pty     = require("node-pty");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

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
app.use(express.static(path.join(__dirname, "public")));

// Write a bash init file that sets the real Kali two-line prompt
const INIT_FILE = path.join(os.tmpdir(), "kali-init.sh");
fs.writeFileSync(INIT_FILE, `
# Source system profiles if they exist
[ -f /etc/bash.bashrc ] && source /etc/bash.bashrc
[ -f ~/.bashrc ] && source ~/.bashrc 2>/dev/null || true

# Real Kali Linux two-line prompt
export PS1='\\[\\033[1;32m\\]\\u@\\h\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '
export TERM=xterm-256color
export COLORTERM=truecolor
`);
fs.chmodSync(INIT_FILE, 0o755);

io.on("connection", (socket) => {
  const shell = pty.spawn("bash", ["--rcfile", INIT_FILE], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || "/root",
    env: {
      ...process.env,
      TERM:      "xterm-256color",
      COLORTERM: "truecolor",
      LANG:      "en_US.UTF-8",
    },
  });

  shell.onData((d) => socket.emit("output", d));

  shell.onExit(({ exitCode }) => {
    socket.emit("output", `\r\n\x1b[31m[session ended: ${exitCode}]\x1b[0m\r\n`);
    socket.disconnect();
  });

  socket.on("input",  (d)            => { try { shell.write(d); }            catch (e) {} });
  socket.on("resize", ({ cols, rows }) => { try { shell.resize(cols, rows); } catch (e) {} });
  socket.on("disconnect", ()          => { try { shell.kill(); }              catch (e) {} });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Kali Terminal running on port ${PORT}`)
);
