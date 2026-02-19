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
      tracker.promptInputs = tracker.promptInputs || [];
      tracker.promptInputs.push(input);
      return `PROMPT\nDetail preference: Level ${input.detailLevel}\n${input.diff}`;
    },
    resolveLLMConfig: ({ overrides: configOverrides } = {}) => {
      tracker.llmConfigOverrides = configOverrides;
      return { apiKey: 'token', baseUrl: 'https://example.com/', model: configOverrides?.model || 'demo' };
    },
    generateCommitMessage: async ({ prompt }) => {
      tracker.promptText = prompt;
      tracker.promptTexts = tracker.promptTexts || [];
      tracker.promptTexts.push(prompt);
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
  assert.strictEqual(tracker.promptInput.detailLevel, 3);
  assert.strictEqual(tracker.promptInput.promptNote, null);
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

test('detail-level, prompt note, model short flags, and trace-prompt work together', async () => {
  const { overrides, tracker } = createStubEnvironment();
  const consoleCapture = captureLogs();
  try {
    await main(
      ['-R', '--trace-prompt', '-L', '5', '-P', 'Mention this was a major refactor', '-M', 'custom/model'],
      overrides,
    );
  } finally {
    consoleCapture.restore();
  }

  assert.strictEqual(tracker.promptInput.detailLevel, 5);
  assert.strictEqual(tracker.promptInput.promptNote, 'Mention this was a major refactor');
  assert.deepStrictEqual(tracker.llmConfigOverrides, { model: 'custom/model' });
  assert.ok(consoleCapture.logs.some((line) => line.includes('Prompt sent to model')));
  assert.ok(tracker.promptText.includes('Detail preference: Level 5'));
});

test('interactive regeneration with + increases detail level and includes feedback', async () => {
  const { overrides, tracker } = createStubEnvironment();
  let draftCount = 0;
  overrides.generateCommitMessage = async ({ prompt }) => {
    tracker.promptTexts = tracker.promptTexts || [];
    tracker.promptTexts.push(prompt);
    draftCount += 1;
    return { message: `Draft ${draftCount}` };
  };

  overrides.interactiveCommit = async ({ requestNewDraft, initialMessage }) => {
    tracker.regeneratedMessage = await requestNewDraft({
      type: 'more_detail',
      previousMessage: initialMessage,
    });
  };

  await main([], overrides);

  assert.strictEqual(draftCount, 2, 'should generate an initial and regenerated draft');
  assert.strictEqual(tracker.regeneratedMessage, 'Draft 2');
  assert.ok(tracker.promptInputs);
  assert.strictEqual(tracker.promptInputs.length, 2);
  assert.strictEqual(tracker.promptInputs[1].detailLevel, 4);
  assert.ok(tracker.promptInputs[1].revisionHistory);
  assert.strictEqual(tracker.promptInputs[1].revisionHistory.length, 1);
  assert.ok(tracker.promptInputs[1].revisionHistory[0].reason.includes('more detailed'));
});

test('interactive regeneration with custom instructions appends context and feedback', async () => {
  const { overrides, tracker } = createStubEnvironment();
  overrides.generateCommitMessage = async ({ prompt }) => {
    tracker.promptTexts = tracker.promptTexts || [];
    tracker.promptTexts.push(prompt);
    return { message: 'Updated draft' };
  };
  overrides.interactiveCommit = async ({ requestNewDraft, initialMessage }) => {
    await requestNewDraft({
      type: 'custom',
      previousMessage: initialMessage,
      instructionText: 'Highlight the new API contract',
    });
  };

  await main([], overrides);

  assert.ok(Array.isArray(tracker.promptInputs));
  assert.strictEqual(tracker.promptInputs.length, 2);
  assert.ok(tracker.promptInputs[1].instructions.includes('Highlight the new API contract'));
  assert.strictEqual(tracker.promptInputs[1].revisionHistory.length, 1);
  assert.ok(tracker.promptInputs[1].revisionHistory[0].reason.includes('Highlight the new API contract'));
});
