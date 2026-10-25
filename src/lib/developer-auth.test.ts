import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	createDeveloperSessionToken,
	DEVELOPER_SESSION_TTL_SECONDS,
	isDeveloperAccessConfigured,
	isValidDeveloperSession,
	verifyDeveloperPassword,
} from './developer-auth';

const originalPassword = process.env.DEVELOPER_ACCESS_PASSWORD;
const originalSecret = process.env.DEVELOPER_ACCESS_SECRET;

beforeEach(() => {
	process.env.DEVELOPER_ACCESS_PASSWORD = 'correct-horse-battery-staple';
	process.env.DEVELOPER_ACCESS_SECRET = 'test-session-secret-with-at-least-32-bytes';
});

afterEach(() => {
	if (originalPassword === undefined) delete process.env.DEVELOPER_ACCESS_PASSWORD;
	else process.env.DEVELOPER_ACCESS_PASSWORD = originalPassword;
	if (originalSecret === undefined) delete process.env.DEVELOPER_ACCESS_SECRET;
	else process.env.DEVELOPER_ACCESS_SECRET = originalSecret;
});

describe('developer access', () => {
	it('requires a sufficiently long password and session secret', () => {
		expect(isDeveloperAccessConfigured()).toBe(true);
		process.env.DEVELOPER_ACCESS_PASSWORD = 'short';
		expect(isDeveloperAccessConfigured()).toBe(false);
	});

	it('compares passwords without accepting incorrect or oversized values', () => {
		expect(verifyDeveloperPassword('correct-horse-battery-staple')).toBe(true);
		expect(verifyDeveloperPassword('incorrect-password')).toBe(false);
		expect(verifyDeveloperPassword('x'.repeat(257))).toBe(false);
	});

	it('accepts only an unmodified, unexpired signed session', () => {
		const now = Date.UTC(2026, 0, 1);
		const token = createDeveloperSessionToken(now);
		expect(isValidDeveloperSession(token, now)).toBe(true);
		expect(isValidDeveloperSession(token, now + DEVELOPER_SESSION_TTL_SECONDS * 1000)).toBe(false);
		expect(isValidDeveloperSession(`${token}x`, now)).toBe(false);
	});

	it('rejects sessions when the signing secret changes', () => {
		const token = createDeveloperSessionToken();
		process.env.DEVELOPER_ACCESS_SECRET = 'a-different-session-secret-over-32-bytes';
		expect(isValidDeveloperSession(token)).toBe(false);
	});
});
