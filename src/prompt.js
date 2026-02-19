function buildPrompt({
  diff,
  stagedFiles,
  commitHistory,
  instructions = [],
  guidanceText = '',
  noBody = false,
  diffTruncated = false,
  guidanceTruncated = false,
  detailLevel = 2,
  promptNote = null,
}) {
  const sections = [];

  sections.push(`You are an assistant that writes precise git commit messages. Use only the staged diff provided. Never speculate about changes that are not shown. Keep subjects under 72 characters, follow the repository style (imperative, no trailing period), and explain the why when helpful.`);

  if (typeof detailLevel === 'number') {
    sections.push(
      `Detail preference: Level ${detailLevel} out of 5 (1 = most succinct, 5 = most detailed). Match this level when determining how long and detailed of a final commit message to draft for the user.`,
    );
  }

  if (instructions.length > 0) {
    const bullets = instructions.map((item) => `- ${item}`).join('\n');
    sections.push(`User instructions / context hints:\n${bullets}`);
  }

  if (guidanceText) {
    sections.push(`Repository guidance:\n${guidanceText}`);
  }

  const filesBlock = stagedFiles.length > 0 ? stagedFiles.map((file) => `- ${file}`).join('\n') : 'None';
  sections.push(`Staged files:\n${filesBlock}`);

  const historyBlock = commitHistory.length > 0 ? commitHistory.map((subject, index) => `${index + 1}. ${subject}`).join('\n') : 'No recent commits available';
  sections.push(`Recent commit subjects:\n${historyBlock}`);

  const diffIntro = diffTruncated
    ? 'Staged diff (truncated to fit limits):'
    : 'Staged diff:';
  sections.push(`${diffIntro}\n${diff}`);

  const constraints = [
    'Only output the commit message (subject and optional body).',
    'Do not wrap the message in quotes or code fences.',
    'If no meaningful change is detected, reply with a short explanation instead of fabricating content.',
  ];
  if (noBody) {
    constraints.push('Produce only a single subject line.');
  } else {
    constraints.push('Include a blank line between subject and body when a body is warranted.');
  }
  if (guidanceTruncated) {
    constraints.push('Guidance text may be truncated; prioritize accuracy.');
  }
  if (typeof detailLevel === 'number') {
    constraints.push(
      `Ensure the level of detail matches level ${detailLevel} on the 1 (brief) to 5 (thorough) scale.`,
    );
  }
  if (promptNote) {
    constraints.push(`Follow this final commit message guidance exactly: ${promptNote}`);
  }

  sections.push(`Output rules:\n${constraints.map((item) => `- ${item}`).join('\n')}`);

  if (promptNote) {
    const emphasisLines = [];
    emphasisLines.push('Final commit message guidance (highest priority):');
    emphasisLines.push(`- ${promptNote}`);
    emphasisLines.push('Apply this directly when drafting the final commit message.');
    sections.push(emphasisLines.join('\n'));
  }

  return sections.join('\n\n');
}

module.exports = {
  buildPrompt,
};
