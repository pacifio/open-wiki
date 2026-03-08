/**
 * FilePool — a bounded pool of Worker threads that parse source files in
 * parallel. Emits 'file:ready' for each completed file, 'parse:done' when
 * the full batch is finished.
 *
 * Architecture:
 *   Main thread  ──tasks──►  Worker pool  ──results──►  EventEmitter events
 *                                                        (file:ready, parse:done)
 */
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import type { WorkerTask, WorkerResult } from './worker-thread.js';

export type { WorkerResult };

const __filename = fileURLToPath(import.meta.url);
// Points to dist/indexer/worker-thread.js at runtime
const WORKER_SCRIPT = resolve(dirname(__filename), 'worker-thread.js');

export interface PoolTask {
  relPath: string;
  absFilePath: string;
}

export class FilePool extends EventEmitter {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{ id: number; task: PoolTask }> = [];
  private inFlight = 0;
  private total = 0;
  private done = 0;
  private resolve?: () => void;

  constructor(workerCount = Math.max(1, Math.min(8, cpus().length - 1))) {
    super();
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(WORKER_SCRIPT);
      w.on('message', (result: WorkerResult) => this.handleResult(w, result));
      w.on('error', (err) => this.handleError(w, err));
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  /**
   * Submit a batch of tasks. Returns a Promise that resolves when every task
   * has completed. Emits 'file:ready' (WorkerResult) for each file.
   */
  processAll(tasks: PoolTask[]): Promise<void> {
    if (tasks.length === 0) return Promise.resolve();

    this.total = tasks.length;
    this.done = 0;
    this.inFlight = 0;
    this.queue = tasks.map((task, id) => ({ id, task }));

    return new Promise<void>((res) => {
      this.resolve = res;
      this.dispatch();
    });
  }

  private dispatch(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.shift()!;
      const { id, task } = this.queue.shift()!;
      this.inFlight++;
      worker.postMessage({ id, relPath: task.relPath, absFilePath: task.absFilePath } satisfies WorkerTask);
    }
  }

  private handleResult(worker: Worker, result: WorkerResult): void {
    this.emit('file:ready', result);
    this.inFlight--;
    this.done++;
    this.idle.push(worker);
    this.dispatch();
    this.checkDone();
  }

  private handleError(worker: Worker, err: Error): void {
    // Worker crashed — replace it so the pool stays healthy
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) {
      const replacement = new Worker(WORKER_SCRIPT);
      replacement.on('message', (r: WorkerResult) => this.handleResult(replacement, r));
      replacement.on('error', (e) => this.handleError(replacement, e));
      this.workers[idx] = replacement;
      this.idle.push(replacement);
    }
    this.inFlight--;
    this.done++;
    this.dispatch();
    this.checkDone();
  }

  private checkDone(): void {
    if (this.done === this.total && this.inFlight === 0) {
      this.emit('parse:done');
      this.resolve?.();
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
