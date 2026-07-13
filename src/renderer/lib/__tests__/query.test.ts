import { describe, it, expect } from 'vitest';
import { compileQuery, matchesQuery } from '../query';

// Shorthand: compile and immediately match
function matches(query: string, rawValue: string | null, key?: string | null): boolean {
    return matchesQuery(compileQuery(query), rawValue, key);
}

// ─── compileQuery ────────────────────────────────────────────────────────────

describe('compileQuery — empty', () => {
    it('returns empty for a blank string', () => {
        expect(compileQuery('')).toEqual({ type: 'empty' });
    });

    it('returns empty for a whitespace-only string', () => {
        expect(compileQuery('   ')).toEqual({ type: 'empty' });
    });
});

describe('compileQuery — freetext', () => {
    it('returns freetext when no structured operators are present', () => {
        expect(compileQuery('hello world')).toEqual({ type: 'freetext', text: 'hello world' });
    });

    it('trims leading/trailing whitespace before returning freetext', () => {
        expect(compileQuery('  hello  ')).toEqual({ type: 'freetext', text: 'hello' });
    });
});

describe('compileQuery — looksStructured triggers', () => {
    it('detects = operator', () => {
        expect(compileQuery('name = alice').type).toBe('structured');
    });

    it('detects > operator', () => {
        expect(compileQuery('age > 5').type).toBe('structured');
    });

    it('detects < operator', () => {
        expect(compileQuery('age < 5').type).toBe('structured');
    });

    it('detects "is null" pattern', () => {
        expect(compileQuery('name is null').type).toBe('structured');
    });

    it('detects "is not null" pattern', () => {
        expect(compileQuery('name is not null').type).toBe('structured');
    });

    it('detects "contains" keyword', () => {
        expect(compileQuery("languages contains 'Python'").type).toBe('structured');
    });

    it('detects "exists" keyword', () => {
        expect(compileQuery('name exists').type).toBe('structured');
    });
});

describe('compileQuery — tokenizer operators', () => {
    it('handles != operator', () => {
        expect(compileQuery('age != 5').type).toBe('structured');
    });

    it('handles <> as != operator', () => {
        expect(compileQuery('age <> 5').type).toBe('structured');
    });

    it('handles >= operator', () => {
        expect(compileQuery('age >= 5').type).toBe('structured');
    });

    it('handles <= operator', () => {
        expect(compileQuery('age <= 5').type).toBe('structured');
    });

    it('handles == as = operator', () => {
        expect(compileQuery('age == 5').type).toBe('structured');
    });
});

describe('compileQuery — tokenizer values', () => {
    it('handles double-quoted string', () => {
        expect(compileQuery('name = "alice"').type).toBe('structured');
    });

    it('handles single-quoted string', () => {
        expect(compileQuery("name = 'alice'").type).toBe('structured');
    });

    it('handles escape sequences inside a quoted string', () => {
        expect(compileQuery('name = "al\\"ice"').type).toBe('structured');
    });

    it('returns error for an unterminated string', () => {
        expect(compileQuery('name = "unterminated').type).toBe('error');
    });

    it('handles a negative number', () => {
        expect(compileQuery('score > -1').type).toBe('structured');
    });

    it('handles a float number', () => {
        expect(compileQuery('score > 1.5').type).toBe('structured');
    });

    it('handles boolean literal true', () => {
        expect(compileQuery('active = true').type).toBe('structured');
    });

    it('handles boolean literal false', () => {
        expect(compileQuery('active = false').type).toBe('structured');
    });

    it('handles null literal as a value', () => {
        expect(compileQuery('name = null').type).toBe('structured');
    });

    it('handles unquoted identifier as a string value', () => {
        expect(compileQuery('name = alice').type).toBe('structured');
    });

    it('handles a dotted path', () => {
        expect(compileQuery('profile.age > 25').type).toBe('structured');
    });

    it('handles an array-index path', () => {
        expect(compileQuery('roles[0].name = admin').type).toBe('structured');
    });

    it('returns error for an unexpected character', () => {
        // "age > # 5" — has > (looks structured) then # triggers tokenizer error
        expect(compileQuery('age > # 5').type).toBe('error');
    });
});

describe('compileQuery — parser boolean logic', () => {
    it('parses an "and" chain', () => {
        expect(compileQuery('age > 5 and active = true').type).toBe('structured');
    });

    it('parses an "or" chain', () => {
        expect(compileQuery('age > 5 or active = false').type).toBe('structured');
    });

    it('parses a "not" prefix', () => {
        expect(compileQuery('not (active = true)').type).toBe('structured');
    });

    it('parses a parenthesised expression', () => {
        expect(compileQuery('(age > 5)').type).toBe('structured');
    });
});

