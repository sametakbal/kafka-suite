import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatJson(value: string | null): string {
    if (!value) return '';
    try {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return value;
    }
}

export function isJsonString(value: string | null): boolean {
    if (!value) return false;
    try {
        JSON.parse(value);
        return true;
    } catch {
        return false;
    }
}

export function formatTimestamp(ts: string): string {
    const date = new Date(parseInt(ts));
    if (isNaN(date.getTime())) return ts;
    return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

export function truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
}
