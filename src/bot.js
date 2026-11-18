
require("dotenv").config({ path: __dirname + "/.env" });

const token = process.env.BOT_TOKEN;
const ownerId = process.env.OWNER_ID;

if (!token || !ownerId) {
  throw new Error("Missing BOT_TOKEN or OWNER_ID in .env");
}

const API = `https://api.telegram.org/bot${token}`;
const startedAt = Date.now();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function telegram(method, body = {}) {
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35000)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${response.status}`);
  }

  return data.result;
}

function isOwner(user) {
  return user && String(user.id) === String(ownerId);
}

function uptime() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
}

function indiaTime() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  });
}

const keyboard = {
  inline_keyboard: [
    [
      { text: "📊 Status", callback_data: "status" },
      { text: "📱 Devices", callback_data: "devices" }
    ],
    [
      { text: "🖥 Remote Support", callback_data: "remote" },
      { text: "🩺 Diagnostics", callback_data: "health" }
    ],
    [
      { text: "⏱ Uptime", callback_data: "uptime" },
      { text: "🌐 Ping", callback_data: "ping" }
    ],
    [
      { text: "🕒 India Time", callback_data: "time" },
      { text: "🛡 Security", callback_data: "security" }
    ],
    [
      { text: "📦 Build APK", callback_data: "build" }
    ],
    [
      { text: "❓ Help", callback_data: "help" }
    ]
  ]
};

async function send(chatId, text, markup) {
  const body = {
    chat_id: chatId,
    text
  };

  if (markup) {
    body.reply_markup = markup;
  }

  return telegram("sendMessage", body);
}

async function menu(chatId) {
  return send(
    chatId,
    "⚡ ATHAR REMOTE OS V4\n\n" +
    "Private dashboard: ONLINE\n" +
    "Connected devices: 0\n" +
    "APK builder: GitHub setup pending\n\n" +
    "Select a feature:",
    keyboard
  );
}

async function devices(chatId) {
  return send(
    chatId,
    "📱 DEVICE MANAGER\n\n" +
    "No devices connected.\n\n" +
    "Devices will appear after secure companion-app pairing."
  );
}

async function remote(chatId) {
  return send(
    chatId,
    "🖥 REMOTE SUPPORT\n\n" +
    "Planned features:\n" +
    "• Live screen viewing\n" +
    "• User-approved remote touch control\n" +
    "• Secure device pairing\n" +
    "• Session start/stop controls\n\n" +
    "Screen sharing and control require visible approval on the Android device."
  );
}

async function health(chatId) {
  const memory = process.memoryUsage();
  const mb = n => (n / 1048576).toFixed(1);

  return send(
    chatId,
    "🩺 BOT DIAGNOSTICS\n\n" +
    `Node.js: ${process.version}\n` +
    `Platform: ${process.platform}\n` +
    `Architecture: ${process.arch}\n` +
    `Memory: ${mb(memory.rss)} MB\n` +
    `Heap: ${mb(memory.heapUsed)} MB\n` +
    `Uptime: ${uptime()}\n` +
    "Bot: ONLINE"
  );
}

async function ping(chatId) {
  const before = Date.now();

  await telegram("getMe");

  return send(
    chatId,
    `🌐 Telegram API responding\nLatency: ${Date.now() - before} ms`
  );
}

// GitHub Actions APK builder
async function buildApk(chatId) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const githubToken = process.env.GITHUB_TOKEN;
  const workflow = process.env.GITHUB_WORKFLOW || "android-build.yml";
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!owner || !repo || !githubToken) {
    return send(
      chatId,
      "⚙️ APK BUILDER\n\n" +
      "GitHub setup is not complete yet.\n\n" +
      "Required configuration:\n" +
      "GITHUB_OWNER\n" +
      "GITHUB_REPO\n" +
      "GITHUB_TOKEN\n\n" +
      "Next step: GitHub setup."
    );
  }

  try {
    await send(
      chatId,
      "🚀 ATHAR APK BUILDER\n\n" +
      "Sending build request to GitHub Actions..."
    );

    const url =
      `https://api.github.com/repos/${owner}/${repo}` +
      `/actions/workflows/${workflow}/dispatches`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: branch
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (response.status !== 204) {
      const errorText = await response.text();

      throw new Error(
        `GitHub returned ${response.status}: ${errorText.slice(0, 700)}`
      );
    }

    return send(
      chatId,
      "✅ BUILD REQUEST ACCEPTED\n\n" +
      "Project: ATHAR REMOTE OS\n" +
      "Output: Android APK\n" +
      "Status: Workflow triggered\n\n" +
      "Build result delivery will be configured in the next setup phase."
    );

  } catch (error) {
    console.error("APK build error:", error.message);

    return send(
      chatId,
      "❌ BUILD REQUEST FAILED\n\n" +
      error.message
    );
  }
}

