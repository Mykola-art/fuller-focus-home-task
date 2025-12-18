export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
) {
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    worker(),
  );
  await Promise.all(workers);
}
