import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEVELOPER_SESSION_COOKIE = 'pip-developer-session';
export const DEVELOPER_SESSION_TTL_SECONDS = 12 * 60 * 60;

const MIN_PASSWORD_LENGTH = 16;
const MIN_SECRET_LENGTH = 32;

function password(): string | undefined {
	return (
		process.env.DEVELOPER_ACCESS_PASSWORD ??
		(import.meta.env.DEV ? import.meta.env.DEVELOPER_ACCESS_PASSWORD : undefined)
	);
}

function sessionSecret(): string | undefined {
	return (
		process.env.DEVELOPER_ACCESS_SECRET ??
		(import.meta.env.DEV ? import.meta.env.DEVELOPER_ACCESS_SECRET : undefined)
	);
}

export function isDeveloperAccessConfigured(): boolean {
	const configuredPassword = password();
	const secret = sessionSecret();
	return Boolean(
		configuredPassword &&
			configuredPassword.length >= MIN_PASSWORD_LENGTH &&
			configuredPassword.length <= 256 &&
			secret &&
			Buffer.byteLength(secret) >= MIN_SECRET_LENGTH,
	);
}

export function verifyDeveloperPassword(candidate: string): boolean {
	const configuredPassword = password();
	if (!isDeveloperAccessConfigured() || !configuredPassword || candidate.length > 256) return false;
	const candidateDigest = createHash('sha256').update(candidate).digest();
	const configuredDigest = createHash('sha256').update(configuredPassword).digest();
	return timingSafeEqual(candidateDigest, configuredDigest);
}

export function createDeveloperSessionToken(now = Date.now()): string {
	const secret = sessionSecret();
	if (!isDeveloperAccessConfigured() || !secret) {
		throw new Error('Developer access requires a password and a session secret.');
	}
	const expiresAt = Math.floor(now / 1000) + DEVELOPER_SESSION_TTL_SECONDS;
	return `${expiresAt}.${sessionSignature(expiresAt, secret)}`;
}

export function isValidDeveloperSession(token: string | undefined, now = Date.now()): boolean {
	const secret = sessionSecret();
	if (!isDeveloperAccessConfigured() || !secret || !token || token.length > 128) return false;
	const [expiresAtText, suppliedSignature, extra] = token.split('.');
	if (
		!expiresAtText ||
		!suppliedSignature ||
		extra !== undefined ||
		!/^\d+$/.test(expiresAtText) ||
		!/^[A-Za-z0-9_-]+$/.test(suppliedSignature)
	) {
		return false;
	}
	const expiresAt = Number(expiresAtText);
	const nowSeconds = Math.floor(now / 1000);
	if (
		!Number.isSafeInteger(expiresAt) ||
		expiresAt <= nowSeconds ||
		expiresAt > nowSeconds + DEVELOPER_SESSION_TTL_SECONDS + 60
	) {
		return false;
	}
	const expectedSignature = Buffer.from(sessionSignature(expiresAt, secret));
	const receivedSignature = Buffer.from(suppliedSignature);
	return (
		expectedSignature.length === receivedSignature.length &&
		timingSafeEqual(expectedSignature, receivedSignature)
	);
}

function sessionSignature(expiresAt: number, secret: string): string {
	return createHmac('sha256', secret).update(`${expiresAt}`).digest('base64url');
}
