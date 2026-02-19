const { spawn } = require('node:child_process');

function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveEditorCommand(preferred) {
  return preferred || process.env.EDITOR || 'vi';
}

function openEditor(filePath, editorCommand) {
  const command = editorCommand || resolveEditorCommand();
  const finalCommand = command.includes('$FILE')
    ? command.replace(/\$FILE/g, shellQuote(filePath))
    : `${command} ${shellQuote(filePath)}`;

  return new Promise((resolve, reject) => {
    const child = spawn(finalCommand, {
      shell: true,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

module.exports = {
  openEditor,
  resolveEditorCommand,
};
