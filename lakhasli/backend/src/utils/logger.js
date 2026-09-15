function timestamp() {
  return new Date().toISOString();
}

export const logger = {
  info: (...args) => console.log(`[${timestamp()}] [info]`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] [warn]`, ...args),
  error: (...args) => console.error(`[${timestamp()}] [error]`, ...args),
};
