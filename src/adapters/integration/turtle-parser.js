/**
 * Turtle Parser — minimal Turtle/TTL parser for ontology ingestion.
 *
 * Hand-rolled to honor the no-runtime-dependencies architectural rule.
 * Handles the subset of Turtle features used by BFO 2020 and similar
 * OBO Foundry ontologies:
 *
 *   - @prefix declarations
 *   - @base declaration
 *   - Subject blocks with `;` predicate separators and `,` object separators
 *   - Full IRIs <http://...>
 *   - Prefixed names (prefix:local with escaped local-name characters)
 *   - String literals "..." with @lang tags and ^^datatype
 *   - Anonymous blank nodes [ ... ] (captured as opaque structures)
 *   - RDF lists ( ... ) (captured as opaque structures)
 *   - Comments (#)
 *
 * Output: an array of triples grouped by subject. Anonymous blank nodes
 * and lists are preserved as nested objects so the ingestion adapter
 * can either extract specific fields or archive them verbatim into
 * `fandaws:sourceAxioms`.
 *
 * Determinism: same input bytes → same output triples. Triples within
 * a subject block preserve source order. Subject blocks preserve source
 * order. No randomness, no clock reads.
 *
 * @see Ontology Ingestion Spec v1.4 Section 2.4
 */

// ── Token types ──
const T_IRI = 'IRI';                  // <http://...>
const T_PNAME = 'PNAME';              // prefix:local
const T_LITERAL = 'LITERAL';          // "string" or "string"@en or "string"^^xsd:string
const T_DOT = 'DOT';                  // .
const T_SEMI = 'SEMI';                // ;
const T_COMMA = 'COMMA';              // ,
const T_LBRACK = 'LBRACK';            // [
const T_RBRACK = 'RBRACK';            // ]
const T_LPAREN = 'LPAREN';            // (
const T_RPAREN = 'RPAREN';            // )
const T_DIRECTIVE = 'DIRECTIVE';      // @prefix or @base
const T_A = 'A';                      // bare 'a' keyword (= rdf:type)
const T_EOF = 'EOF';

