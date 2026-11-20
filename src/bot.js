'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const C = {
  token: process.env.BOT_TOKEN,
  ownerId: process.env.OWNER_ID,
  ghOwner: process.env.GITHUB_OWNER || 'android-pixel-dev',
  ghRepo: process.env.GITHUB_REPO || 'ATHARREMOTE-os',
  ghToken: process.env.GITHUB_TOKEN,
  workflow: process.env.GITHUB_WORKFLOW || 'android-build.yml',
  branch: process.env.GITHUB_BRANCH || 'main',
  artifact: process.env.GITHUB_ARTIFACT_NAME || 'ATHAR-REMOTE-OS-APK',
  maxApk: 45 * 1024 * 1024
};

if (!C.token || !C.ownerId) {
  throw new Error('Missing BOT_TOKEN or OWNER_ID in src/.env or project .env');
}

const TG = 'https://api.telegram.org/bot' + C.token;
const GH = 'https://api.github.com';
const repo = '/repos/' + encodeURIComponent(C.ghOwner) + '/' + encodeURIComponent(C.ghRepo);
const started = Date.now();
let offset = 0;
let activeBuild = null;
let stopping = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isOwner = user => user && String(user.id) === String(C.ownerId);
const elapsed = ms => {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
};
const indiaTime = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
const mb = n => (n / 1048576).toFixed(1) + ' MB';
const configured = () => !!C.ghToken;

async function tg(method, body) {
  const res = await fetch(TG + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(40000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.description || ('Telegram HTTP ' + res.status));
  return data.result;
}

async function send(chatId, text, extra) {
  return tg('sendMessage', Object.assign({
    chat_id: chatId, text, disable_web_page_preview: true
  }, extra || {}));
}

async function edit(chatId, messageId, text) {
  try {
    await tg('editMessageText', {
      chat_id: chatId, message_id: messageId,
      text, disable_web_page_preview: true
    });
  } catch (e) {
    if (!/message is not modified/i.test(e.message)) console.error('Edit:', e.message);
  }
}

async function gh(endpoint, options) {
  const o = options || {};
  const res = await fetch(GH + endpoint, {
    method: o.method || 'GET',
    headers: Object.assign({
      Authorization: 'Bearer ' + C.ghToken,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ATHAR-REMOTE-OS'
    }, o.headers || {}),
    body: o.body,
    signal: AbortSignal.timeout(45000)
  });
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch (_) { data = { message: raw.slice(0, 300) }; }
  if (!res.ok) throw new Error((data.message || 'GitHub API error') + ' (HTTP ' + res.status + ')');
  return data;
}

const menuKeyboard = {
  inline_keyboard: [
    [
      { text: '🚀 Build APK', callback_data: 'build' },
      { text: '📊 Build Status', callback_data: 'status' }
    ],
    [
      { text: '📦 Latest APK', callback_data: 'latest' },
      { text: '🩺 Diagnostics', callback_data: 'health' }
    ],
    [
      { text: '📱 Devices', callback_data: 'devices' },
      { text: '🖥 Remote Support', callback_data: 'remote' }
    ],
    [
      { text: '🛡 Security', callback_data: 'security' },
      { text: '❓ Help', callback_data: 'help' }
    ]
  ]
};

async function menu(chatId) {
  return send(chatId,
    '⚡ ATHAR REMOTE OS\n━━━━━━━━━━━━━━━━━━\nPREMIUM OWNER DASHBOARD\n\n' +
    '🟢 Telegram bot: ONLINE\n' +
    (configured() ? '🟢 GitHub builder: CONFIGURED\n' : '🟡 GitHub builder: NOT CONFIGURED\n') +
    (activeBuild ? '🟠 Build: RUNNING\n' : '⚪ Build: IDLE\n') +
    '📱 Paired devices: 0\n\nChoose an action:',
    { reply_markup: menuKeyboard }
  );
}

async function runs() {
  const data = await gh(repo + '/actions/runs?branch=' + encodeURIComponent(C.branch) + '&per_page=10');
  return data.workflow_runs || [];
}

async function latestRun() {
  const list = await runs();
  return list.find(r => r.path && r.path.endsWith('/' + C.workflow)) || list[0] || null;
}

function runText(r) {
  if (!r) return 'No GitHub Actions build found.';
  return '🧾 LATEST BUILD\n\nRun: #' + r.run_number +
    '\nStatus: ' + String(r.status === 'completed' ? r.conclusion : r.status).toUpperCase() +
    '\nTrigger: ' + r.event +
    '\nStarted: ' + new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) +
    '\nRun page: ' + r.html_url;
}

