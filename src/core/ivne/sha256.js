/**
 * SHA-256 — pure-JS synchronous implementation (FIPS 180-4).
 *
 * Browser + Node.js compatible, no dependencies. Same architectural
 * pattern as uuid5.js's SHA-1 implementation: operates on byte arrays,
 * synchronous, deterministic.
 *
 * Used by the IVNE for:
 *   - Hash-based IRI generation for anonymous/generated concepts
 *   - Source ontology input hashing (ReductionManifest.sourceHash)
 *   - Determinism verification (output hash comparison)
 *
 * @see FIPS 180-4 (Secure Hash Standard)
 */

// ── SHA-256 round constants (first 32 bits of fractional parts of cube roots of first 64 primes) ──

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

// ── Bit operations ──

function rotr(n, s) {
  return ((n >>> s) | (n << (32 - s))) >>> 0;
}

function ch(x, y, z) {
  return ((x & y) ^ (~x & z)) >>> 0;
}

function maj(x, y, z) {
  return ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
}

function sigma0(x) {
  return (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
}

function sigma1(x) {
  return (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;
}

function gamma0(x) {
  return (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
}

function gamma1(x) {
  return (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
}

// ── UTF-8 encoding (shared with uuid5.js pattern) ──

function utf8Encode(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    } else if (c >= 0xD800 && c <= 0xDBFF) {
      const hi = c;
      const lo = str.charCodeAt(++i);
      c = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
      bytes.push(
        0xF0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3F),
        0x80 | ((c >> 6) & 0x3F),
        0x80 | (c & 0x3F),
      );
    } else {
      bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
  }
  return bytes;
}

// ── SHA-256 core ──

/**
 * Compute SHA-256 hash of a byte array.
 *
 * @param {number[]} inputBytes - Array of byte values (0-255)
 * @returns {number[]} 32-byte hash as array of byte values
 */
export function sha256Bytes(inputBytes) {
  const bytes = [...inputBytes];

  // Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Pre-processing: pad message to 512-bit (64-byte) blocks
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  // Append original length as 64-bit big-endian
  // For messages < 2^32 bits, high 32 bits are zero
  bytes.push(0, 0, 0, 0);
  bytes.push(
    (bitLength >>> 24) & 0xFF,
    (bitLength >>> 16) & 0xFF,
    (bitLength >>> 8) & 0xFF,
    bitLength & 0xFF,
  );

  // Process each 512-bit (64-byte) block
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64);

    // Copy block into first 16 words
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }

    // Extend to 64 words
    for (let i = 16; i < 64; i++) {
      w[i] = (gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16]) >>> 0;
    }

    // Initialize working variables
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    // 64 rounds
    for (let i = 0; i < 64; i++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[i] + w[i]) >>> 0;
      const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    // Add compressed chunk to current hash value
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  // Produce 32-byte digest
  const result = [];
  for (const word of [h0, h1, h2, h3, h4, h5, h6, h7]) {
    result.push(
      (word >>> 24) & 0xFF,
      (word >>> 16) & 0xFF,
      (word >>> 8) & 0xFF,
      word & 0xFF,
    );
  }
  return result;
}

// ── Public API ──

/**
 * Compute SHA-256 hash of a string, returning a 64-character hex digest.
 *
 * @param {string} input - String to hash (UTF-8 encoded internally)
 * @returns {string} 64-character lowercase hex string
 */
export function sha256Hex(input) {
  if (typeof input !== 'string') {
    throw new Error('sha256Hex requires a string input');
  }
  const bytes = utf8Encode(input);
  const hash = sha256Bytes(bytes);
  return hash.map((b) => b.toString(16).padStart(2, '0')).join('');
}
