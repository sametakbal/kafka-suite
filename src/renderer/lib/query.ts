// Query engine for filtering Kafka messages.
//
// Structured queries operate on JSON message values:
//   phoneNumber is not null
//   profile.age > 25 and username = "johndoe"
//   languages contains "Python" or roles[0].roleName = Admin
//   not (isActive = true)
//
// Queries without operators fall back to a case-insensitive freetext
// search over the raw message value (works for non-JSON messages too).

export type QueryValue = string | number | boolean | null;

type CompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=';

type AstNode =
    | { kind: 'and'; left: AstNode; right: AstNode }
    | { kind: 'or'; left: AstNode; right: AstNode }
    | { kind: 'not'; child: AstNode }
    | { kind: 'cmp'; path: string; op: CompareOp; value: QueryValue }
    | { kind: 'isNull'; path: string; negated: boolean }
    | { kind: 'contains'; path: string; value: QueryValue; negated: boolean }
    | { kind: 'exists'; path: string; negated: boolean };

export type CompiledQuery =
    | { type: 'empty' }
    | { type: 'freetext'; text: string }
    | { type: 'structured'; ast: AstNode }
    | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
    | { type: 'lparen' }
    | { type: 'rparen' }
    | { type: 'and' }
    | { type: 'or' }
    | { type: 'not' }
    | { type: 'is' }
    | { type: 'null' }
    | { type: 'contains' }
    | { type: 'exists' }
    | { type: 'op'; value: CompareOp }
    | { type: 'string'; value: string }
    | { type: 'number'; value: number }
    | { type: 'boolean'; value: boolean }
    | { type: 'ident'; value: string };

const KEYWORDS: Record<string, Token> = {
    and: { type: 'and' },
    or: { type: 'or' },
    not: { type: 'not' },
    is: { type: 'is' },
    null: { type: 'null' },
    contains: { type: 'contains' },
    exists: { type: 'exists' },
    true: { type: 'boolean', value: true },
    false: { type: 'boolean', value: false },
};

const IDENT_RE = /^[A-Za-z_$][\w$-]*(?:(?:\.[A-Za-z_$][\w$-]*)|(?:\[\d+\]))*/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/;

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        const ch = input[i];

        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        if (ch === '(') {
            tokens.push({ type: 'lparen' });
            i++;
            continue;
        }
        if (ch === ')') {
            tokens.push({ type: 'rparen' });
            i++;
            continue;
        }

        // Operators (longest match first)
        const twoChar = input.slice(i, i + 2);
        if (twoChar === '!=' || twoChar === '<>') {
            tokens.push({ type: 'op', value: '!=' });
            i += 2;
            continue;
        }
        if (twoChar === '>=' || twoChar === '<=') {
            tokens.push({ type: 'op', value: twoChar as CompareOp });
            i += 2;
            continue;
        }
        if (twoChar === '==') {
            tokens.push({ type: 'op', value: '=' });
            i += 2;
            continue;
        }
        if (ch === '=' || ch === '>' || ch === '<') {
            tokens.push({ type: 'op', value: ch as CompareOp });
            i++;
            continue;
        }

        // Quoted strings
        if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            let str = '';
            while (j < input.length && input[j] !== quote) {
                if (input[j] === '\\' && j + 1 < input.length) {
                    str += input[j + 1];
                    j += 2;
                } else {
                    str += input[j];
                    j++;
                }
            }
            if (j >= input.length) {
                throw new Error(`Unterminated string starting at position ${i + 1}`);
            }
            tokens.push({ type: 'string', value: str });
            i = j + 1;
            continue;
        }

        // Numbers
        const numMatch = NUMBER_RE.exec(input.slice(i));
        if (numMatch) {
            tokens.push({ type: 'number', value: parseFloat(numMatch[0]) });
            i += numMatch[0].length;
            continue;
        }

        // Identifiers / keywords / paths
        const identMatch = IDENT_RE.exec(input.slice(i));
        if (identMatch) {
            const word = identMatch[0];
            const keyword = KEYWORDS[word.toLowerCase()];
            if (keyword && !word.includes('.') && !word.includes('[')) {
                tokens.push(keyword);
            } else {
                tokens.push({ type: 'ident', value: word });
            }
            i += word.length;
            continue;
        }

        throw new Error(`Unexpected character "${ch}" at position ${i + 1}`);
    }

    return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------

