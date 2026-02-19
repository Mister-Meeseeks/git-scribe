const DEFAULT_HISTORY_DEPTH = 10;
const DEFAULT_MAX_DIFF_CHARS = 20000;

const HELP_TEXT = `Usage: git-scribe [options] [-- git commit args]

Options:
  -R, --dry-run             Print the generated commit message and exit
  -X, --debug               Print context metadata before prompting
  -B, --no-body             Request a subject-only commit message
  -a, --all                 Include tracked unstaged changes (like git commit -a)
  -L, --detail-level <1-5>  Desired detail on a 1 (short) to 5 (detailed) scale (default 2)
  -P, --prompt-note <text>  Extra note to include in the model prompt
  -M, --model <name>        Override the model without changing env vars
  --trace-prompt            Print the full prompt sent to the model
  -y, --yes                 Skip the approval prompt and commit immediately
  -i, --instruction <text>  Additional instruction for the model (repeatable)
  -D, --history-depth <n>   Number of recent commit subjects to include (default ${DEFAULT_HISTORY_DEPTH})
  -G, --guidance <path>     Additional guidance file (repeatable)
  -N, --no-guidance         Skip automatic AGENTS.md/CLAUDE.md guidance
  -E, --editor <command>    Override the editor command used for manual edits
  -K, --max-diff-chars <n>  Cap the diff characters sent to the model (default ${DEFAULT_MAX_DIFF_CHARS})
  -h, --help                Show this help text
  --                        Pass remaining args to git commit`;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    debug: false,
    noBody: false,
    commitAll: false,
    detailLevel: 3,
    instructions: [],
    autoApprove: false,
    historyDepth: DEFAULT_HISTORY_DEPTH,
    guidancePaths: [],
    skipDefaultGuidance: false,
    editor: null,
    maxDiffChars: DEFAULT_MAX_DIFF_CHARS,
    helpRequested: false,
    promptNote: null,
    model: null,
    tracePrompt: false,
  };
  const commitArgs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      commitArgs.push(...argv.slice(i + 1));
      break;
    }

    switch (token) {
      case '--dry-run':
      case '-R':
        options.dryRun = true;
        break;
      case '--debug':
      case '-X':
        options.debug = true;
        break;
      case '--trace-prompt':
        options.tracePrompt = true;
        break;
      case '--no-body':
      case '-B':
        options.noBody = true;
        break;
      case '-a':
      case '--all':
        options.commitAll = true;
        commitArgs.push(token);
        break;
      case '-y':
      case '--yes':
        options.autoApprove = true;
        break;
      case '-i':
      case '--instruction': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --instruction');
        }
        options.instructions.push(value);
        break;
      }
      case '--detail-level':
      case '-L': {
        const value = argv[++i];
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 5) {
          throw new Error('detail-level must be an integer between 1 and 5');
        }
        options.detailLevel = parsed;
        break;
      }
      case '--prompt-note':
      case '-P': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --prompt-note');
        }
        options.promptNote = value;
        break;
      }
      case '--history-depth':
      case '-D': {
        const value = argv[++i];
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('history-depth must be a positive integer');
        }
        options.historyDepth = parsed;
        break;
      }
      case '--guidance':
      case '-G': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --guidance');
        }
        options.guidancePaths.push(value);
        break;
      }
      case '--no-guidance':
      case '-N':
        options.skipDefaultGuidance = true;
        break;
      case '--editor':
      case '-E': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --editor');
        }
        options.editor = value;
        break;
      }
      case '--max-diff-chars':
      case '-K': {
        const value = argv[++i];
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('max-diff-chars must be a positive integer');
        }
        options.maxDiffChars = parsed;
        break;
      }
      case '--model':
      case '-M': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --model');
        }
        options.model = value;
        break;
      }
      case '-h':
      case '--help':
        options.helpRequested = true;
        break;
      default: {
        if (isCombinedShortFlag(token) && token.includes('a', 1)) {
          options.commitAll = true;
        }
        commitArgs.push(token);
        break;
      }
    }
  }

  return { options, commitArgs };
}

function isCombinedShortFlag(token) {
  return /^-[A-Za-z0-9]{2,}$/.test(token);
}

module.exports = {
  parseArgs,
  HELP_TEXT,
  DEFAULT_HISTORY_DEPTH,
  DEFAULT_MAX_DIFF_CHARS,
};
