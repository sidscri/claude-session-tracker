#!/usr/bin/env node
// Stop hook — records session end time in session data

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude', 'session-tracker');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

const stdinTimeout = setTimeout(() => process.exit(0), 3000);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id || '';
    if (!sessionId) process.exit(0);

    if (!fs.existsSync(DATA_FILE)) process.exit(0);

    const sessionData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const session = sessionData.sessions.find(s => s.id === sessionId);
    if (session && !session.end) {
      session.end = new Date().toISOString();
      fs.writeFileSync(DATA_FILE, JSON.stringify(sessionData, null, 2));
    }
  } catch (e) {}
  process.exit(0);
});