describe('compileQuery — parser null / contains / exists', () => {
    it('parses "is null"', () => {
        expect(compileQuery('name is null').type).toBe('structured');
    });

    it('parses "is not null"', () => {
        expect(compileQuery('name is not null').type).toBe('structured');
    });

    it('parses "contains"', () => {
        expect(compileQuery("languages contains 'Python'").type).toBe('structured');
    });

    it('parses "not contains"', () => {
        expect(compileQuery("languages not contains 'Python'").type).toBe('structured');
    });

    it('parses "exists"', () => {
        expect(compileQuery('name exists').type).toBe('structured');
    });

    it('parses "not exists"', () => {
        expect(compileQuery('name not exists').type).toBe('structured');
    });
});

describe('compileQuery — parser error cases', () => {
    it('returns error for missing closing parenthesis', () => {
        const result = compileQuery('(age > 5');
        expect(result.type).toBe('error');
        if (result.type === 'error') expect(result.message).toContain('parenthesis');
    });

    it('returns error when "is" is followed by a non-null token', () => {
        // combined with > to make looksStructured true
        const result = compileQuery('name is foo and age > 5');
        expect(result.type).toBe('error');
    });

    it('returns error when "is not" is followed by a non-null token', () => {
        // negated=true path through the throw — 'name is not foo'
        const result = compileQuery('name is not foo and age > 5');
        expect(result.type).toBe('error');
    });

    it('returns error for a field followed by no operator', () => {
        // "age > 5 and name" — "name" has no operator
        const result = compileQuery('age > 5 and name');
        expect(result.type).toBe('error');
    });

    it('returns error when the first token is not a field name', () => {
        // "> 5" — op is not an identifier
        const result = compileQuery('> 5');
        expect(result.type).toBe('error');
    });

    it('returns error when the value token is unexpected (e.g. ")")', () => {
        const result = compileQuery('name = )');
        expect(result.type).toBe('error');
    });

    it('returns error when value is missing after operator', () => {
        const result = compileQuery('name =');
        expect(result.type).toBe('error');
    });

    it('returns error for trailing input after a valid expression', () => {
        const result = compileQuery('(age > 5) extra');
        expect(result.type).toBe('error');
    });

    it('returns error when "not" is followed by something other than contains/exists', () => {
        // "name not null" is not a valid field operator
        const result = compileQuery('name not null and age > 5');
        expect(result.type).toBe('error');
    });
});

// ─── matchesQuery ─────────────────────────────────────────────────────────────

describe('matchesQuery — empty query', () => {
    it('always returns true', () => {
        const q = compileQuery('');
        expect(matchesQuery(q, '{"a":1}')).toBe(true);
        expect(matchesQuery(q, null)).toBe(true);
    });
});

describe('matchesQuery — error query', () => {
    it("always returns true (don't hide messages while the user types)", () => {
        // "name = #bad" — has = (looks structured) then # triggers tokenizer error → error type
        const q = compileQuery('name = #bad');
        expect(q.type).toBe('error');
        expect(matchesQuery(q, '{"a":1}')).toBe(true);
        expect(matchesQuery(q, null)).toBe(true);
    });
});

describe('matchesQuery — freetext query', () => {
    it('matches when value contains the search text (case-insensitive)', () => {
        const q = compileQuery('HELLO');
        expect(matchesQuery(q, 'say hello world', null)).toBe(true);
    });

    it('matches when key contains the search text', () => {
        const q = compileQuery('user');
        expect(matchesQuery(q, 'no match here', 'userId')).toBe(true);
    });

    it('returns false when neither value nor key matches', () => {
        const q = compileQuery('xyz');
        expect(matchesQuery(q, 'hello world', 'foo')).toBe(false);
    });

    it('handles null key with non-matching value (covers key ?? "" branch)', () => {
        // rawValue does not match → OR evaluates right side → key is null → null ?? ''
        expect(matchesQuery(compileQuery('xyz'), 'hello world', null)).toBe(false);
    });

    it('handles null value gracefully (falls back to key)', () => {
        expect(matchesQuery(compileQuery('hello'), null, 'hello-key')).toBe(true);
    });

    it('handles null key gracefully (falls back to value)', () => {
        expect(matchesQuery(compileQuery('hello'), 'hello world', null)).toBe(true);
    });
});

describe('matchesQuery — structured query preconditions', () => {
    it('returns false when rawValue is null', () => {
        expect(matchesQuery(compileQuery('name = alice'), null)).toBe(false);
    });

    it('returns false when rawValue is not valid JSON', () => {
        expect(matchesQuery(compileQuery('name = alice'), 'not-json')).toBe(false);
    });
});

