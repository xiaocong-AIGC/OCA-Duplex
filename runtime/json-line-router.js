import { EventEmitter } from "node:events";

export class JsonLineRouter extends EventEmitter {
  ingest(line) {
    const value = String(line ?? "").trim();
    if (!value) return null;
    let message;
    try {
      message = JSON.parse(value);
    } catch (error) {
      this.emit("protocolError", new Error(`Invalid JSONL from app-server: ${error.message}`), value);
      return null;
    }
    if (Object.hasOwn(message, "id") && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
      this.emit("response", message);
    } else if (message.method) {
      this.emit("notification", message);
      this.emit(`notification:${message.method}`, message.params);
    } else {
      this.emit("protocolError", new Error("Unknown app-server message envelope"), value);
    }
    return message;
  }
}
