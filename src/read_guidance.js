const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_GUIDANCE_FILES = ['AGENTS.md', 'CLAUDE.md'];
const MAX_GUIDANCE_CHARS = 4000;

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null;
    }
    throw error;
  }
}

async function readSingleFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  if (raw.length <= MAX_GUIDANCE_CHARS) {
    return { content: raw.trim(), truncated: false };
  }
  return {
    content: `${raw.slice(0, MAX_GUIDANCE_CHARS)}\n\n[truncated at ${MAX_GUIDANCE_CHARS} characters]`,
    truncated: true,
  };
}

async function readGuidance({ repoRoot, extraPaths = [], skipDefaultGuidance = false }) {
  const allPaths = [];
  if (!skipDefaultGuidance) {
    allPaths.push(...DEFAULT_GUIDANCE_FILES.map((file) => path.join(repoRoot, file)));
  }
  allPaths.push(...extraPaths.map((p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p))));

  const seen = new Set();
  const included = [];
  const sections = [];
  let truncated = false;

  for (const filePath of allPaths) {
    const resolved = path.normalize(filePath);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    const stats = await safeStat(resolved);
    if (!stats || !stats.isFile()) {
      continue;
    }
    const relativeLabel = path.relative(repoRoot, resolved) || path.basename(resolved);
    const { content, truncated: fileTruncated } = await readSingleFile(resolved);
    truncated = truncated || fileTruncated;
    sections.push(`# ${relativeLabel}\n${content.trim()}`);
    included.push(resolved);
  }

  return {
    text: sections.join('\n\n') || '',
    files: included,
    truncated,
  };
}

module.exports = {
  readGuidance,
  DEFAULT_GUIDANCE_FILES,
  MAX_GUIDANCE_CHARS,
};
