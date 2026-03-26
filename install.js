#!/usr/bin/env node
// Install script — copies hooks and updates ~/.claude/settings.json

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const INSTALL_DIR = path.join(CLAUDE_DIR, 'session-tracker');
const HOOKS_DIR = path.join(INSTALL_DIR, 'hooks');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

const HOOK_FILES = ['statusline.js', 'session-end.js', 'context-monitor.js'];

function log(msg) { console.log(`  ${msg}`); }

// 1. Copy hook files
log('Installing hooks...');
fs.mkdirSync(HOOKS_DIR, { recursive: true });
const srcHooks = path.join(__dirname, 'hooks');
for (const file of HOOK_FILES) {
  fs.copyFileSync(path.join(srcHooks, file), path.join(HOOKS_DIR, file));
  log(`  Copied ${file}`);
}

// 2. Load or create settings.json
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    console.error('Could not parse settings.json — backing up and starting fresh');
    fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak');
  }
}

if (!settings.hooks) settings.hooks = {};

// Use forward slashes for cross-platform node compatibility
const hooksPath = HOOKS_DIR.replace(/\\/g, '/');

// 3. Add Statusline hook
settings.hooks.Statusline = [{
  hooks: [{
    type: 'command',
    command: `node "${hooksPath}/statusline.js"`
  }]
}];

// 4. Add Stop hook (session end)
if (!settings.hooks.Stop) settings.hooks.Stop = [];
const stopCmd = `node "${hooksPath}/session-end.js"`;
const hasStop = settings.hooks.Stop.some(h =>
  h.hooks?.some(hh => hh.command === stopCmd)
);
if (!hasStop) {
  settings.hooks.Stop.push({ hooks: [{ type: 'command', command: stopCmd }] });
}

// 5. Add PostToolUse hook (context monitor)
if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
const postCmd = `node "${hooksPath}/context-monitor.js"`;
const hasPost = settings.hooks.PostToolUse.some(h =>
  h.hooks?.some(hh => hh.command === postCmd)
);
if (!hasPost) {
  settings.hooks.PostToolUse.push({ hooks: [{ type: 'command', command: postCmd }] });
}

// 6. Write updated settings
fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

log('');
log('Installation complete!');
log('');
log('Features enabled:');
log('  • Statusline: Session counter + current task + context progress bar');
log('  • Session tracking: Every session numbered and recorded');
log('  • Context monitor: Warns Claude when context window is running low');
log('');
log('Restart Claude Code to activate.');
