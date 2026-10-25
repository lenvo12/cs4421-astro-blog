import { describe, expect, it } from 'vitest';
import {
	consumeScoreRunRateLimit,
	createScoreRunToken,
	verifyScoreRunToken,
} from './score-run-protection';

const SECRET = 'test-only-server-secret';

describe('score run protection', () => {
	it('accepts a signed run token for a plausible score and matching callsign', () => {
		const issuedAt = 1_000_000;
		const token = createScoreRunToken('Pip', SECRET, issuedAt);

		expect(verifyScoreRunToken(token, 'Pip', 1_000, SECRET, issuedAt + 10_000)).toBe(true);
		expect(verifyScoreRunToken(token, 'pip', 1_000, SECRET, issuedAt + 10_000)).toBe(false);
	});

	it('rejects altered, expired, future-dated, and implausibly high submissions', () => {
		const issuedAt = 1_000_000;
		const token = createScoreRunToken('Pip', SECRET, issuedAt);
		const [payload, signature] = token.split('.');

		expect(verifyScoreRunToken(`${payload}.${signature.slice(1)}`, 'Pip', 100, SECRET, issuedAt)).toBe(false);
		expect(verifyScoreRunToken(token, 'Pip', 10_000, SECRET, issuedAt)).toBe(false);
		expect(verifyScoreRunToken(token, 'Pip', 100, SECRET, issuedAt - 1)).toBe(false);
		expect(verifyScoreRunToken(token, 'Pip', 100, SECRET, issuedAt + 2 * 60 * 60 * 1000 + 1)).toBe(false);
	});

	it('limits repeated run requests for a callsign within the rate window', () => {
		const name = `rate-test-${Date.now()}`;
		const now = 2_000_000;

		for (let request = 0; request < 60; request += 1) {
			expect(consumeScoreRunRateLimit('start', name, now)).toBeNull();
		}
		expect(consumeScoreRunRateLimit('start', name, now)).toBe(60);
		expect(consumeScoreRunRateLimit('start', name.toUpperCase(), now)).toBe(60);
		expect(consumeScoreRunRateLimit('start', name, now + 60_000)).toBeNull();
	});
});
