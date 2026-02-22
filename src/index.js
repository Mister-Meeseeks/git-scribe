const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const { parseArgs, HELP_TEXT } = require('./parse_args');
const {
  getRepoRoot,
  getStagedFiles,
  getStagedDiff,
  getRecentCommitSubjects,
  commitWithFile,
  getCommitAllChanges,
} = require('./git');
const { readGuidance } = require('./read_guidance');
const { buildPrompt } = require('./prompt');
const { resolveLLMConfig, generateCommitMessage } = require('./llm');
const { openEditor, resolveEditorCommand } = require('./editor');
const { createSpinner } = require('./spinner');
const { version: packageVersion } = require('./version');

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

async function createTempMessageFile(initialMessage) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-scribe-'));
  const filePath = path.join(dir, 'COMMIT_MESSAGE.txt');
  await fs.writeFile(filePath, ensureTrailingNewline(initialMessage), 'utf8');
  const cleanup = async () => {
    await fs.rm(dir, { recursive: true, force: true });
  };
  return { filePath, cleanup };
}

function printMessagePreview(message) {
  console.log('----- Commit message -----');
  console.log(message);
  console.log('----------------------');
  console.log('');
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function askQuestion(rl, promptText, { transform } = {}) {
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      if (transform) {
        resolve(transform(answer));
        return;
      }
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function interactiveCommit({
  repoRoot,
  commitArgs,
  initialMessage,
  editorPreference,
  requestNewDraft,
  commitWithFileImpl = commitWithFile,
}) {
  const { filePath, cleanup } = await createTempMessageFile(initialMessage);
  let currentMessage = initialMessage;
  const editorCommand = resolveEditorCommand(editorPreference);
  const rl = createInterface();

  try {
    while (true) {
      printMessagePreview(currentMessage);
      const answer = await askQuestion(
        rl,
        'Commit this message? (y) commit, (n) abort, (e) edit, (+) more detail, (-) less detail, (i) instructions: ',
      );
      if (answer === 'y') {
        await fs.writeFile(filePath, ensureTrailingNewline(currentMessage), 'utf8');
        await commitWithFileImpl(repoRoot, filePath, commitArgs);
        console.log('Commit created.');
        break;
      }
      if (answer === 'n') {
        console.log('Aborting commit.');
        break;
      }
      if (answer === 'e') {
        await fs.writeFile(filePath, ensureTrailingNewline(currentMessage), 'utf8');
        try {
          await openEditor(filePath, editorCommand);
          currentMessage = await fs.readFile(filePath, 'utf8');
        } catch (error) {
          console.error(`Failed to launch editor: ${error.message}`);
        }
        continue;
      }
      if ((answer === '+' || answer === '-' || answer === 'i') && !requestNewDraft) {
        console.log('Regeneration is unavailable in this context.');
        continue;
      }
      if (answer === '+') {
        try {
          currentMessage = await requestNewDraft({ type: 'more_detail', previousMessage: currentMessage });
        } catch (error) {
          console.error(`Failed to regenerate commit message: ${error.message}`);
        }
        continue;
      }
      if (answer === '-') {
        try {
          currentMessage = await requestNewDraft({ type: 'less_detail', previousMessage: currentMessage });
        } catch (error) {
          console.error(`Failed to regenerate commit message: ${error.message}`);
        }
        continue;
      }
      if (answer === 'i') {
        const extraInstruction = await askQuestion(rl, 'Enter additional instruction: ', {
          transform: (value) => value.trim(),
        });
        if (!extraInstruction) {
          console.log('Instruction cannot be empty.');
          continue;
        }
        try {
          currentMessage = await requestNewDraft({
            type: 'custom',
            previousMessage: currentMessage,
            instructionText: extraInstruction,
          });
        } catch (error) {
          console.error(`Failed to regenerate commit message: ${error.message}`);
        }
        continue;
      }
      console.log('Please answer with y, n, e, +, -, or i.');
    }
  } finally {
    rl.close();
    await cleanup();
  }
}

async function commitWithoutPrompt({
  repoRoot,
  commitArgs,
  message,
  commitWithFileImpl = commitWithFile,
}) {
  const { filePath, cleanup } = await createTempMessageFile(message);
  try {
    await commitWithFileImpl(repoRoot, filePath, commitArgs);
    console.log('Commit created.');
  } finally {
    await cleanup();
  }
}

function printDebugInfo(data) {
  console.log('[git-scribe] debug context:');
  console.log(JSON.stringify(data, null, 2));
}

function applyEnvOverrides(options, env = process.env) {
  const envMaxDiff = parseInt(env.SCRIBE_MAX_DIFF_CHARS || '', 10);
  if (!Number.isNaN(envMaxDiff) && envMaxDiff > 0) {
    options.maxDiffChars = envMaxDiff;
  }
  return options;
}

async function main(argv = process.argv.slice(2), overrides = {}) {
  const envVars = overrides.env || process.env;
  const parseArgsImpl = overrides.parseArgs || parseArgs;
  const getRepoRootImpl = overrides.getRepoRoot || getRepoRoot;
  const getStagedFilesImpl = overrides.getStagedFiles || getStagedFiles;
  const getStagedDiffImpl = overrides.getStagedDiff || getStagedDiff;
  const getRecentCommitSubjectsImpl = overrides.getRecentCommitSubjects || getRecentCommitSubjects;
  const commitWithFileImpl = overrides.commitWithFile || commitWithFile;
  const readGuidanceImpl = overrides.readGuidance || readGuidance;
  const buildPromptImpl = overrides.buildPrompt || buildPrompt;
  const resolveLLMConfigImpl =
    overrides.resolveLLMConfig || (({ env, overrides: configOverrides }) => resolveLLMConfig({ env, overrides: configOverrides }));
  const generateCommitMessageImpl = overrides.generateCommitMessage || generateCommitMessage;
  const createSpinnerImpl = overrides.createSpinner || ((label) => createSpinner({ text: label }));
  const getCommitAllChangesImpl = overrides.getCommitAllChanges || getCommitAllChanges;
  const interactiveCommitImpl =
    overrides.interactiveCommit ||
    ((params) => interactiveCommit({ ...params, commitWithFileImpl }));

  const { options, commitArgs } = parseArgsImpl(argv);
  if (options.helpRequested) {
    console.log(HELP_TEXT);
    return;
  }
  if (options.versionRequested) {
    console.log(`git-scribe ${packageVersion}`);
    return;
  }
  applyEnvOverrides(options, envVars);

  const repoRoot = await getRepoRootImpl();
  let stagedFiles;
  let diffRaw;

  if (options.commitAll) {
    const commitAllSnapshot = await getCommitAllChangesImpl(repoRoot);
    stagedFiles = commitAllSnapshot.files;
    diffRaw = commitAllSnapshot.diff;
  } else {
    stagedFiles = await getStagedFilesImpl(repoRoot);
    diffRaw = await getStagedDiffImpl(repoRoot);
  }

  if (stagedFiles.length === 0) {
    const message = options.commitAll
      ? 'No tracked changes found. Modify tracked files or stage files before running git-scribe.'
      : 'No staged changes found. Stage files before running git-scribe.';
    throw new Error(message);
  }

  if (!diffRaw.trim()) {
    throw new Error('Staged diff is empty.');
  }

  const diffTruncated = diffRaw.length > options.maxDiffChars;
  const diffForPrompt = diffTruncated
    ? `${diffRaw.slice(0, options.maxDiffChars)}\n\n[diff truncated at ${options.maxDiffChars} characters]`
    : diffRaw;

  const commitHistory = await getRecentCommitSubjectsImpl(repoRoot, options.historyDepth);
  const guidance = await readGuidanceImpl({
    repoRoot,
    extraPaths: options.guidancePaths,
    skipDefaultGuidance: options.skipDefaultGuidance,
  });

  const basePromptInput = {
    diff: diffForPrompt,
    stagedFiles,
    commitHistory,
    guidanceText: guidance.text,
    noBody: options.noBody,
    diffTruncated,
    guidanceTruncated: guidance.truncated,
  };

  const draftState = {
    instructions: [...options.instructions],
    detailLevel: options.detailLevel,
    promptNote: options.promptNote,
    revisionHistory: [],
  };

  const buildPromptFromState = () =>
    buildPromptImpl({
      ...basePromptInput,
      instructions: draftState.instructions,
      detailLevel: draftState.detailLevel,
      promptNote: draftState.promptNote,
      revisionHistory: draftState.revisionHistory,
    });

  const llmOverrides = {};
  if (options.model) {
    llmOverrides.model = options.model;
  }
  const llmConfig = resolveLLMConfigImpl({ env: envVars, overrides: llmOverrides });

  if (options.debug) {
    printDebugInfo({
      repoRoot,
      stagedFiles,
      instructions: draftState.instructions,
      guidanceFiles: guidance.files,
      diffTruncated,
      guidanceTruncated: guidance.truncated,
      historyDepth: options.historyDepth,
      commitArgs,
      model: llmConfig.model,
      commitAll: options.commitAll,
      detailLevel: draftState.detailLevel,
      promptNote: draftState.promptNote,
      tracePrompt: options.tracePrompt,
    });
  }

  const draftCommitMessage = async () => {
    const prompt = buildPromptFromState();
    if (options.tracePrompt) {
      console.log('----- Prompt sent to model -----');
      console.log(prompt);
      console.log('--------------------------------');
    }
    const spinner = createSpinnerImpl('Drafting commit message');
    spinner.start();
    try {
      const response = await generateCommitMessageImpl({ prompt, config: llmConfig });
      return response.message;
    } finally {
      spinner.stop();
    }
  };

  const requestNewDraft = async ({ type, previousMessage, instructionText }) => {
    if (!previousMessage) {
      throw new Error('Previous draft is required to request a new one.');
    }
    let reason;
    if (type === 'more_detail') {
      if (draftState.detailLevel < 5) {
        draftState.detailLevel += 1;
      }
      reason = 'User rejected this draft and requested a more detailed commit message.';
    } else if (type === 'less_detail') {
      if (draftState.detailLevel > 1) {
        draftState.detailLevel -= 1;
      }
      reason = 'User rejected this draft and requested a more succinct commit message.';
    } else if (type === 'custom') {
      const normalized = instructionText ? instructionText.trim() : '';
      if (!normalized) {
        throw new Error('Instruction text cannot be empty.');
      }
      draftState.instructions.push(normalized);
      reason = `User rejected this draft and requested the commit message be revised with: ${normalized}`;
    } else {
      throw new Error('Unknown regeneration request.');
    }
    draftState.revisionHistory.push({ message: previousMessage, reason });
    const nextDraft = await draftCommitMessage();
    return nextDraft;
  };

  let message = await draftCommitMessage();

  if (options.dryRun) {
    printMessagePreview(message);
    return;
  }

  if (options.autoApprove) {
    printMessagePreview(message);
    await commitWithoutPrompt({
      repoRoot,
      commitArgs,
      message,
      commitWithFileImpl,
    });
    return;
  }

  await interactiveCommitImpl({
    repoRoot,
    commitArgs,
    initialMessage: message,
    editorPreference: options.editor,
    requestNewDraft,
  });
}

module.exports = {
  main,
};