async function status(chatId) {
  if (activeBuild) {
    return send(chatId, '🚀 BUILD RUNNING\n\nStage: ' + activeBuild.stage +
      '\nElapsed: ' + elapsed(Date.now() - activeBuild.started) +
      '\n' + (activeBuild.url || 'Waiting for GitHub run ID') +
      '\n\nAPK will be sent here automatically.');
  }
  if (!configured()) return send(chatId, 'GitHub builder is not configured.');
  try { return send(chatId, runText(await latestRun())); }
  catch (e) { return send(chatId, 'Status lookup failed:\n' + e.message); }
}

async function latest(chatId) {
  if (!configured()) return send(chatId, 'GitHub builder is not configured.');
  try {
    const r = await latestRun();
    if (!r) return send(chatId, 'No workflow run found.');
    let text = runText(r);
    if (r.status !== 'completed' || r.conclusion !== 'success') {
      return send(chatId, text + '\n\nNo successful APK artifact in this run.');
    }
    const data = await gh(repo + '/actions/runs/' + r.id + '/artifacts');
    const a = (data.artifacts || []).find(x => x.name === C.artifact && !x.expired);
    if (!a) return send(chatId, text + '\n\nArtifact not found or expired.');
    return send(chatId, text + '\n\n📦 ' + a.name + '\nSize: ' + mb(a.size_in_bytes) +
      '\nExpires: ' + new Date(a.expires_at).toLocaleDateString('en-IN'));
  } catch (e) { return send(chatId, 'Latest lookup failed:\n' + e.message); }
}

async function findRun(since) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    const list = await runs();
    const r = list.find(x => x.event === 'workflow_dispatch' &&
      new Date(x.created_at).getTime() >= since - 15000 &&
      x.path && x.path.endsWith('/' + C.workflow));
    if (r) return r;
    await sleep(5000);
  }
  throw new Error('GitHub accepted the request but the workflow run did not appear.');
}

async function waitForRun(r, progress) {
  const until = Date.now() + 15 * 60 * 1000;

  while (Date.now() < until) {
    const current = await gh(repo + '/actions/runs/' + r.id);

    const data = await gh(
      repo + '/actions/runs/' + r.id + '/jobs?per_page=20'
    ).catch(() => ({ jobs: [] }));

    const steps = (data.jobs || []).flatMap(job =>
      (job.steps || []).map(step => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion
      }))
    );

    const total = steps.length;
    const completed = steps.filter(x => x.status === 'completed').length;
    const active = steps.find(x => x.status === 'in_progress');

    const percent = total
      ? Math.min(99, Math.floor((completed / total) * 100))
      : 0;

    const phase = active
      ? active.name
      : total && completed
        ? 'Completed ' + completed + ' of ' + total + ' steps'
        : current.status === 'queued'
          ? 'Waiting for GitHub runner'
          : 'Preparing build steps';

    if (current.status === 'completed') {
      await progress({
        kind: 'live',
        percent: current.conclusion === 'success' ? 100 : percent,
        completed,
        total,
        phase: current.conclusion === 'success'
          ? 'APK compilation complete'
          : 'Build ' + current.conclusion,
        url: r.html_url
      });

      return current;
    }

    await progress({
      kind: 'live',
      percent,
      completed,
      total,
      phase,
      url: r.html_url
    });

    await sleep(8000);
  }

  throw new Error('Build timed out after 15 minutes. Check GitHub Actions.');
}

