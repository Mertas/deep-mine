const { execSync } = require('child_process');

const PORT = process.argv[2] || '3000';

try {
  if (process.platform === 'win32') {
    const output = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', stdio: 'pipe' });
    const lines = output.trim().split('\n').filter(l => l.includes('LISTENING'));
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== String(process.pid)) {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        console.log(`Killed process ${pid} on port ${PORT}`);
      } catch {}
    }
  } else {
    try {
      execSync(`lsof -ti tcp:${PORT} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
    } catch {}
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null`, { stdio: 'pipe' });
    } catch {}
  }
  console.log(`Port ${PORT} is free`);
} catch (e) {
  console.log(`Port ${PORT} is free (nothing to kill)`);
}
