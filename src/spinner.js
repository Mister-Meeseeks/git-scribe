const readline = require('node:readline');

const FRAMES = ['-', '\\', '|', '/'];

function createSpinner({ text = 'Generating commit message', stream = process.stdout, interval = 80 } = {}) {
  let timer = null;
  let frameIndex = 0;
  let active = false;
  const isTTY = Boolean(stream && stream.isTTY);

  const render = () => {
    const frame = FRAMES[frameIndex];
    frameIndex = (frameIndex + 1) % FRAMES.length;
    stream.write(`\r${frame} ${text}`);
  };

  const clearLine = () => {
    if (typeof readline.clearLine === 'function' && typeof readline.cursorTo === 'function') {
      readline.clearLine(stream, 0);
      readline.cursorTo(stream, 0);
    } else {
      stream.write('\r');
      stream.write(' '.repeat(text.length + 2));
      stream.write('\r');
    }
  };

  return {
    start() {
      if (active) {
        return;
      }
      active = true;
      if (!isTTY) {
        console.log(`${text}...`);
        return;
      }
      render();
      timer = setInterval(render, interval);
    },
    stop(finalMessage) {
      if (!active) {
        return;
      }
      active = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
        clearLine();
      }
      if (finalMessage) {
        console.log(finalMessage);
      }
    },
  };
}

module.exports = {
  createSpinner,
};
