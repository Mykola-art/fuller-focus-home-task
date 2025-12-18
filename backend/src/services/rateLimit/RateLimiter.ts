import { sleep } from "../http/fetchWithRetry.js";

type Task<T> = () => Promise<T>;

export class RateLimiter {
  private queue: Array<{
    fn: Task<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];

  private running = 0;
  private lastStartAt = 0;

  constructor(
    private readonly concurrency: number,
    private readonly minTimeMs: number,
  ) {}

  schedule<T>(fn: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      void this.drain();
    });
  }

  private async drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running += 1;

      const now = Date.now();
      const wait = Math.max(0, this.minTimeMs - (now - this.lastStartAt));
      this.lastStartAt = now + wait;

      void (async () => {
        try {
          if (wait > 0) await sleep(wait);
          const v = await item.fn();
          item.resolve(v);
        } catch (e) {
          item.reject(e);
        } finally {
          this.running -= 1;
          void this.drain();
        }
      })();
    }
  }
}
