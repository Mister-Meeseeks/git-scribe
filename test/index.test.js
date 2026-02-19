const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const { main } = require('../src/index');

function createStubEnvironment() {
  const tracker = {};
  const overrides = {
    env: {},
    getRepoRoot: async () => '/repo',
    getStagedFiles: async () => ['src/index.js'],
    getStagedDiff: async () => 'diff --git a/src/index.js b/src/index.js\n+test',
    getRecentCommitSubjects: async () => ['Initial commit'],
    readGuidance: async () => ({
      text: '# AGENTS\n- guidance',
      files: ['/repo/AGENTS.md'],
      truncated: false,
    }),
    buildPrompt: (input) => {
      tracker.promptInput = input;
      return `PROMPT\n${input.diff}`;
    },
    resolveLLMConfig: () => ({ apiKey: 'token', baseUrl: 'https://example.com/', model: 'demo' }),
    generateCommitMessage: async ({ prompt }) => {
      tracker.promptText = prompt;
      return { message: 'Add tests' };
    },
    commitWithFile: async (cwd, filePath, commitArgs) => {
      tracker.commitCalls = tracker.commitCalls || [];
      tracker.commitCalls.push({
        cwd,
        filePath,
        commitArgs,
        contents: await fs.readFile(filePath, 'utf8'),
      });
    },
    interactiveCommit: async () => {
      tracker.interactiveCalls = (tracker.interactiveCalls || 0) + 1;
    },
    createSpinner: () => ({
      start() {},
      stop() {},
    }),
    getCommitAllChanges: async () => ({
      files: ['src/index.js'],
      diff: 'diff --git a/src/index.js b/src/index.js\n+test',
    }),
  };
  return { overrides, tracker };
}

function captureLogs() {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
  };
  return {
    logs,
    restore() {
      console.log = originalLog;
    },
  };
}

test('dry-run prints the generated message without committing', async () => {
  const { overrides, tracker } = createStubEnvironment();
  const consoleCapture = captureLogs();
  try {
    await main(['--dry-run'], overrides);
  } finally {
    consoleCapture.restore();
  }

  assert.ok(tracker.promptInput, 'prompt input should be provided to buildPrompt');
  assert.match(tracker.promptInput.diff, /diff --git/, 'diff should be forwarded to prompt');
  assert.strictEqual(tracker.interactiveCalls, undefined, 'interactive prompt should be skipped');
  assert.strictEqual(tracker.commitCalls, undefined, 'dry-run must not call git commit');
  assert.ok(
    consoleCapture.logs.some((line) => line.includes('Commit message')), 
    'preview output should be shown',
  );
});

test('--yes commits immediately using the generated message', async () => {
  const { overrides, tracker } = createStubEnvironment();
  const consoleCapture = captureLogs();
  try {
    await main(['--yes'], overrides);
  } finally {
    consoleCapture.restore();
  }

  assert.strictEqual(tracker.interactiveCalls, undefined, 'auto-approve skips the prompt');
  assert.ok(tracker.commitCalls, 'git commit should be invoked');
  assert.strictEqual(tracker.commitCalls.length, 1);
  const [commit] = tracker.commitCalls;
  assert.strictEqual(commit.cwd, '/repo');
  assert.deepStrictEqual(commit.commitArgs, []);
  assert.strictEqual(commit.contents.trim(), 'Add tests');
  assert.ok(consoleCapture.logs.some((line) => line.includes('Commit created.')));
});

test('-a uses tracked changes snapshot and forwards the flag to git commit', async () => {
  const { overrides, tracker } = createStubEnvironment();
  overrides.getCommitAllChanges = async () => {
    tracker.commitAllSnapshot = true;
    return {
      files: ['src/app.js'],
      diff: 'diff --git a/src/app.js b/src/app.js\n+console.log(1);',
    };
  };
  overrides.getStagedFiles = async () => {
    throw new Error('should not read staged files when -a is used');
  };
  overrides.getStagedDiff = async () => {
    throw new Error('should not read staged diff when -a is used');
  };

  const consoleCapture = captureLogs();
  try {
    await main(['-a', '--yes'], overrides);
  } finally {
    consoleCapture.restore();
  }

  assert.ok(tracker.commitAllSnapshot, 'commit-all snapshot should be used');
  assert.match(tracker.promptInput.diff, /console\.log/);
  assert.strictEqual(tracker.commitCalls.length, 1);
  assert.deepStrictEqual(tracker.commitCalls[0].commitArgs, ['-a']);
});
