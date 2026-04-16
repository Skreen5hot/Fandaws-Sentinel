/**
 * RateLimiter — per-session sliding window assertion counter.
 *
 * Decision F: 100 assertions per 60-second sliding window per session.
 *
 * @see docs/architecture/phase-13-locked-decisions.md
 */

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_SECONDS = 60;

export class RateLimiter {
  /**
   * @param {object} [options={}]
   * @param {number} [options.limit=100]
   * @param {number} [options.windowSeconds=60]
   */
  constructor(options = {}) {
    this._limit = options.limit || DEFAULT_LIMIT;
    this._windowSeconds = options.windowSeconds || DEFAULT_WINDOW_SECONDS;
    /** @type {number[]} Timestamps of assertions within the window */
    this._timestamps = [];
  }

  /**
   * Record an assertion and check the rate limit.
   *
   * @param {number} [now=Date.now()] - Current timestamp in ms
   * @returns {{ allowed: boolean, error?: object }}
   */
  check(now = Date.now()) {
    const windowMs = this._windowSeconds * 1000;
    const cutoff = now - windowMs;

    // Prune timestamps outside the window
    this._timestamps = this._timestamps.filter((t) => t > cutoff);

    // Check limit
    if (this._timestamps.length >= this._limit) {
      // Calculate retryAfter: time until the oldest timestamp in the window
      // falls outside the window
      const oldestInWindow = this._timestamps[0];
      const retryAfterMs = (oldestInWindow + windowMs) - now;
      const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));

      return {
        allowed: false,
        error: {
          type: 'RateLimitExceeded',
          assertionCount: this._timestamps.length + 1,
          windowSeconds: this._windowSeconds,
          limit: this._limit,
          retryAfter,
          retryAfterUnit: 'seconds',
        },
      };
    }

    // Within limit — record and allow
    this._timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Get current assertion count within the window.
   */
  get currentCount() {
    const cutoff = Date.now() - (this._windowSeconds * 1000);
    return this._timestamps.filter((t) => t > cutoff).length;
  }
}
