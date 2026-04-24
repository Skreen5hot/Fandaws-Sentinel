/**
 * Crypto Shim — SHA-256 for both Node.js and browser (edge-canonical).
 *
 * Resolves to Web Crypto (`crypto.subtle.digest`) in browsers and
 * `node:crypto` in Node. Returns 64-char lowercase hex — the form DP-2
 * reproducibilityHash fields require per §7.4.
 *
 * No external SHA library added — strict edge-canonical compliance.
 *
 * Consumed by DP-2.3.0 byte-capture retrofit and DP-2.3.1/.2 hash pipeline.
 *
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §5.2
 * Decision: DP-2.3.D1 (LOCKED: JCS canonicalization is paired with DP-2.2.D1
 *           axiomDictionary keying — see specs/d16/dp2-locked-decisions.md)
 */

/**
 * Compute SHA-256 over the input. Returns 64-char lowercase hex.
 *
 * Accepts strings (encoded as UTF-8) or `Uint8Array` (hashed as raw bytes).
 *
 * @param {string | Uint8Array} input
 * @returns {Promise<string>} 64-char lowercase hex
 */
export async function sha256(input) {
  const bytes = toBytes(input);

  if (typeof globalThis !== 'undefined'
    && typeof globalThis.crypto !== 'undefined'
    && globalThis.crypto.subtle
    && typeof globalThis.crypto.subtle.digest === 'function'
  ) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(buf));
  }

  // Node.js fallback — dynamic import so the browser bundle doesn't pull in
  // node:crypto at bundle time (esbuild tree-shakes this branch out when
  // bundling for the browser via the `browser` field in package.json or an
  // explicit `--platform=browser` flag).
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256');
  h.update(bytes);
  return h.digest('hex');
}

/**
 * Byte length of the input (UTF-8 for strings, raw length for Uint8Array).
 * Pairs with sha256() so callers can record {hash, byteLength} together
 * as DP-2.3.0 requires.
 *
 * @param {string | Uint8Array} input
 * @returns {number}
 */
export function byteLengthOf(input) {
  return toBytes(input).byteLength;
}

// ── Internals ──────────────────────────────────────────────────────

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(input);
    }
    // Node < 11 or exotic runtime fallback
    const buf = [];
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      if (c < 0x80) {
        buf.push(c);
      } else if (c < 0x800) {
        buf.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c < 0xd800 || c >= 0xe000) {
        buf.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      } else {
        // surrogate pair
        const next = input.charCodeAt(++i);
        const cp = 0x10000 + (((c & 0x3ff) << 10) | (next & 0x3ff));
        buf.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f),
        );
      }
    }
    return new Uint8Array(buf);
  }
  throw new TypeError(`sha256/byteLengthOf: unsupported input type ${typeof input}; expected string or Uint8Array.`);
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
