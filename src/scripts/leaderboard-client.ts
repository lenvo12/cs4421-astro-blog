import type { LeaderboardSnapshot } from '../lib/supabase-leaderboard';
import type { ScoreEntry } from './leaderboard';

function isScoreEntry(value: unknown): value is ScoreEntry {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.name === 'string' &&
		entry.name.length > 0 &&
		typeof entry.score === 'number' &&
		Number.isSafeInteger(entry.score) &&
		entry.score >= 1 &&
		entry.score <= 10_000 &&
		typeof entry.achievedAt === 'number' &&
		Number.isSafeInteger(entry.achievedAt) &&
		entry.achievedAt >= 0 &&
		typeof entry.summit === 'boolean'
	);
}

function isLeaderboardSnapshot(value: unknown): value is LeaderboardSnapshot {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const snapshot = value as Record<string, unknown>;
	return (
		Array.isArray(snapshot.entries) &&
		snapshot.entries.every(isScoreEntry) &&
		(snapshot.personalBest === null || isScoreEntry(snapshot.personalBest))
	);
}

async function readJson(response: Response): Promise<unknown> {
	if (!response.ok) {
		throw new Error(`Leaderboard request failed with HTTP ${response.status}.`);
	}
	return await response.json() as unknown;
}

export async function fetchLeaderboard(name?: string): Promise<LeaderboardSnapshot> {
	const url = new URL('/api/leaderboard', window.location.origin);
	if (name) url.searchParams.set('name', name);
	const data = await readJson(await fetch(url, {
		headers: { Accept: 'application/json' },
		cache: 'no-store',
	}));
	if (!isLeaderboardSnapshot(data)) throw new Error('The leaderboard response is invalid.');
	return data;
}

export async function createScoreRun(name: string): Promise<string> {
	const data = await readJson(await fetch('/api/leaderboard/run', {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ name }),
	}));
	if (
		typeof data !== 'object' ||
		data === null ||
		!('token' in data) ||
		typeof data.token !== 'string' ||
		data.token.length === 0 ||
		data.token.length > 1024
	) {
		throw new Error('The score run response is invalid.');
	}
	return data.token;
}

export async function postLeaderboardScore(
	name: string,
	score: number,
	runToken: string,
): Promise<ScoreEntry> {
	const data = await readJson(await fetch('/api/leaderboard', {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ name, score, runToken }),
	}));
	if (!isScoreEntry(data)) throw new Error('The leaderboard submission response is invalid.');
	return data;
}