class Parser {
    private pos = 0;

    constructor(private tokens: Token[]) {}

    parse(): AstNode {
        const node = this.parseOr();
        if (this.pos < this.tokens.length) {
            throw new Error('Unexpected trailing input in query');
        }
        return node;
    }

    private peek(): Token | undefined {
        return this.tokens[this.pos];
    }

    private next(): Token | undefined {
        return this.tokens[this.pos++];
    }

    private parseOr(): AstNode {
        let left = this.parseAnd();
        while (this.peek()?.type === 'or') {
            this.next();
            left = { kind: 'or', left, right: this.parseAnd() };
        }
        return left;
    }

    private parseAnd(): AstNode {
        let left = this.parseUnary();
        while (this.peek()?.type === 'and') {
            this.next();
            left = { kind: 'and', left, right: this.parseUnary() };
        }
        return left;
    }

    private parseUnary(): AstNode {
        const token = this.peek();
        if (token?.type === 'not') {
            this.next();
            return { kind: 'not', child: this.parseUnary() };
        }
        if (token?.type === 'lparen') {
            this.next();
            const node = this.parseOr();
            if (this.next()?.type !== 'rparen') {
                throw new Error('Missing closing parenthesis');
            }
            return node;
        }
        return this.parseCondition();
    }

    private parseCondition(): AstNode {
        const pathToken = this.next();
        if (pathToken?.type !== 'ident') {
            throw new Error('Expected a field name');
        }
        const path = pathToken.value;

        const opToken = this.next();
        if (!opToken) {
            throw new Error(`Expected an operator after "${path}"`);
        }

        // field is [not] null | field is [not] empty is not supported; null only
        if (opToken.type === 'is') {
            let negated = false;
            let t = this.next();
            if (t?.type === 'not') {
                negated = true;
                t = this.next();
            }
            if (t?.type !== 'null') {
                throw new Error(`Expected "null" after "${path} is${negated ? ' not' : ''}"`);
            }
            return { kind: 'isNull', path, negated };
        }

        if (opToken.type === 'contains') {
            const value = this.parseValue(path);
            return { kind: 'contains', path, value, negated: false };
        }

        if (opToken.type === 'not' && this.peek()?.type === 'contains') {
            this.next();
            const value = this.parseValue(path);
            return { kind: 'contains', path, value, negated: true };
        }

        if (opToken.type === 'exists') {
            return { kind: 'exists', path, negated: false };
        }

        if (opToken.type === 'not' && this.peek()?.type === 'exists') {
            this.next();
            return { kind: 'exists', path, negated: true };
        }

        if (opToken.type === 'op') {
            const value = this.parseValue(path);
            return { kind: 'cmp', path, op: opToken.value, value };
        }

        throw new Error(`Unexpected operator after "${path}"`);
    }

