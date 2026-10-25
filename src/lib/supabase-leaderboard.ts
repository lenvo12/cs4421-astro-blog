export interface LeaderboardScore {
	name: string;
	score: number;
	achievedAt: number;
	summit: boolean;
}

export interface LeaderboardSnapshot {
	entries: LeaderboardScore[];
	personalBest: LeaderboardScore | null;
}

export interface ScoreSubmission {
	name: string;
	score: number;
}

export class LeaderboardBackendError extends Error {
	constructor(
		message: string,
		readonly kind: 'unconfigured' | 'upstream' | 'invalid-response',
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'LeaderboardBackendError';
	}
}

export function normalizeCallsign(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.trim().replace(/\s+/g, ' ');
	if (!name || name.length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
	return name;
}

export function parseScoreSubmission(value: unknown): ScoreSubmission | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const name = normalizeCallsign(record.name);
	if (
		!name ||
		typeof record.score !== 'number' ||
		!Number.isSafeInteger(record.score) ||
		record.score < 1 ||
		record.score > 10_000
	) {
		return null;
	}
	return { name, score: record.score };
}

function getSupabaseConfig(): { baseUrl: string; secretKey: string } {
	const projectUrl = process.env.SUPABASE_URL?.trim();
	const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
	if (!projectUrl || !secretKey) {
		throw new LeaderboardBackendError(
			'SUPABASE_URL and SUPABASE_SECRET_KEY must be configured.',
			'unconfigured',
		);
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(projectUrl);
	} catch {
		throw new LeaderboardBackendError('SUPABASE_URL is not a valid URL.', 'unconfigured');
	}
	const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
	if (parsedUrl.protocol !== 'https:' && !(isLocalhost && parsedUrl.protocol === 'http:')) {
		throw new LeaderboardBackendError('SUPABASE_URL must use HTTPS.', 'unconfigured');
	}

	return { baseUrl: parsedUrl.origin, secretKey };
}

function mapSupabaseScore(value: unknown): LeaderboardScore {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new LeaderboardBackendError('Supabase returned an invalid score.', 'invalid-response');
	}
	const row = value as Record<string, unknown>;
	const achievedAt = typeof row.achieved_at === 'string' ? Date.parse(row.achieved_at) : Number.NaN;
	if (
		typeof row.name !== 'string' ||
		!row.name ||
		typeof row.score !== 'number' ||
		!Number.isSafeInteger(row.score) ||
		row.score < 1 ||
		row.score > 10_000 ||
		!Number.isSafeInteger(achievedAt) ||
		achievedAt < 0 ||
		typeof row.summit !== 'boolean'
	) {
		throw new LeaderboardBackendError('Supabase returned an invalid score.', 'invalid-response');
	}
	return {
		name: row.name,
		score: row.score,
		achievedAt,
		summit: row.summit,
	};
}

async function requestSupabase(path: string, init?: RequestInit): Promise<unknown> {
	const { baseUrl, secretKey } = getSupabaseConfig();
	const headers = new Headers(init?.headers);
	headers.set('apikey', secretKey);
	headers.set('Authorization', `Bearer ${secretKey}`);
	if (init?.body) headers.set('Content-Type', 'application/json');

	let response: Response;
	try {
		response = await fetch(new URL(path, `${baseUrl}/`), {
			...init,
			headers,
			signal: AbortSignal.timeout(5_000),
		});
	} catch (error) {
		throw new LeaderboardBackendError('Supabase could not be reached.', 'upstream', { cause: error });
	}
	if (!response.ok) {
		throw new LeaderboardBackendError(
			`Supabase returned HTTP ${response.status}.`,
			'upstream',
		);
	}
	try {
		return await response.json() as unknown;
	} catch (error) {
		throw new LeaderboardBackendError('Supabase returned invalid JSON.', 'invalid-response', {
			cause: error,
		});
	}
}

function scoresUrl(name?: string): string {
	const url = new URL('/rest/v1/leaderboard_entries', 'https://supabase.invalid');
	url.searchParams.set('select', 'name,score,achieved_at,summit');
	if (name) url.searchParams.set('name', `eq.${JSON.stringify(name)}`);
	url.searchParams.set('order', 'score.desc,achieved_at.asc');
	url.searchParams.set('limit', name ? '1' : '100');
	return `${url.pathname}${url.search}`;
}

export async function getLeaderboard(name?: string): Promise<LeaderboardSnapshot> {
	const normalizedName = name === undefined ? undefined : normalizeCallsign(name);
	if (name !== undefined && normalizedName === null) {
		throw new TypeError('A valid callsign is required.');
	}
	const results = await Promise.all([
		requestSupabase(scoresUrl()),
		normalizedName ? requestSupabase(scoresUrl(normalizedName)) : Promise.resolve(null),
	]);
	if (!Array.isArray(results[0])) {
		throw new LeaderboardBackendError('Supabase returned an invalid leaderboard.', 'invalid-response');
	}
	const entries = results[0].map(mapSupabaseScore);
	if (results[1] !== null && !Array.isArray(results[1])) {
		throw new LeaderboardBackendError('Supabase returned an invalid personal best.', 'invalid-response');
	}
	const personalBestRows = Array.isArray(results[1]) ? results[1] : [];
	return {
		entries,
		personalBest: personalBestRows.length > 0 ? mapSupabaseScore(personalBestRows[0]) : null,
	};
}

export async function submitLeaderboardScore(
	submission: ScoreSubmission,
): Promise<LeaderboardScore> {
	const result = await requestSupabase('/rest/v1/rpc/submit_leaderboard_score', {
		method: 'POST',
		body: JSON.stringify({
			p_name: submission.name,
			p_score: submission.score,
		}),
	});
	if (!Array.isArray(result) || result.length !== 1) {
		throw new LeaderboardBackendError('Supabase returned an invalid submission result.', 'invalid-response');
	}
	return mapSupabaseScore(result[0]);
}
