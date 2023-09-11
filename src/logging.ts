type Color = (typeof colorMap)[keyof typeof colorMap];

function colorize(color: Color, output: string) {
  return ["\u001B[", color, "m", output, "\u001B[0m"].join("");
}

const emojiMap = {
  success: "✅",
  warn: "⚠️ ",
  info: "ℹ️ ",
  failed: "❌",
};

const colorMap = {
  success: 32, // Green
  warn: 33, // Yellow
  info: 36, // Cyan
  failed: 31, // Red
};

function date() {
  const date = new Date();
  return `${date.toISOString()}`
}

export const log = {
  success: function (message: unknown, ...args: any[]) {
    console.log(
      colorize(colorMap.success, `${emojiMap.success} [${date()}] ${message}`),
      ...args
    );
  },
  warn: function (message: unknown, ...args: any[]) {
    console.log(
      colorize(colorMap.warn, `${emojiMap.warn} [${date()}] ${message}`),
      ...args
    );
  },
  info: function (message: unknown, ...args: any[]) {
    console.log(
      colorize(colorMap.info, `${emojiMap.info} [${date()}] ${message}`),
      ...args
    );
  },
  failed: function (message: unknown, ...args: any[]) {
    console.log(
      colorize(colorMap.failed, `${emojiMap.failed} [${date()}] ${message}`),
      ...args
    );
  },
};
