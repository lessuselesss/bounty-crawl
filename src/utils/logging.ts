import type { LogEntry } from "../types.ts";

export class Logger {
  private component: string;
  private logFile: string | null = null;

  constructor(component: string, logFile?: string) {
    this.component = component;
    this.logFile = logFile || null;

    // Ensure logs directory exists
    if (this.logFile) {
      try {
        Deno.mkdirSync("logs", { recursive: true });
      } catch {
        // Directory already exists or can't create
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  private log(level: LogEntry["level"], message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata,
    };

    // Console output with colors
    const colorized = this.colorizeLog(level, `[${this.component}] ${message}`);
    console.log(colorized);

    // File output if configured
    if (this.logFile) {
      this.writeToFile(entry);
    }
  }

  private colorizeLog(level: LogEntry["level"], message: string): string {
    const colors = {
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m",  // Green
      warn: "\x1b[33m",  // Yellow
      error: "\x1b[31m", // Red
    };

    const reset = "\x1b[0m";
    const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS

    return `\x1b[90m${timestamp}${reset} ${colors[level]}${level.toUpperCase()}${reset} ${message}`;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.logFile) return;

    try {
      const logLine = JSON.stringify(entry) + "\n";
      await Deno.writeTextFile(this.logFile, logLine, { append: true });
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  static createDailyLogger(component: string): Logger {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logFile = `logs/${component.toLowerCase()}-${date}.jsonl`;
    return new Logger(component, logFile);
  }
}