describe('evaluator — and / or / not', () => {
    it('and: true when both conditions hold', () => {
        expect(matches('a = 1 and b = 2', '{"a":1,"b":2}')).toBe(true);
    });

    it('and: false when one condition fails', () => {
        expect(matches('a = 1 and b = 99', '{"a":1,"b":2}')).toBe(false);
    });

    it('or: true when at least one condition holds', () => {
        expect(matches('a = 1 or b = 99', '{"a":1,"b":2}')).toBe(true);
    });

    it('or: false when neither condition holds', () => {
        expect(matches('a = 99 or b = 99', '{"a":1,"b":2}')).toBe(false);
    });

    it('not: inverts a true condition to false', () => {
        expect(matches('not (a = 1)', '{"a":1}')).toBe(false);
    });

    it('not: inverts a false condition to true', () => {
        expect(matches('not (a = 1)', '{"a":2}')).toBe(true);
    });
});

describe('evaluator — isNull', () => {
    it('is null: true when the field is null', () => {
        expect(matches('name is null', '{"name":null}')).toBe(true);
    });

    it('is null: true when the field is missing', () => {
        expect(matches('name is null', '{}')).toBe(true);
    });

    it('is null: false when the field has a value', () => {
        expect(matches('name is null', '{"name":"alice"}')).toBe(false);
    });

    it('is not null: true when the field has a value', () => {
        expect(matches('name is not null', '{"name":"alice"}')).toBe(true);
    });

    it('is not null: false when the field is null', () => {
        expect(matches('name is not null', '{"name":null}')).toBe(false);
    });

    it('is not null: false when the field is missing', () => {
        expect(matches('name is not null', '{}')).toBe(false);
    });
});

describe('evaluator — exists', () => {
    it('exists: true when the field is present', () => {
        expect(matches('name exists', '{"name":"alice"}')).toBe(true);
    });

    it('exists: false when the field is missing', () => {
        expect(matches('name exists', '{}')).toBe(false);
    });

    it('not exists: true when the field is missing', () => {
        expect(matches('name not exists', '{}')).toBe(true);
    });

    it('not exists: false when the field is present', () => {
        expect(matches('name not exists', '{"name":"alice"}')).toBe(false);
    });
});

describe('evaluator — contains', () => {
    it('array: true when item is found (case-insensitive)', () => {
        expect(matches("langs contains 'Python'", '{"langs":["Python","Go"]}')).toBe(true);
    });

    it('array: false when item is not found', () => {
        expect(matches("langs contains 'Rust'", '{"langs":["Python","Go"]}')).toBe(false);
    });

    it('string: true when substring is found', () => {
        expect(matches("bio contains developer", '{"bio":"senior developer"}')).toBe(true);
    });

    it('string: false when substring is not found', () => {
        expect(matches("bio contains manager", '{"bio":"senior developer"}')).toBe(false);
    });

    it('not contains: true when item is absent from array', () => {
        expect(matches("langs not contains 'Rust'", '{"langs":["Python","Go"]}')).toBe(true);
    });

    it('not contains: false when item is present in array', () => {
        expect(matches("langs not contains 'Python'", '{"langs":["Python","Go"]}')).toBe(false);
    });

    it('non-array/non-string field: returns false', () => {
        expect(matches('age contains 5', '{"age":25}')).toBe(false);
    });

    it('not contains on non-array/non-string field: returns true', () => {
        expect(matches('age not contains 5', '{"age":25}')).toBe(true);
    });
});

describe('evaluator — cmp operators', () => {
    it('= true when the value matches', () => {
        expect(matches('age = 25', '{"age":25}')).toBe(true);
    });

    it('= false when the value does not match', () => {
        expect(matches('age = 30', '{"age":25}')).toBe(false);
    });

    it('!= true when the value differs', () => {
        expect(matches('age != 30', '{"age":25}')).toBe(true);
    });

    it('!= true when the field is missing (MISSING)', () => {
        expect(matches('age != 30', '{}')).toBe(true);
    });

    it('= false when the field is missing (MISSING)', () => {
        expect(matches('age = 30', '{}')).toBe(false);
    });

    it('> true when field is greater', () => {
        expect(matches('age > 20', '{"age":25}')).toBe(true);
    });

    it('> false when field is not greater', () => {
        expect(matches('age > 30', '{"age":25}')).toBe(false);
    });

    it('>= true when field equals the query value', () => {
        expect(matches('age >= 25', '{"age":25}')).toBe(true);
    });

    it('< true when field is less', () => {
        expect(matches('age < 30', '{"age":25}')).toBe(true);
    });

    it('<= true when field equals the query value', () => {
        expect(matches('age <= 25', '{"age":25}')).toBe(true);
    });

    it('returns false when compareOrdered returns null (field cannot be ordered)', () => {
        // object field — not comparable
        expect(matches('meta > 5', '{"meta":{"x":1}}')).toBe(false);
    });
});