/**
 * Tokenize a Turtle document into a flat token stream.
 *
 * @param {string} text - Raw Turtle source
 * @returns {Array<{type: string, value: string, datatype?: string, lang?: string, line: number}>}
 */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const len = text.length;

  while (i < len) {
    const c = text[i];

    // Whitespace
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      line++;
      i++;
      continue;
    }

    // Comment
    if (c === '#') {
      while (i < len && text[i] !== '\n') i++;
      continue;
    }

    // Directive (@prefix, @base, @en lang tag handled inside literals)
    if (c === '@') {
      const start = i;
      i++;
      while (i < len && /[A-Za-z]/.test(text[i])) i++;
      const word = text.slice(start, i);
      if (word === '@prefix' || word === '@base') {
        tokens.push({ type: T_DIRECTIVE, value: word, line });
        continue;
      }
      throw new Error(`Unexpected directive ${word} at line ${line}`);
    }

    // Full IRI <...>
    if (c === '<') {
      const start = ++i;
      while (i < len && text[i] !== '>') i++;
      if (i >= len) throw new Error(`Unterminated IRI at line ${line}`);
      tokens.push({ type: T_IRI, value: text.slice(start, i), line });
      i++; // consume >
      continue;
    }

    // Literal
    if (c === '"') {
      // Triple-quoted long string?
      if (text.slice(i, i + 3) === '"""') {
        i += 3;
        const start = i;
        while (i < len && text.slice(i, i + 3) !== '"""') {
          if (text[i] === '\n') line++;
          i++;
        }
        if (i >= len) throw new Error(`Unterminated triple-quoted string at line ${line}`);
        const value = text.slice(start, i);
        i += 3;
        const tok = { type: T_LITERAL, value, line };
        // Optional lang or datatype
        if (text[i] === '@') {
          i++;
          const lstart = i;
          while (i < len && /[A-Za-z\-]/.test(text[i])) i++;
          tok.lang = text.slice(lstart, i);
        } else if (text.slice(i, i + 2) === '^^') {
          i += 2;
          if (text[i] === '<') {
            const dstart = ++i;
            while (i < len && text[i] !== '>') i++;
            tok.datatype = text.slice(dstart, i);
            i++;
          } else {
            // prefixed name
            const dstart = i;
            while (i < len && /[A-Za-z0-9_:.\-]/.test(text[i])) i++;
            tok.datatype = text.slice(dstart, i);
          }
        }
        tokens.push(tok);
        continue;
      }

      // Single-quoted string
      i++;
      let value = '';
      while (i < len && text[i] !== '"') {
        if (text[i] === '\\') {
          // Escape sequence
          const next = text[i + 1];
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else if (next === 'r') value += '\r';
          else if (next === '"') value += '"';
          else if (next === '\\') value += '\\';
          else if (next === "'") value += "'";
          else value += next;
          i += 2;
        } else {
          if (text[i] === '\n') line++;
          value += text[i];
          i++;
        }
      }
      if (i >= len) throw new Error(`Unterminated string at line ${line}`);
      i++; // consume closing "
      const tok = { type: T_LITERAL, value, line };
      // Optional lang or datatype
      if (text[i] === '@') {
        i++;
        const lstart = i;
        while (i < len && /[A-Za-z\-]/.test(text[i])) i++;
        tok.lang = text.slice(lstart, i);
      } else if (text.slice(i, i + 2) === '^^') {
        i += 2;
        if (text[i] === '<') {
          const dstart = ++i;
          while (i < len && text[i] !== '>') i++;
          tok.datatype = text.slice(dstart, i);
          i++;
        } else {
          const dstart = i;
          while (i < len && /[A-Za-z0-9_:.\-]/.test(text[i])) i++;
          tok.datatype = text.slice(dstart, i);
        }
      }
      tokens.push(tok);
      continue;
    }

    // Punctuation
    if (c === '.') {
      // Could be a number too — but not in BFO subset; treat as DOT
      // (actual numbers in BFO appear only as literals)
      tokens.push({ type: T_DOT, value: '.', line });
      i++;
      continue;
    }
    if (c === ';') {
      tokens.push({ type: T_SEMI, value: ';', line });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: T_COMMA, value: ',', line });
      i++;
      continue;
    }
    if (c === '[') {
      tokens.push({ type: T_LBRACK, value: '[', line });
      i++;
      continue;
    }
    if (c === ']') {
      tokens.push({ type: T_RBRACK, value: ']', line });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: T_LPAREN, value: '(', line });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: T_RPAREN, value: ')', line });
      i++;
      continue;
    }

    // Default prefix `:local` or just `:`
    if (c === ':') {
      const start = i;
      i++;
      while (i < len && /[A-Za-z0-9_\-./]/.test(text[i])) i++;
      const value = text.slice(start, i);
      tokens.push({ type: T_PNAME, value, line });
      continue;
    }

    // Prefixed name or bare 'a' keyword
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      // Read prefix
      while (i < len && /[A-Za-z0-9_\-]/.test(text[i])) i++;
      // Optional :local
      if (text[i] === ':') {
        i++;
        // Local name allows more characters
        while (i < len && /[A-Za-z0-9_\-./]/.test(text[i])) i++;
        const value = text.slice(start, i);
        tokens.push({ type: T_PNAME, value, line });
        continue;
      }
      // Bare word — must be 'a' (rdf:type) or true/false
      const word = text.slice(start, i);
      if (word === 'a') {
        tokens.push({ type: T_A, value: 'a', line });
        continue;
      }
      if (word === 'true' || word === 'false') {
        tokens.push({ type: T_LITERAL, value: word, datatype: 'xsd:boolean', line });
        continue;
      }
      throw new Error(`Unexpected bare word "${word}" at line ${line}`);
    }

    // Numbers (rare in BFO but possible)
    if (/[0-9\-]/.test(c)) {
      const start = i;
      if (text[i] === '-') i++;
      while (i < len && /[0-9.]/.test(text[i])) i++;
      const value = text.slice(start, i);
      tokens.push({ type: T_LITERAL, value, datatype: 'xsd:decimal', line });
      continue;
    }

    throw new Error(`Unexpected character "${c}" at line ${line}`);
  }

  tokens.push({ type: T_EOF, value: '', line });
  return tokens;
}

/**
 * Parse a Turtle document into structured triples.
 *
 * @param {string} text - Raw Turtle source
 * @returns {{
 *   prefixes: Record<string, string>,
 *   base: string|null,
 *   subjects: Map<string, Array<{predicate: string, object: object|string}>>
 * }}
 */
