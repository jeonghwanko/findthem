import { ENABLE_LOGGING } from "./config";

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.DEBUG;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return ENABLE_LOGGING && level >= this.logLevel;
  }

  private formatMessage(category: string, methodName: string, message: string): string {
    return `[${category}:${methodName}] ${message}`;
  }

  public debug(category: string, methodName: string, message: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(category, methodName, message));
    }
  }

  public info(category: string, methodName: string, message: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(category, methodName, message));
    }
  }

  public warn(category: string, methodName: string, message: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(category, methodName, message));
    }
  }

  public error(category: string, methodName: string, message: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(category, methodName, message));
    }
  }

  // StateMachine 전용 헬퍼 메서드들 (기존 StateMachine과 호환성 유지)
  public logStateChange(id: string, from: string | undefined, to: string): void {
    this.debug(`StateMachine-${id}`, "setState", `change from ${from ?? "none"} to ${to}`);
  }

  public logStateEnter(id: string, stateName: string): void {
    this.debug(`StateMachine-${id}`, "setState", `${stateName} on enter invoked`);
  }
}

// 전역 logger 인스턴스 내보내기
export const logger = Logger.getInstance();
