/**
 * UUID v5 — deterministic UUID generation (RFC 4122).
 *
 * Pure-JS synchronous implementation with no dependencies.
 * Uses SHA-1 hashing of namespace UUID + name string to produce
 * a deterministic, collision-resistant UUID.
 *
 * Tradeoff: Pure-JS SHA-1 is ~100x slower than native crypto for bulk
 * operations. Fine for concept-creation-time usage (one hash per concept).
 * For future server-side bulk operations (Phase 14), the SHA-1 could be
 * swapped for Node's crypto.createHash('sha1') behind an adapter interface.
 *
 * @see RFC 4122 Section 4.3
 */

// ── Fandaws Namespace UUID ──
// Fixed root namespace for all Fandaws IRI generation.
export const FANDAWS_NAMESPACE = '7f1b3e4a-2c5d-5f8e-9a1b-0e3d7c6f8a2b';

// ── SHA-1 (pure JS, synchronous, operates on byte arrays) ──

function sha1Bytes(inputBytes) {
  // Copy to avoid mutating caller's array
  const bytes = [...inputBytes];

  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;
  let h4 = 0xC3D2E1F0;

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  // Append original length as 64-bit big-endian
  bytes.push(0, 0, 0, 0);
  bytes.push(
    (bitLength >>> 24) & 0xFF,
    (bitLength >>> 16) & 0xFF,
    (bitLength >>> 8) & 0xFF,
    bitLength & 0xFF,
  );

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(80);

    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }

    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[i]) & 0xFFFFFFFF;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) & 0xFFFFFFFF;
    h1 = (h1 + b) & 0xFFFFFFFF;
    h2 = (h2 + c) & 0xFFFFFFFF;
    h3 = (h3 + d) & 0xFFFFFFFF;
    h4 = (h4 + e) & 0xFFFFFFFF;
  }

  return [
    (h0 >>> 24) & 0xFF, (h0 >>> 16) & 0xFF, (h0 >>> 8) & 0xFF, h0 & 0xFF,
    (h1 >>> 24) & 0xFF, (h1 >>> 16) & 0xFF, (h1 >>> 8) & 0xFF, h1 & 0xFF,
    (h2 >>> 24) & 0xFF, (h2 >>> 16) & 0xFF, (h2 >>> 8) & 0xFF, h2 & 0xFF,
    (h3 >>> 24) & 0xFF, (h3 >>> 16) & 0xFF, (h3 >>> 8) & 0xFF, h3 & 0xFF,
    (h4 >>> 24) & 0xFF, (h4 >>> 16) & 0xFF, (h4 >>> 8) & 0xFF, h4 & 0xFF,
  ];
}

function rotl(n, s) {
  return ((n << s) | (n >>> (32 - s))) & 0xFFFFFFFF;
}

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

// ── UUID helpers ──

function parseUuid(str) {
  const hex = str.replace(/-/g, '');
  const bytes = [];
  for (let i = 0; i < 32; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function formatUuid(bytes) {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

// ── UUID v5 ──

/**
 * Generate a UUID v5 from a namespace UUID and a name string.
 *
 * @param {string} namespace - Namespace UUID (e.g., FANDAWS_NAMESPACE)
 * @param {string} name - Name string to hash
 * @returns {string} UUID v5 string (lowercase, hyphenated)
 */
export function uuid5(namespace, name) {
  if (typeof namespace !== 'string' || typeof name !== 'string') {
    throw new Error('uuid5 requires string namespace and name');
  }

  // Concatenate namespace bytes + UTF-8 encoded name bytes
  const nsBytes = parseUuid(namespace);
  const nameBytes = utf8Encode(name);
  const input = [...nsBytes, ...nameBytes];

  // SHA-1 hash the raw byte concatenation
  const hash = sha1Bytes(input);

  // Take first 16 bytes
  const uuidBytes = hash.slice(0, 16);

  // Set version 5: byte 6 high nibble = 0101
  uuidBytes[6] = (uuidBytes[6] & 0x0F) | 0x50;

  // Set variant RFC 4122: byte 8 high bits = 10
  uuidBytes[8] = (uuidBytes[8] & 0x3F) | 0x80;

  return formatUuid(uuidBytes);
}
