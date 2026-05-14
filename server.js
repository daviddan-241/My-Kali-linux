const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pty = require("node-pty");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  const shell = pty.spawn("bash", ["--login"], {
    name: "xterm-256color",
    cols: 220, rows: 50,
    cwd: process.env.HOME || "/root",
    env: {
      ...process.env,
      TERM: "xterm-256color", COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    },
  });
  shell.onData(d => socket.emit("output", d));
  shell.onExit(({ exitCode }) => {
    socket.emit("output", `\r\n\x1b[31m[shell exited: ${exitCode}]\x1b[0m\r\n`);
    socket.disconnect();
  });
  socket.on("input", d => shell.write(d));
  socket.on("resize", ({ cols, rows }) => shell.resize(cols, rows));
  socket.on("disconnect", () => { try { shell.kill(); } catch(e){} });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Running on :${PORT}`));