function extractApk(zip) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'athar-apk-'));
  const file = path.join(dir, 'artifact.zip');
  try {
    fs.writeFileSync(file, zip);
    const names = execFileSync('unzip', ['-Z1', file], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024
    }).split(/\r?\n/).filter(Boolean);
    const entry = names.find(n => n.toLowerCase().endsWith('.apk') &&
      !n.startsWith('/') && !n.split('/').includes('..'));
    if (!entry) throw new Error('No APK found inside artifact ZIP.');
    const apk = execFileSync('unzip', ['-p', file, entry], {
      timeout: 60000, maxBuffer: C.maxApk
    });
    if (apk.length < 1000 || apk.length > C.maxApk || apk[0] !== 0x50 || apk[1] !== 0x4b) {
      throw new Error('APK validation failed or file is too large.');
    }
    return apk;
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('Missing unzip. Run: pkg install unzip');
    throw e;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function deliverApk(chatId, r, progress) {
  await progress('Finding APK artifact');
  const data = await gh(repo + '/actions/runs/' + r.id + '/artifacts');
  const artifact = (data.artifacts || []).find(a => a.name === C.artifact && !a.expired);
  if (!artifact) throw new Error('Artifact "' + C.artifact + '" is missing or expired.');

  await progress('Downloading artifact ZIP');
  const response = await fetch(GH + repo + '/actions/artifacts/' + artifact.id + '/zip', {
    headers: {
      Authorization: 'Bearer ' + C.ghToken,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error('Artifact download failed: HTTP ' + response.status);
  const zip = Buffer.from(await response.arrayBuffer());
  if (!zip.length || zip.length > 40 * 1024 * 1024) throw new Error('Artifact ZIP size is invalid.');

  await progress('Extracting and validating APK');
  const apk = extractApk(zip);
  await progress('Uploading APK to Telegram');

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', '✅ ATHAR REMOTE OS — APK BUILD SUCCESS\n' +
    'Workflow run: #' + r.run_number + '\nAPK size: ' + mb(apk.length) +
    '\n\nInstall only on your own device and review Android permission prompts.');
  form.append('document', new Blob([apk], { type: 'application/vnd.android.package-archive' }), 'ATHAR-REMOTE-OS.apk');

  const sent = await fetch(TG + '/sendDocument', {
    method: 'POST', body: form, signal: AbortSignal.timeout(120000)
  });
  const result = await sent.json().catch(() => ({}));
  if (!sent.ok || !result.ok) throw new Error(result.description || 'Telegram file upload failed.');
}

async function build(chatId) {
  if (!configured()) {
    return send(chatId, 'GitHub setup incomplete. Required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO. Never send tokens in Telegram.');
  }
  if (activeBuild) return send(chatId, '⏳ A build is already running. Stage: ' + activeBuild.stage);

  const msg = await send(chatId, '🚀 Starting ATHAR REMOTE OS APK build...');
  activeBuild = { started: Date.now(), stage: 'Preparing', url: null };

  (async () => {
    let lastProgressEdit = 0;

    const progress = async update => {
      if (!activeBuild) return;

      const runtime = elapsed(Date.now() - activeBuild.started);
      let body = '';

      if (typeof update === 'string') {
        activeBuild.stage = update;

        body = [
          '⚡ ATHAR REMOTE OS',
          'BUILD CONTROL CENTER',
          '━━━━━━━━━━━━━━━━━━',
          '',
          '🟠 BUILD PIPELINE ACTIVE',
          '',
          'Stage: ' + update,
          'Runtime: ' + runtime,
          '',
          'GitHub Actions: connected',
          'APK delivery: pending',
          '',
          'Live workflow tracking is active.'
        ].join('\n');
      } else {
        const percent = Math.max(0, Math.min(100, update.percent || 0));
        const filled = Math.round(percent / 10);
        const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

        activeBuild.stage = update.phase || 'Building';

        body = [
          '⚡ ATHAR REMOTE OS',
          'BUILD CONTROL CENTER',
          '━━━━━━━━━━━━━━━━━━',
          '',
          bar + '  ' + percent + '%',
          '',
          'Completed steps: ' + update.completed + '/' + update.total,
          'Current stage: ' + activeBuild.stage,
          'Runtime: ' + runtime,
          '',
          '🟢 GitHub Actions connected',
          '📦 APK delivery: ' + (percent === 100 ? 'Preparing' : 'Waiting'),
          '',
          update.url || ''
        ].join('\n');
      }

      if (Date.now() - lastProgressEdit < 2500) return;
      lastProgressEdit = Date.now();

      await edit(chatId, msg.message_id, body);
    };

    try {
      const requestTime = Date.now();
      await progress('Dispatching GitHub Actions');
      await gh(repo + '/actions/workflows/' + encodeURIComponent(C.workflow) + '/dispatches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: C.branch })
      });
      await progress('Waiting for workflow run');
      const r = await findRun(requestTime);
      activeBuild.url = r.html_url;
      await progress('Build running on GitHub');
      const done = await waitForRun(r, progress);

      if (done.conclusion !== 'success') {
        await edit(chatId, msg.message_id,
          '❌ APK BUILD FAILED\n\nConclusion: ' + done.conclusion +
          '\nRun: ' + done.html_url + '\n\nOpen the run to inspect the failed step.');
        return;
      }
      await deliverApk(chatId, done, progress);
      await edit(chatId, msg.message_id,
        '✅ BUILD COMPLETE\n\nAPK sent above as a Telegram file.\nWorkflow run: #' +
        done.run_number + '\nTotal time: ' + elapsed(Date.now() - activeBuild.started) +
        '\n\nUse /latest for build details.');
    } catch (e) {
      console.error('Build pipeline:', e.stack || e.message);
      await edit(chatId, msg.message_id,
        '❌ BUILD PIPELINE ERROR\n\n' + e.message +
        '\n\nUse /status to inspect the GitHub run. Secrets are not displayed.');
    } finally {
      activeBuild = null;
    }
  })().catch(e => { console.error(e); activeBuild = null; });
}

async function health(chatId) {
  const m = process.memoryUsage();
  return send(chatId, '🩺 BOT DIAGNOSTICS\n\nService: ONLINE\nNode: ' + process.version +
    '\nPlatform: ' + process.platform + '/' + process.arch +
    '\nUptime: ' + elapsed(Date.now() - started) +
    '\nRAM: ' + mb(m.rss) + '\nHeap: ' + mb(m.heapUsed) +
    '\nGitHub config: ' + (configured() ? 'READY' : 'MISSING') +
    '\nBuild lock: ' + (activeBuild ? 'ACTIVE' : 'IDLE') +
    '\nIndia time: ' + indiaTime());
}

async function action(name, chatId) {
  switch (name) {
    case 'menu': return menu(chatId);
    case 'build': return build(chatId);
    case 'status': return status(chatId);
    case 'latest': return latest(chatId);
    case 'health': return health(chatId);
    case 'devices': return send(chatId, '📱 DEVICE MANAGER\n\nPaired devices: 0\nSecure pairing is not implemented in this starter APK yet.');
    case 'remote': return send(chatId, '🖥 REMOTE SUPPORT\n\nScreen sharing and remote actions are not active yet. Future sessions will require visible Android consent and a clear stop control.');
    case 'security': return send(chatId, '🛡 SECURITY CENTER\n\nOwner-only commands: ON\nUnauthorized users: BLOCKED\nSecrets in chat: NEVER\nDuplicate build lock: ON\nAndroid screen capture: explicit user consent required\nDevice owner keeps uninstall/control authority.');
    case 'uptime': return send(chatId, '⏱ Bot uptime: ' + elapsed(Date.now() - started));
    case 'ping': {
      const t = Date.now();
      await tg('getMe', {});
      return send(chatId, '🌐 Telegram API: ONLINE\nLatency: ' + (Date.now() - t) + ' ms');
    }
    case 'time': return send(chatId, '🕒 India time: ' + indiaTime());
    case 'help': return send(chatId,
      '⚡ ATHAR REMOTE OS COMMANDS\n\n' +
      '/start — Premium dashboard\n/menu — Dashboard\n/build apk — Build and receive APK\n' +
      '/status — Build status\n/latest — Latest artifact details\n/health — Diagnostics\n' +
      '/devices — Device manager\n/remote — Remote support info\n/security — Security center\n' +
      '/uptime — Bot uptime\n/ping — Telegram API check\n/time — India time\n/id — Telegram ID\n/help — Commands\n\nOwner-only access is enabled.');
    default: return send(chatId, 'Unknown command. Send /help.');
  }
}

async function handleMessage(m) {
  if (!m || !isOwner(m.from) || !m.text) return;
  const p = m.text.trim().split(/\s+/);
  const cmd = (p[0] || '').split('@')[0].toLowerCase();
  const map = {
    '/status': 'status', '/latest': 'latest', '/health': 'health',
    '/devices': 'devices', '/device': 'devices', '/remote': 'remote',
    '/security': 'security', '/uptime': 'uptime', '/ping': 'ping',
    '/time': 'time', '/help': 'help'
  };
  if (cmd === '/start' || cmd === '/menu') return menu(m.chat.id);
  if (cmd === '/id') return send(m.chat.id, 'Your Telegram ID: ' + m.from.id);
  if (cmd === '/build') {
    if ((p[1] || '').toLowerCase() !== 'apk') return send(m.chat.id, 'Usage: /build apk');
    return build(m.chat.id);
  }
  if (map[cmd]) return action(map[cmd], m.chat.id);
  return send(m.chat.id, 'Command not recognized. Send /help.');
}

async function handleCallback(q) {
  if (!q || !isOwner(q.from)) {
    if (q) await tg('answerCallbackQuery', {
      callback_query_id: q.id, text: 'Unauthorized', show_alert: true
    }).catch(() => {});
    return;
  }
  await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (q.message) return action(q.data, q.message.chat.id);
}

async function main() {
  const me = await tg('getMe', {});
  await tg('deleteWebhook', { drop_pending_updates: false });
  await tg('setMyCommands', { commands: [
    { command: 'start', description: 'Premium dashboard' },
    { command: 'menu', description: 'Open dashboard' },
    { command: 'build', description: 'Build and receive APK' },
    { command: 'status', description: 'Build status' },
    { command: 'latest', description: 'Latest APK details' },
    { command: 'health', description: 'Bot diagnostics' },
    { command: 'devices', description: 'Device manager' },
    { command: 'remote', description: 'Remote support' },
    { command: 'security', description: 'Security center' },
    { command: 'uptime', description: 'Bot uptime' },
    { command: 'ping', description: 'Telegram API latency' },
    { command: 'time', description: 'India time' },
    { command: 'id', description: 'Telegram ID' },
    { command: 'help', description: 'Command guide' }
  ]});
  console.log('ATHAR REMOTE OS PREMIUM BOT online as @' + me.username);
  console.log('GitHub builder: ' + (configured() ? 'READY' : 'MISSING'));
  while (!stopping) {
    try {
      const updates = await tg('getUpdates', {
        offset, timeout: 25, allowed_updates: ['message', 'callback_query']
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await handleMessage(u.message);
          if (u.callback_query) await handleCallback(u.callback_query);
        } catch (e) { console.error('Update error:', e.message); }
      }
    } catch (e) {
      console.error('Polling error:', e.message);
      await sleep(3000);
    }
  }
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
main().catch(e => { console.error('Startup error:', e.stack || e.message); process.exit(1); });
