const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pty = require("node-pty");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  const shell = pty.spawn("bash", ["--login"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || "/root",
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: "en_US.UTF-8",
    },
  });

  shell.onData((d) => socket.emit("output", d));
  shell.onExit(({ exitCode }) => {
    socket.emit("output", `\r\n\x1b[31m[session ended: ${exitCode}]\x1b[0m\r\n`);
    socket.disconnect();
  });

  socket.on("input", (d) => { try { shell.write(d); } catch (e) {} });
  socket.on("resize", ({ cols, rows }) => { try { shell.resize(cols, rows); } catch (e) {} });
  socket.on("disconnect", () => { try { shell.kill(); } catch (e) {} });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => console.log(`Kali Terminal running on port ${PORT}`));
