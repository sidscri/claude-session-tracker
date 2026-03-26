#!/usr/bin/env node
// Claude Code Statusline
// Shows: session count | current task | directory | context progress bar

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.claude', 'session-tracker');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { count: 0, sessions: [] };
}

function saveData(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

// Timeout guard for Windows/Git Bash pipe issues
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const sessionId = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

    // --- SESSION COUNTER ---
    let sessionNum = '';
    if (sessionId) {
      const sessionData = loadData();
      const existing = sessionData.sessions.find(s => s.id === sessionId);
      if (!existing) {
        sessionData.count += 1;
        sessionData.sessions.push({
          id: sessionId,
          start: new Date().toISOString(),
          num: sessionData.count
        });
        // Keep only last 100 sessions to avoid unbounded growth
        if (sessionData.sessions.length > 100) {
          sessionData.sessions = sessionData.sessions.slice(-100);
        }
        saveData(sessionData);
        sessionNum = sessionData.count;
      } else {
        sessionNum = existing.num;
      }
    }

    // --- CONTEXT PROGRESS BAR ---
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctxBar = '';
    if (remaining != null) {
      const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      // Write bridge file for context-monitor hook
      if (sessionId) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${sessionId}.json`);
          fs.writeFileSync(bridgePath, JSON.stringify({
            session_id: sessionId,
            remaining_percentage: remaining,
            used_pct: used,
            timestamp: Math.floor(Date.now() / 1000)
          }));
        } catch (e) {}
      }

      const filled = Math.floor(used / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      if (used < 50) {
        ctxBar = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctxBar = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctxBar = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctxBar = ` \x1b[5;31m💀 ${bar} ${used}%\x1b[0m`;
      }
    }

    // --- CURRENT TASK (from Claude Code's built-in todo system) ---
    let task = '';
    const todosDir = path.join(claudeDir, 'todos');
    if (sessionId && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(sessionId) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
          const inProgress = todos.find(t => t.status === 'in_progress');
          if (inProgress) task = inProgress.activeForm || inProgress.content || '';
          // Truncate long tasks
          if (task.length > 40) task = task.substring(0, 37) + '...';
        }
      } catch (e) {}
    }

    // --- TASK PROGRESS (completed / total from todos) ---
    let taskProgress = '';
    const todosDir2 = path.join(claudeDir, 'todos');
    if (sessionId && fs.existsSync(todosDir2)) {
      try {
        const files = fs.readdirSync(todosDir2)
          .filter(f => f.startsWith(sessionId) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir2, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const todos = JSON.parse(fs.readFileSync(path.join(todosDir2, files[0].name), 'utf8'));
          const total = todos.length;
          const done = todos.filter(t => t.status === 'completed').length;
          if (total > 0) {
            const pct = Math.round((done / total) * 100);
            const filled = Math.floor(pct / 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            taskProgress = ` \x1b[36m[${bar}] ${done}/${total}\x1b[0m`;
          }
        }
      } catch (e) {}
    }

    // --- BUILD OUTPUT ---
    const dirname = path.basename(dir);
    const sessionStr = sessionNum ? `\x1b[35m#${sessionNum}\x1b[0m │ ` : '';
    const modelStr = `\x1b[2m${model}\x1b[0m`;
    const dirStr = `\x1b[2m${dirname}\x1b[0m`;
    const taskStr = task ? ` │ \x1b[1m${task}\x1b[0m` : '';

    process.stdout.write(`${sessionStr}${modelStr}${taskStr}${taskProgress} │ ${dirStr}${ctxBar}`);

  } catch (e) {
    // Silent fail
  }
});
