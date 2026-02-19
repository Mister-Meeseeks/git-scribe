const DEFAULT_HISTORY_DEPTH = 10;
const DEFAULT_MAX_DIFF_CHARS = 20000;

const HELP_TEXT = `Usage: git-scribe [options] [-- git commit args]

Options:
  --dry-run                 Print the generated commit message and exit
  --debug                   Print context metadata before prompting
  --no-body                 Request a subject-only commit message
  -y, --yes                 Skip the approval prompt and commit immediately
  -i, --instruction <text>  Additional instruction for the model (repeatable)
  --history-depth <n>       Number of recent commit subjects to include (default ${DEFAULT_HISTORY_DEPTH})
  --guidance <path>         Additional guidance file (repeatable)
  --no-guidance             Skip automatic AGENTS.md/CLAUDE.md guidance
  --editor <command>        Override the editor command used for manual edits
  --max-diff-chars <n>      Cap the diff characters sent to the model (default ${DEFAULT_MAX_DIFF_CHARS})
  -h, --help                Show this help text
  --                        Pass remaining args to git commit`;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    debug: false,
    noBody: false,
    instructions: [],
    autoApprove: false,
    historyDepth: DEFAULT_HISTORY_DEPTH,
    guidancePaths: [],
    skipDefaultGuidance: false,
    editor: null,
    maxDiffChars: DEFAULT_MAX_DIFF_CHARS,
    helpRequested: false,
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
        options.dryRun = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--no-body':
        options.noBody = true;
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
      case '--history-depth': {
        const value = argv[++i];
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('history-depth must be a positive integer');
        }
        options.historyDepth = parsed;
        break;
      }
      case '--guidance': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --guidance');
        }
        options.guidancePaths.push(value);
        break;
      }
      case '--no-guidance':
        options.skipDefaultGuidance = true;
        break;
      case '--editor': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --editor');
        }
        options.editor = value;
        break;
      }
      case '--max-diff-chars': {
        const value = argv[++i];
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw new Error('max-diff-chars must be a positive integer');
        }
        options.maxDiffChars = parsed;
        break;
      }
      case '-h':
      case '--help':
        options.helpRequested = true;
        break;
      default:
        commitArgs.push(token);
        break;
    }
  }

  return { options, commitArgs };
}

module.exports = {
  parseArgs,
  HELP_TEXT,
  DEFAULT_HISTORY_DEPTH,
  DEFAULT_MAX_DIFF_CHARS,
};