async function action(name, chatId) {
  switch (name) {
    case "status":
      return send(
        chatId,
        "📊 SYSTEM STATUS\n\n" +
        "Bot: ONLINE\n" +
        `Uptime: ${uptime()}\n` +
        "Connected devices: 0\n" +
        "APK builder: GitHub setup pending"
      );

    case "devices":
      return devices(chatId);

    case "remote":
      return remote(chatId);

    case "health":
      return health(chatId);

    case "uptime":
      return send(chatId, `⏱ Bot uptime: ${uptime()}`);

    case "ping":
      return ping(chatId);

    case "time":
      return send(chatId, `🕒 India time: ${indiaTime()}`);

    case "build":
      return buildApk(chatId);

    case "security":
      return send(
        chatId,
        "🛡 SECURITY\n\n" +
        "Owner-only access: ON\n" +
        "Unauthorized users: BLOCKED\n" +
        "Bot token display: DISABLED\n" +
        "Device pairing: Secure approval required\n" +
        "Screen capture: User approval required\n" +
        "Remote control: User-approved sessions"
      );

    case "help":
      return send(
        chatId,
        "⚡ ATHAR REMOTE OS V4\n\n" +
        "/start - Dashboard\n" +
        "/menu - Dashboard\n" +
        "/status - System status\n" +
        "/devices - Device manager\n" +
        "/device - Device details\n" +
        "/remote - Remote support\n" +
        "/health - Diagnostics\n" +
        "/uptime - Bot uptime\n" +
        "/ping - Network test\n" +
        "/time - India time\n" +
        "/id - Telegram ID\n" +
        "/security - Security\n" +
        "/build apk - Build Android APK\n" +
        "/help - Help"
      );
  }
}

async function handleMessage(msg) {
  if (!msg.from || !isOwner(msg.from) || !msg.text) {
    return;
  }

  const parts = msg.text.trim().split(/\s+/);
  const command = parts[0].split("@")[0].toLowerCase();

  if (command === "/start" || command === "/menu") {
    return menu(msg.chat.id);
  }

  if (command === "/id") {
    return send(msg.chat.id, `Your Telegram ID: ${msg.from.id}`);
  }

  if (command === "/build") {
    if ((parts[1] || "").toLowerCase() !== "apk") {
      return send(msg.chat.id, "Usage:\n/build apk");
    }

    return buildApk(msg.chat.id);
  }

  const commands = [
    "/status",
    "/devices",
    "/device",
    "/remote",
    "/health",
    "/uptime",
    "/ping",
    "/time",
    "/security",
    "/help"
  ];

  if (commands.includes(command)) {
    const name = command === "/device"
      ? "devices"
      : command.slice(1);

    return action(name, msg.chat.id);
  }

  return send(msg.chat.id, "Unknown command. Send /help.");
}

async function handleCallback(query) {
  if (!query.from || !isOwner(query.from)) {
    return telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Unauthorized"
    });
  }

  await telegram("answerCallbackQuery", {
    callback_query_id: query.id
  });

  if (query.message) {
    return action(
      query.data,
      query.message.chat.id
    );
  }
}

async function startBot() {
  const me = await telegram("getMe");

  await telegram("deleteWebhook", {
    drop_pending_updates: false
  });

  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Open dashboard" },
      { command: "menu", description: "Dashboard menu" },
      { command: "status", description: "System status" },
      { command: "devices", description: "Device manager" },
      { command: "device", description: "Device information" },
      { command: "remote", description: "Remote support" },
      { command: "health", description: "Diagnostics" },
      { command: "uptime", description: "Bot uptime" },
      { command: "ping", description: "Connection test" },
      { command: "time", description: "India time" },
      { command: "id", description: "Telegram ID" },
      { command: "security", description: "Security information" },
      { command: "build", description: "Build Android APK" },
      { command: "help", description: "Help" }
    ]
  });

  console.log(`ATHAR REMOTE OS V4 connected: @${me.username}`);

  let offset = 0;

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"]
      });

      for (const update of updates) {
        offset = update.update_id + 1;

        try {
          if (update.message) {
            await handleMessage(update.message);
          }

          if (update.callback_query) {
            await handleCallback(update.callback_query);
          }

        } catch (error) {
          console.error("Command error:", error.message);
        }
      }

    } catch (error) {
      console.error("Polling error:", error.message);
      await sleep(3000);
    }
  }
}

startBot().catch(error => {
  console.error("Startup error:", error.message);
  process.exit(1);
});
