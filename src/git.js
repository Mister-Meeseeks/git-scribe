const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

async function runGit(args, { cwd, trim = false, env } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: DEFAULT_MAX_BUFFER,
      env: env ? { ...process.env, ...env } : process.env,
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

async function getStagedFiles(cwd, { env } = {}) {
  const output = await runGit(['diff', '--cached', '--name-only'], { cwd, trim: true, env });
  if (!output) {
    return [];
  }
  return output.split('\n').filter(Boolean);
}

async function getStagedDiff(cwd, { env } = {}) {
  return runGit(['diff', '--cached'], { cwd, trim: false, env });
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

async function getCommitAllChanges(cwd) {
  return withTemporaryIndex(cwd, async (gitEnv) => {
    await runGit(['add', '-u'], { cwd, env: gitEnv });
    const files = await getStagedFiles(cwd, { env: gitEnv });
    const diff = await getStagedDiff(cwd, { env: gitEnv });
    return { files, diff };
  });
}

async function withTemporaryIndex(cwd, callback) {
  const gitDir = await runGit(['rev-parse', '--git-dir'], { cwd, trim: true });
  const resolvedGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(cwd, gitDir);
  const indexSource = path.join(resolvedGitDir, 'index');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-scribe-index-'));
  const tempIndex = path.join(tempDir, 'index');
  try {
    await fs.copyFile(indexSource, tempIndex);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(tempIndex, '');
    } else {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  const env = { GIT_INDEX_FILE: tempIndex };
  try {
    return await callback(env);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
  getCommitAllChanges,
  commitWithFile,
};
