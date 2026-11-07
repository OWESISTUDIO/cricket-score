// Takes the live video the camera phone sends (WebM over a websocket) and
// pushes it to YouTube with ffmpeg. One phone at a time; if the phone
// reconnects, the old ffmpeg is stopped and a new one starts.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 5095);
const SECRET = (process.env.LIVE_SECRET || "").trim();
const OUT = process.env.LIVE_OUT || ""; // a file path, for testing without YouTube
const keyFile = path.join(__dirname, "stream.key");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

function target() {
  if (OUT) return OUT;
  const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8").trim() : "";
  return "rtmp://a.rtmp.youtube.com/live2/" + key;
}

function log(msg) {
  const t = new Date().toLocaleTimeString();
  console.log("[" + t + "] " + msg);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
  res.end("cricket live relay ok");
});

const wss = new WebSocketServer({ server, path: "/live", maxPayload: 16 * 1024 * 1024 });
let current = null; // { ws, ff }

function stopCurrent() {
  if (!current) return;
  const { ff } = current;
  current = null;
  try { ff.stdin.end(); } catch (e) {}
  setTimeout(() => { try { ff.kill("SIGKILL"); } catch (e) {} }, 3000);
}

wss.on("connection", (ws, req) => {
  const k = new URL(req.url, "http://x").searchParams.get("k") || "";
  if (!SECRET || k !== SECRET) {
    ws.close(4001, "wrong code");
    log("Ghalat live code se koshish - rok di.");
    return;
  }
  stopCurrent();
  log("Phone jur gaya. YouTube ko bhej raha hoon...");

  const args = [
    "-hide_banner", "-loglevel", "error", "-stats", "-stats_period", "2",
    "-fflags", "+genpts+nobuffer", "-thread_queue_size", "1024",
    "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-keyint_min", "60",
    "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-f", "flv", target(),
  ];
  const ff = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
  const me = { ws, ff };
  current = me;
  let lastErr = "";
  let lastStat = 0;

  let buf = "";
  ff.stderr.on("data", (d) => {
    // ffmpeg writes its progress in pieces; read whole lines only.
    buf += d.toString();
    const lines = buf.split(/[\r\n]+/);
    buf = lines.pop();
    for (const line of lines) {
      const m = line.match(/frame=\s*(\d+).*?fps=\s*([\d.]+).*?time=\s*([\d:.-]+)/);
      if (m) {
        if (Date.now() - lastStat > 9000) { lastStat = Date.now(); log("Live chal raha hai - " + m[3] + " (fps " + m[2] + ")"); }
        safeSend(ws, { live: true, fps: Number(m[2]), time: m[3] });
      } else if (line.trim()) {
        lastErr = line.trim();
      }
    }
  });
  ff.on("close", (code) => {
    if (current === me) {
      current = null;
      const why = /Input\/output|Connection|refused|Broken pipe|RTMP|handshake|Server returned|opening output|Error number/i.test(lastErr)
        ? "YouTube ne nahi liya: stream key check karein aur YouTube Studio mein live ON hai?"
        : "Video ruk gayi" + (lastErr ? ": " + lastErr : "");
      log(why);
      safeSend(ws, { live: false, error: why });
      try { ws.close(); } catch (e) {}
    }
  });
  ff.stdin.on("error", () => {});

  ws.on("message", (data, isBinary) => {
    if (!isBinary) return;
    if (current !== me) return;
    try { ff.stdin.write(data); } catch (e) {}
  });
  ws.on("close", () => {
    if (current === me) { log("Phone ka rabta toota. Wapas judne ka intezar..."); stopCurrent(); }
  });
});

function safeSend(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {}
}

server.listen(PORT, "127.0.0.1", () => log("Relay tayyar (port " + PORT + ")."));
