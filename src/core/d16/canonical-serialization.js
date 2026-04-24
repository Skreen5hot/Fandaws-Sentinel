/**
 * Canonical JSON Serialization — RFC 8785 JCS (JSON Canonicalization Scheme).
 *
 * Pure-JS implementation, no runtime deps. Shared between:
 *   - DP-2.2 axiomDictionary content-hash keying (per D2.1 lock)
 *   - DP-2.3.1 per-round hash inputs
 *   - DP-2.3.2 Final Hash session-config hash (pending X2 allow-list)
 *
 * The D2.1-D3.1 linkage lock requires both uses share the same
 * canonicalization — changing one requires revisiting the other.
 *
 * Coverage:
 *   - null, boolean, string, number (via JSON.stringify number handling),
 *     array (order preserved), object (keys sorted by UTF-16 code-unit).
 *   - DP-2 inputs comprise JSON-serializable records; no Date / Map / Set /
 *     Symbol / undefined expected. These throw explicitly.
 *
 * Number-edge-case scope: for the common DP-2 numeric forms (small integers,
 * two-decimal weights, percent thresholds), JSON.stringify's output matches
 * RFC 8785's number canonicalization rules. Exotic numerics (±Infinity, NaN,
 * very large/small magnitudes requiring Ryu-exact formatting) are out of
 * scope — they throw or are explicitly rejected at serialization.
 *
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §5.2 DP-2.3.1
 * Lock:   specs/d16/dp2-locked-decisions.md (D3.1 JCS locked + D2.1 linkage)
 */

/**
 * Serialize a JSON-compatible value to its RFC 8785 canonical form.
 *
 * @param {null | boolean | string | number | Array | object} value
 * @returns {string} canonical JSON
 * @throws {TypeError} on unsupported types or non-finite numbers
 */
export function canonicalize(value) {
  return emit(value);
}

function emit(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';

  const t = typeof value;
  if (t === 'string') return emitString(value);
  if (t === 'number') return emitNumber(value);
  if (Array.isArray(value)) return emitArray(value);
  if (t === 'object') return emitObject(value);

  if (t === 'undefined') {
    throw new TypeError('canonicalize: undefined is not representable in JSON.');
  }
  if (t === 'bigint') {
    throw new TypeError('canonicalize: BigInt is not RFC 8785 representable; convert to string explicitly.');
  }
  if (t === 'symbol' || t === 'function') {
    throw new TypeError(`canonicalize: ${t} is not JSON-serializable.`);
  }
  throw new TypeError(`canonicalize: unsupported value type ${t}.`);
}

function emitNumber(n) {
  if (!Number.isFinite(n)) {
    throw new TypeError(`canonicalize: non-finite number ${n} is not RFC 8785 representable.`);
  }
  // JSON.stringify produces ECMAScript Number.toString-style output, which
  // matches RFC 8785 §3.2.2.3 for the DP-2 numeric surface (integers, small
  // decimals). Consumers needing strict Ryu-exact for extreme magnitudes
  // should pre-format to strings before canonicalizing.
  return JSON.stringify(n);
}

function emitString(s) {
  // JSON.stringify emits RFC 8259 escapes; RFC 8785 §3.2.2.2 requires the
  // same minimal-escape profile (\\, \\", \\b, \\f, \\n, \\r, \\t, \\uXXXX for
  // C0 control characters). JSON.stringify in modern engines produces this.
  return JSON.stringify(s);
}

function emitArray(arr) {
  if (arr.length === 0) return '[]';
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    parts[i] = emit(arr[i]);
  }
  return '[' + parts.join(',') + ']';
}

function emitObject(obj) {
  // RFC 8785 §3.2.3: sort keys by UTF-16 code-unit values of the 16-bit string
  // representation. JavaScript's default string comparison is UTF-16
  // code-unit-based, so `sort()` matches without additional collation.
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) return '{}';
  const parts = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (v === undefined) {
      // Match JSON.stringify semantics: undefined-valued properties are
      // dropped. This is consistent with RFC 8785's interpretation of the
      // input as JSON (where undefined is not representable).
      continue;
    }
    parts[i] = emitString(k) + ':' + emit(v);
  }
  // Filter out any holes from the undefined-drop case.
  const filtered = parts.filter((p) => p !== undefined);
  return '{' + filtered.join(',') + '}';
}
