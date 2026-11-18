
"use strict";

require("dotenv").config({
  path: require("path").join(__dirname, "../src/.env")
});

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { createRemoteView } = require("./remote-view");

const HOST = process.env.REMOTE_VIEW_HOST || "127.0.0.1";
const PORT = Number(process.env.REMOTE_VIEW_PORT || 8787);

const viewerToken = process.env.REMOTE_VIEW_TOKEN;
const deviceToken = process.env.REMOTE_DEVICE_TOKEN;

if (!viewerToken || !deviceToken) {
  throw new Error(
    "Missing REMOTE_VIEW_TOKEN or REMOTE_DEVICE_TOKEN in src/.env"
  );
}

if (viewerToken === deviceToken) {
  throw new Error("Viewer and device tokens must be different");
}

const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  const routes = {
    "/": "viewer.html",
    "/viewer.html": "viewer.html",
    "/remote.css": "remote.css"
  };

  const file = routes[pathname];

  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.join(root, file);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500);
      res.end("Unable to load viewer");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    });

    res.end(content);
  });
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 2 * 1024 * 1024,
  perMessageDeflate: false
});

wss.on("connection", (socket, request) => {
  const origin = request.headers.origin;

  if (origin) {
    try {
      const parsed = new URL(origin);

      if (parsed.host !== request.headers.host) {
        socket.close(4008, "Origin not allowed");
      }
    } catch {
      socket.close(4008, "Invalid origin");
    }
  }
});

const remoteView = createRemoteView(wss, {
  viewerToken,
  deviceToken
});

server.listen(PORT, HOST, () => {
  console.log("ATHAR REMOTE VIEW SERVER");
  console.log(`Address: ${HOST}:${PORT}`);
  console.log("WebSocket: /ws");
  console.log("Viewer authentication: ENABLED");
  console.log("Device authentication: ENABLED");
  console.log("Status:", remoteView.getStatus());
});

process.on("SIGINT", () => {
  console.log("\nStopping remote viewer...");

  wss.close();
  server.close(() => process.exit(0));
});