describe('evaluator — looseEquals', () => {
    it('null query value: matches a null field', () => {
        expect(matches('x = null', '{"x":null}')).toBe(true);
    });

    it('null query value: does not match a non-null field', () => {
        expect(matches('x = null', '{"x":1}')).toBe(false);
    });

    it('number query value: matches a numeric field', () => {
        expect(matches('age = 25', '{"age":25}')).toBe(true);
    });

    it('number query value: matches a string field that represents the same number', () => {
        expect(matches('age = 25', '{"age":"25"}')).toBe(true);
    });

    it('number query value: does not match a non-numeric field (boolean → NaN)', () => {
        expect(matches('age = 25', '{"age":true}')).toBe(false);
    });

    it('boolean query value: matches a boolean field', () => {
        expect(matches('active = true', '{"active":true}')).toBe(true);
    });

    it('boolean query value: matches a string field "true"', () => {
        expect(matches('active = true', '{"active":"true"}')).toBe(true);
    });

    it('boolean query value: does not match string "false"', () => {
        expect(matches('active = true', '{"active":"false"}')).toBe(false);
    });

    it('boolean query value: does not match a numeric field', () => {
        expect(matches('active = true', '{"active":1}')).toBe(false);
    });

    it('string query value: case-insensitive match against string field', () => {
        expect(matches('name = alice', '{"name":"ALICE"}')).toBe(true);
    });

    it('string query value: matches string representation of a number field', () => {
        // queryValue is "42" (quoted string), fieldValue is 42 (number)
        expect(matches('code = "42"', '{"code":42}')).toBe(true);
    });

    it('string query value: matches string representation of a boolean field', () => {
        // queryValue is quoted string "true", fieldValue is boolean true
        expect(matches('flag = "true"', '{"flag":true}')).toBe(true);
    });

    it('string query value: returns false for object field (falls through all checks)', () => {
        expect(matches('meta = foo', '{"meta":{"x":1}}')).toBe(false);
    });
});

describe('evaluator — compareOrdered', () => {
    it('numeric field vs numeric query: numeric subtraction', () => {
        expect(matches('age > 20', '{"age":25}')).toBe(true);
    });

    it('string-number field vs numeric query: converts string to number', () => {
        expect(matches('age > 20', '{"age":"25"}')).toBe(true);
    });

    it('empty string field: treated as NaN, falls to localeCompare when query is also string', () => {
        // localeCompare("", "bob") < 0 → name > "bob" is false
        expect(matches('name > "bob"', '{"name":""}')).toBe(false);
    });

    it('string field vs string query: uses localeCompare', () => {
        expect(matches('name > "aardvark"', '{"name":"zebra"}')).toBe(true);
        expect(matches('name < "zebra"', '{"name":"aardvark"}')).toBe(true);
    });

    it('boolean field vs numeric query: returns null → cmp returns false', () => {
        expect(matches('flag > 1', '{"flag":true}')).toBe(false);
    });
});

describe('evaluator — resolvePath', () => {
    it('resolves a simple top-level key', () => {
        expect(matches('name = alice', '{"name":"alice"}')).toBe(true);
    });

    it('resolves a dotted path', () => {
        expect(matches('profile.age > 20', '{"profile":{"age":25}}')).toBe(true);
    });

    it('resolves an array index', () => {
        expect(matches('roles[0] = admin', '{"roles":["admin","user"]}')).toBe(true);
    });

    it('resolves a nested path through an array index', () => {
        expect(matches('roles[0].name = admin', '{"roles":[{"name":"admin"}]}')).toBe(true);
    });

    it('returns MISSING when an intermediate value is null', () => {
        // a.b — current becomes null after resolving a, triggers MISSING on next segment
        expect(matches('a.b is null', '{"a":null}')).toBe(true);
    });

    it('returns MISSING when intermediate is a primitive (not an object)', () => {
        expect(matches('a.b exists', '{"a":42}')).toBe(false);
    });

    it('returns MISSING when array index is accessed on a non-array', () => {
        expect(matches('a[0] exists', '{"a":"string"}')).toBe(false);
    });

    it('returns MISSING when array index is out of bounds (undefined → MISSING)', () => {
        expect(matches('roles[5] exists', '{"roles":["admin"]}')).toBe(false);
    });

    it('returns MISSING when a key does not exist in the object', () => {
        expect(matches('missing exists', '{}')).toBe(false);
    });

    it('returns MISSING when intermediate is an array (cannot do key access on array)', () => {
        expect(matches('a.b exists', '{"a":[1,2]}')).toBe(false);
    });

    it('returns MISSING when path continues after an out-of-bounds array index', () => {
        // roles[5] → undefined → next segment triggers MISSING check at top of loop
        expect(matches('roles[5].name exists', '{"roles":[]}')).toBe(false);
    });
});
