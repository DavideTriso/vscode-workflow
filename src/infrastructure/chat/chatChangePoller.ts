export interface SignatureSource {
  readSignature(): Promise<string>;
}

/**
 * Polls instead of using fs.watch: the chat storage lives outside the workspace and
 * native watchers behave differently on Windows and macOS for such locations.
 */
export class ChatChangePoller {
  private timer: NodeJS.Timeout | undefined;
  private lastSignature: string | undefined;
  private isChecking = false;

  constructor(
    private readonly source: SignatureSource,
    private readonly onChange: () => void,
    private readonly intervalMs: number = 2000,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.check(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async check(): Promise<void> {
    if (this.isChecking) {
      return;
    }
    this.isChecking = true;
    try {
      const signature = await this.source.readSignature();
      if (signature !== this.lastSignature) {
        this.lastSignature = signature;
        this.onChange();
      }
    } catch {
      // Transient file system errors are retried on the next tick.
    } finally {
      this.isChecking = false;
    }
  }
}
