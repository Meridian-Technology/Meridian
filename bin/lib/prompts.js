/**
 * Cross-platform prompts for Meridian CLI.
 * Uses Node readline (no external deps).
 */

const readline = require('readline');

function promptYesNo(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      const normalized = (answer || '').trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

function promptChoice(message, choices) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = `${message}\n${choices.map((c, i) => `  ${i + 1}. ${c.label}`).join('\n')}\nChoice (1-${choices.length}): `;
    rl.question(prompt, (answer) => {
      rl.close();
      const idx = parseInt((answer || '').trim(), 10);
      if (idx >= 1 && idx <= choices.length) {
        resolve(choices[idx - 1].value);
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = {
  promptYesNo,
  promptChoice,
};
