
"use strict";

const crypto = require("crypto");

const MAX_FRAME_SIZE = 1024 * 1024;
const MAX_FPS_INTERVAL = 200;

function secureCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return first.length === second.length &&
    crypto.timingSafeEqual(first, second);
}

function createRemoteView(wss, config) {
  const viewers = new Set();
  let device = null;
  let lastFrameAt = 0;

  function send(socket, payload) {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify(payload));
    }
  }

  function broadcast(payload) {
    for (const viewer of viewers) {
      send(viewer, payload);
    }
  }

  function updateStatus() {
    broadcast({
      type: "status",
      deviceConnected: Boolean(device)
    });
  }

  wss.on("connection", socket => {
    socket.role = null;

    const authTimeout = setTimeout(() => {
      if (!socket.role) {
        socket.close(4001, "Authentication timeout");
      }
    }, 10000);

    socket.on("message", (raw, isBinary) => {
      try {
        if (isBinary) {
          socket.close(4002, "Binary messages not accepted");
          return;
        }

        const message = JSON.parse(raw.toString());

        if (!socket.role) {
          if (message.type !== "auth") {
            socket.close(4003, "Authentication required");
            return;
          }

          if (message.role === "viewer" &&
              secureCompare(message.token, config.viewerToken)) {
            socket.role = "viewer";
            viewers.add(socket);
            clearTimeout(authTimeout);

            send(socket, {
              type: "authenticated",
              role: "viewer"
            });

            send(socket, {
              type: "status",
              deviceConnected: Boolean(device)
            });

            return;
          }

          if (message.role === "device" &&
              secureCompare(message.token, config.deviceToken)) {

            if (device && device.readyState === 1) {
              send(socket, {
                type: "error",
                message: "Another device session is already active"
              });
              socket.close(4004, "Device already connected");
              return;
            }

            socket.role = "device";
            device = socket;
            clearTimeout(authTimeout);

            send(socket, {
              type: "authenticated",
              role: "device"
            });

            updateStatus();
            return;
          }

          socket.close(4005, "Invalid credentials");
          return;
        }

        if (socket.role === "device" && message.type === "frame") {
          if (message.mime !== "image/jpeg" ||
              typeof message.data !== "string") {
            return;
          }

          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(message.data)) {
            return;
          }

          const size = Buffer.byteLength(message.data, "base64");

          if (!size || size > MAX_FRAME_SIZE) {
            return;
          }

          const now = Date.now();

          if (now - lastFrameAt < MAX_FPS_INTERVAL) {
            return;
          }

          lastFrameAt = now;

          broadcast({
            type: "frame",
            mime: "image/jpeg",
            data: message.data
          });

          return;
        }

      } catch (error) {
        console.error("Remote view message error:", error.message);
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimeout);

      if (socket.role === "viewer") {
        viewers.delete(socket);
      }

      if (socket === device) {
        device = null;
        updateStatus();
      }
    });

    socket.on("error", error => {
      console.error("WebSocket error:", error.message);
    });
  });

  return {
    getStatus() {
      return {
        deviceConnected: Boolean(device),
        viewerCount: viewers.size
      };
    }
  };
}

module.exports = { createRemoteView };
