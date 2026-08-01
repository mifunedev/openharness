export class FixtureLifecycle {
  constructor({ registry, emitter = process, setTimer = setTimeout, clearTimer = clearTimeout, exit = (code) => { process.exitCode = code; } } = {}) {
    if (!registry) throw new Error('registry is required');
    this.registry = registry;
    this.emitter = emitter;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.exit = exit;
    this.cleanupPromise = null;
    this.timer = null;
    this.handlers = new Map();
  }

  install({ deadlineMs }) {
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
      const handler = () => void this.finish({ reason: signal, exitCode: code });
      this.handlers.set(signal, handler);
      this.emitter.once(signal, handler);
    }
    const exitHandler = (code = 0) => void this.finish({ reason: 'EXIT', exitCode: Number(code) || 0 });
    this.handlers.set('beforeExit', exitHandler);
    this.emitter.once('beforeExit', exitHandler);
    this.timer = this.setTimer(() => void this.finish({ reason: 'timeout', exitCode: 124 }), deadlineMs);
    return this;
  }

  async finish({ reason, exitCode = 0, removeRoot = true } = {}) {
    if (!this.cleanupPromise) {
      this.cleanupPromise = (async () => {
        if (this.timer) this.clearTimer(this.timer);
        for (const [signal, handler] of this.handlers) this.emitter.removeListener(signal, handler);
        const proof = await this.registry.cleanup({ removeRoot });
        this.exit(exitCode);
        return { ...proof, reason, exitCode };
      })();
    }
    return this.cleanupPromise;
  }

  async run(operation) {
    try {
      const result = await operation();
      await this.finish({ reason: 'success', exitCode: 0 });
      return result;
    } catch (error) {
      await this.finish({ reason: 'assertion-failure', exitCode: 1 });
      throw error;
    }
  }
}
