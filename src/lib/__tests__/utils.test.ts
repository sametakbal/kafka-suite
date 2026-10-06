import { describe, it, expect } from 'vitest';
import { cn, formatJson, isJsonString, formatTimestamp, truncate } from '../utils';

describe('cn', () => {
    it('merges multiple class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('ignores falsy values', () => {
        expect(cn('foo', false && 'bar', undefined, null as any)).toBe('foo');
    });

    it('deduplicates conflicting tailwind classes (last wins)', () => {
        expect(cn('p-4', 'p-2')).toBe('p-2');
    });
});

describe('formatJson', () => {
    it('returns empty string for null input', () => {
        expect(formatJson(null)).toBe('');
    });

    it('returns the original string for invalid JSON', () => {
        expect(formatJson('not json')).toBe('not json');
    });

    it('formats valid JSON with 2-space indentation', () => {
        expect(formatJson('{"a":1,"b":2}')).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });
});

describe('isJsonString', () => {
    it('returns false for null', () => {
        expect(isJsonString(null)).toBe(false);
    });

    it('returns false for a non-JSON string', () => {
        expect(isJsonString('hello world')).toBe(false);
    });

    it('returns true for a valid JSON object string', () => {
        expect(isJsonString('{"a":1}')).toBe(true);
    });

    it('returns true for a valid JSON array string', () => {
        expect(isJsonString('[1, 2, 3]')).toBe(true);
    });

    it('returns true for a valid JSON number string', () => {
        expect(isJsonString('42')).toBe(true);
    });
});

describe('formatTimestamp', () => {
    it('formats a valid numeric timestamp string to an ISO-like format', () => {
        const result = formatTimestamp('1700000000000');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('returns the original string when the timestamp is not a valid number', () => {
        expect(formatTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
    });
});

describe('truncate', () => {
    it('returns the string unchanged when length is within the limit', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    it('returns the string unchanged when length exactly equals the limit', () => {
        expect(truncate('hello', 5)).toBe('hello');
    });

    it('truncates and appends ellipsis when the string exceeds the limit', () => {
        expect(truncate('hello world', 5)).toBe('hello...');
    });
});
