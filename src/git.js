const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

async function runGit(args, { cwd, trim = false } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
    });
    return trim ? stdout.trim() : stdout;
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    const message = stderr || stdout || error.message;
    const command = ['git', ...args].join(' ');
    throw new Error(`${command} failed: ${message}`);
  }
}

async function getRepoRoot(cwd = process.cwd()) {
  return runGit(['rev-parse', '--show-toplevel'], { cwd, trim: true });
}

async function getStagedFiles(cwd) {
  const output = await runGit(['diff', '--cached', '--name-only'], { cwd, trim: true });
  if (!output) {
    return [];
  }
  return output.split('\n').filter(Boolean);
}

async function getStagedDiff(cwd) {
  return runGit(['diff', '--cached'], { cwd, trim: false });
}

async function getRecentCommitSubjects(cwd, limit = 10) {
  if (limit <= 0) {
    return [];
  }
  const output = await runGit(['log', `-n`, String(limit), '--pretty=%s'], { cwd, trim: true });
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function stageSummary(cwd) {
  const output = await runGit(['diff', '--cached', '--stat'], { cwd, trim: true });
  return output;
}

async function commitWithFile(cwd, messageFile, commitArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['commit', '-F', messageFile, ...commitArgs], {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git commit exited with code ${code}`));
      }
    });
  });
}

module.exports = {
  getRepoRoot,
  getStagedFiles,
  getStagedDiff,
  getRecentCommitSubjects,
  stageSummary,
  commitWithFile,
};