export function parseTurtle(text) {
  const tokens = tokenize(text);
  const prefixes = {};
  let base = null;
  // Map<subjectIri, Array<{predicate, object}>>
  const subjects = new Map();

  let pos = 0;
  let blankCounter = 0;

  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }
  function expect(type) {
    const tok = next();
    if (tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} ("${tok.value}") at line ${tok.line}`);
    }
    return tok;
  }

  // Expand a prefixed name to a full IRI using current prefix map.
  // Empty prefix (`:local`) uses the default namespace.
  function expandPName(value) {
    const colonIdx = value.indexOf(':');
    if (colonIdx === -1) return value;
    const prefix = value.slice(0, colonIdx);
    const local = value.slice(colonIdx + 1);
    if (prefixes[prefix] !== undefined) {
      return prefixes[prefix] + local;
    }
    return value; // unknown prefix — return as-is
  }

  // Resolve any term token to its IRI string (or wrap a literal/blank object).
  function resolveTerm(tok) {
    if (tok.type === T_IRI) return tok.value;
    if (tok.type === T_PNAME) return expandPName(tok.value);
    if (tok.type === T_A) return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    throw new Error(`Cannot resolve term: ${tok.type} at line ${tok.line}`);
  }

  // Parse a single object — IRI, literal, blank node, or list.
  // Returns either a string (for IRI/literal) or a structured object.
  function parseObject() {
    const tok = peek();

    // Anonymous blank node
    if (tok.type === T_LBRACK) {
      next();
      const node = { '@type': '_:blank', predicates: [] };
      while (peek().type !== T_RBRACK && peek().type !== T_EOF) {
        const predTok = next();
        const predIri = resolveTerm(predTok);
        // Parse one or more objects, separated by ,
        while (true) {
          const obj = parseObject();
          node.predicates.push({ predicate: predIri, object: obj });
          if (peek().type === T_COMMA) {
            next();
            continue;
          }
          break;
        }
        // Predicate separator (;) — optional, may be followed by ]
        if (peek().type === T_SEMI) {
          next();
        } else {
          break;
        }
      }
      expect(T_RBRACK);
      return node;
    }

    // RDF list ( a b c )
    if (tok.type === T_LPAREN) {
      next();
      const items = [];
      while (peek().type !== T_RPAREN && peek().type !== T_EOF) {
        items.push(parseObject());
      }
      expect(T_RPAREN);
      return { '@type': '_:list', items };
    }

    // Literal
    if (tok.type === T_LITERAL) {
      next();
      const lit = { '@type': '_:literal', value: tok.value };
      if (tok.lang) lit.lang = tok.lang;
      if (tok.datatype) lit.datatype = expandPName(tok.datatype);
      return lit;
    }

    // IRI / prefixed name / 'a'
    if (tok.type === T_IRI || tok.type === T_PNAME || tok.type === T_A) {
      next();
      return resolveTerm(tok);
    }

    throw new Error(`Expected object but got ${tok.type} at line ${tok.line}`);
  }

  // Top-level: directives + subject blocks
  while (peek().type !== T_EOF) {
    const tok = peek();

    // Directive
    if (tok.type === T_DIRECTIVE) {
      next();
      if (tok.value === '@prefix') {
        // @prefix name: <uri> .  OR  @prefix : <uri> .  (default namespace)
        const nameTok = expect(T_PNAME);
        // PName is "name:" or just ":" — extract prefix portion
        const name = nameTok.value.split(':')[0]; // "" for default ":"
        const iriTok = expect(T_IRI);
        prefixes[name] = iriTok.value;
        expect(T_DOT);
        continue;
      }
      if (tok.value === '@base') {
        const iriTok = expect(T_IRI);
        base = iriTok.value;
        expect(T_DOT);
        continue;
      }
      throw new Error(`Unknown directive ${tok.value}`);
    }

    // Subject block — IRI, prefixed name, or top-level blank node
    let subjectIri;
    if (peek().type === T_LBRACK) {
      // Top-level anonymous subject (e.g., [ rdf:type owl:AllDisjointClasses ; ... ] .)
      // Parse it as a blank node and assign a synthetic IRI; the ingestion
      // adapter will skip subjects with IDs starting with `_:`
      const blank = parseObject(); // consumes [ ... ]
      subjectIri = `_:b${blankCounter++}`;
      if (!subjects.has(subjectIri)) subjects.set(subjectIri, []);
      // Lift the blank node's predicates into the subject map
      if (blank && blank.predicates) {
        for (const p of blank.predicates) {
          subjects.get(subjectIri).push(p);
        }
      }
      // Expect terminating .
      expect(T_DOT);
      continue;
    }
    const subjectTok = next();
    if (subjectTok.type !== T_IRI && subjectTok.type !== T_PNAME) {
      throw new Error(`Expected subject IRI but got ${subjectTok.type} ("${subjectTok.value}") at line ${subjectTok.line}`);
    }
    subjectIri = resolveTerm(subjectTok);
    if (!subjects.has(subjectIri)) {
      subjects.set(subjectIri, []);
    }
    const triples = subjects.get(subjectIri);

    // Predicate-object pairs
    while (true) {
      const predTok = next();
      if (predTok.type !== T_IRI && predTok.type !== T_PNAME && predTok.type !== T_A) {
        throw new Error(`Expected predicate but got ${predTok.type} ("${predTok.value}") at line ${predTok.line}`);
      }
      const predIri = resolveTerm(predTok);

      // One or more objects
      while (true) {
        const obj = parseObject();
        triples.push({ predicate: predIri, object: obj });
        if (peek().type === T_COMMA) {
          next();
          continue;
        }
        break;
      }

      // ; → another predicate; . → end of subject block
      const term = next();
      if (term.type === T_SEMI) {
        // Allow trailing ; before .
        if (peek().type === T_DOT) {
          next();
          break;
        }
        continue;
      }
      if (term.type === T_DOT) {
        break;
      }
      throw new Error(`Expected ; or . but got ${term.type} at line ${term.line}`);
    }
  }

  return { prefixes, base, subjects };
}
