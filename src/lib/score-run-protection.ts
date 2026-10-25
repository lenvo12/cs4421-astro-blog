import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ScoreRunRateLimitAction = 'start' | 'submit';

interface ScoreRunClaims {
	name: string;
	issuedAt: number;
	nonce: string;
}

interface RateLimitWindow {
	startedAt: number;
	count: number;
}

const SCORE_RUN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SCORE_RUN_RATE_LIMITS: Record<ScoreRunRateLimitAction, number> = {
	start: 60,
	submit: 30,
};
const SCORE_RUN_RATE_WINDOW_MS = 60 * 1000;
const SCORE_GRACE_METERS = 500;
const MAX_PLAUSIBLE_SCORE_RATE_METERS_PER_SECOND = 250;
const MAX_RATE_LIMIT_KEYS = 10_000;
const rateLimitWindows = new Map<string, RateLimitWindow>();

function signingKey(secret: string): Buffer {
	return createHmac('sha256', secret).update('pips-ascension:score-run:v1').digest();
}

function sign(payload: string, secret: string): Buffer {
	return createHmac('sha256', signingKey(secret)).update(payload).digest();
}

export function createScoreRunToken(name: string, secret: string, now = Date.now()): string {
	const claims: ScoreRunClaims = {
		name,
		issuedAt: now,
		nonce: randomBytes(16).toString('hex'),
	};
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	const signature = sign(payload, secret).toString('base64url');
	return `${payload}.${signature}`;
}

export function verifyScoreRunToken(
	token: string,
	name: string,
	score: number,
	secret: string,
	now = Date.now(),
): boolean {
	if (
		token.length > 1024 ||
		!Number.isSafeInteger(score) ||
		score < 1 ||
		score > 10_000
	) return false;
	const parts = token.split('.');
	if (parts.length !== 2) return false;
	const [payload, encodedSignature] = parts;
	const signature = Buffer.from(encodedSignature, 'base64url');
	const expectedSignature = sign(payload, secret);
	if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
		return false;
	}

	let claims: unknown;
	try {
		claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
	} catch {
		return false;
	}
	if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return false;
	const record = claims as Record<string, unknown>;
	if (
		record.name !== name ||
		typeof record.issuedAt !== 'number' ||
		!Number.isSafeInteger(record.issuedAt) ||
		record.issuedAt > now ||
		now - record.issuedAt > SCORE_RUN_MAX_AGE_MS ||
		typeof record.nonce !== 'string' ||
		!/^[a-f0-9]{32}$/.test(record.nonce)
	) {
		return false;
	}

	const elapsedSeconds = (now - record.issuedAt) / 1000;
	const maximumPlausibleScore = Math.floor(
		SCORE_GRACE_METERS + elapsedSeconds * MAX_PLAUSIBLE_SCORE_RATE_METERS_PER_SECOND,
	);
	return score <= maximumPlausibleScore;
}

export function consumeScoreRunRateLimit(
	action: ScoreRunRateLimitAction,
	name: string,
	now = Date.now(),
): number | null {
	const key = `${action}:${name.toLowerCase()}`;
	let window = rateLimitWindows.get(key);
	if (!window || now - window.startedAt >= SCORE_RUN_RATE_WINDOW_MS) {
		window = { startedAt: now, count: 0 };
		rateLimitWindows.set(key, window);
	}

	if (window.count >= SCORE_RUN_RATE_LIMITS[action]) {
		return Math.max(
			1,
			Math.ceil((window.startedAt + SCORE_RUN_RATE_WINDOW_MS - now) / 1000),
		);
	}
	window.count += 1;

	if (rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) {
		for (const [entryKey, entryWindow] of rateLimitWindows) {
			if (now - entryWindow.startedAt >= SCORE_RUN_RATE_WINDOW_MS) {
				rateLimitWindows.delete(entryKey);
			}
		}
		while (rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) {
			const oldestKey = rateLimitWindows.keys().next().value;
			if (oldestKey === undefined) break;
			rateLimitWindows.delete(oldestKey);
		}
	}
	return null;
}