    private parseValue(path: string): QueryValue {
        const token = this.next();
        if (!token) {
            throw new Error(`Expected a value for "${path}"`);
        }
        switch (token.type) {
            case 'string':
                return token.value;
            case 'number':
                return token.value;
            case 'boolean':
                return token.value;
            case 'null':
                return null;
            case 'ident':
                // Unquoted word treated as a string value
                return token.value;
            default:
                throw new Error(`Expected a value for "${path}"`);
        }
    }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

const MISSING = Symbol('missing');

function resolvePath(obj: unknown, path: string): unknown {
    let current: unknown = obj;
    const segmentRe = /([^.[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = segmentRe.exec(path)) !== null) {
        if (current === null || current === undefined) return MISSING;
        if (match[2] !== undefined) {
            if (!Array.isArray(current)) return MISSING;
            current = current[parseInt(match[2], 10)];
        } else {
            if (typeof current !== 'object' || Array.isArray(current)) return MISSING;
            const record = current as Record<string, unknown>;
            if (!(match[1] in record)) return MISSING;
            current = record[match[1]];
        }
    }

    return current === undefined ? MISSING : current;
}

function looseEquals(fieldValue: unknown, queryValue: QueryValue): boolean {
    if (queryValue === null) return fieldValue === null;
    if (typeof queryValue === 'number') {
        const n =
            typeof fieldValue === 'number'
                ? fieldValue
                : typeof fieldValue === 'string'
                  ? Number(fieldValue)
                  : NaN;
        return !isNaN(n) && n === queryValue;
    }
    if (typeof queryValue === 'boolean') {
        if (typeof fieldValue === 'boolean') return fieldValue === queryValue;
        return typeof fieldValue === 'string' && fieldValue.toLowerCase() === String(queryValue);
    }
    // String comparison, case-insensitive
    if (typeof fieldValue === 'string') {
        return fieldValue.toLowerCase() === queryValue.toLowerCase();
    }
    if (typeof fieldValue === 'number' || typeof fieldValue === 'boolean') {
        return String(fieldValue).toLowerCase() === queryValue.toLowerCase();
    }
    return false;
}

function compareOrdered(fieldValue: unknown, queryValue: QueryValue): number | null {
    const fieldNum =
        typeof fieldValue === 'number'
            ? fieldValue
            : typeof fieldValue === 'string' && fieldValue.trim() !== ''
              ? Number(fieldValue)
              : NaN;
    const queryNum = typeof queryValue === 'number' ? queryValue : Number(queryValue);

    if (!isNaN(fieldNum) && !isNaN(queryNum)) {
        return fieldNum - queryNum;
    }
    if (typeof fieldValue === 'string' && typeof queryValue === 'string') {
        return fieldValue.localeCompare(queryValue);
    }
    return null;
}

function evaluateNode(node: AstNode, obj: unknown): boolean {
    switch (node.kind) {
        case 'and':
            return evaluateNode(node.left, obj) && evaluateNode(node.right, obj);
        case 'or':
            return evaluateNode(node.left, obj) || evaluateNode(node.right, obj);
        case 'not':
            return !evaluateNode(node.child, obj);
        case 'isNull': {
            const value = resolvePath(obj, node.path);
            const isNull = value === null || value === MISSING;
            return node.negated ? !isNull : isNull;
        }
        case 'exists': {
            const value = resolvePath(obj, node.path);
            const exists = value !== MISSING;
            return node.negated ? !exists : exists;
        }
        case 'contains': {
            const value = resolvePath(obj, node.path);
            let result = false;
            if (Array.isArray(value)) {
                result = value.some((item) => looseEquals(item, node.value));
            } else if (typeof value === 'string') {
                result = value.toLowerCase().includes(String(node.value).toLowerCase());
            }
            return node.negated ? !result : result;
        }
        case 'cmp': {
            const value = resolvePath(obj, node.path);
            if (value === MISSING) return node.op === '!=';
            switch (node.op) {
                case '=':
                    return looseEquals(value, node.value);
                case '!=':
                    return !looseEquals(value, node.value);
                default: {
                    const cmp = compareOrdered(value, node.value);
                    if (cmp === null) return false;
                    if (node.op === '>') return cmp > 0;
                    if (node.op === '>=') return cmp >= 0;
                    if (node.op === '<') return cmp < 0;
                    return cmp <= 0;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Does the input look like a structured query (vs. plain freetext)? */
function looksStructured(input: string): boolean {
    return (
        /[=<>]/.test(input) ||
        /\bis\s+(not\s+)?null\b/i.test(input) ||
        /\bcontains\b/i.test(input) ||
        /\bexists\b/i.test(input)
    );
}

export function compileQuery(input: string): CompiledQuery {
    const trimmed = input.trim();
    if (!trimmed) return { type: 'empty' };

    if (!looksStructured(trimmed)) {
        return { type: 'freetext', text: trimmed };
    }

    try {
        const ast = new Parser(tokenize(trimmed)).parse();
        return { type: 'structured', ast };
    } catch (err) {
        return {
            type: 'error',
            message: err instanceof Error ? err.message : 'Invalid query',
        };
    }
}

export function matchesQuery(
    query: CompiledQuery,
    rawValue: string | null,
    key?: string | null
): boolean {
    switch (query.type) {
        case 'empty':
            return true;
        case 'error':
            return true; // don't hide messages while the user is mid-typing
        case 'freetext': {
            const needle = query.text.toLowerCase();
            return (
                (rawValue ?? '').toLowerCase().includes(needle) ||
                (key ?? '').toLowerCase().includes(needle)
            );
        }
        case 'structured': {
            if (!rawValue) return false;
            let parsed: unknown;
            try {
                parsed = JSON.parse(rawValue);
            } catch {
                return false; // structured queries only apply to JSON messages
            }
            return evaluateNode(query.ast, parsed);
        }
    }
}
