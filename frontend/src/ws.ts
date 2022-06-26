export const isBrowser = typeof window !== "undefined";
export const wsInstance = isBrowser ? new WebSocket("ws://schmerver.mooo.com:57") : null;