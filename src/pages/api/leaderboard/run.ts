import type { APIRoute } from 'astro';
import {
	LeaderboardBackendError,
	issueScoreRunToken,
	normalizeCallsign,
} from '../../../lib/supabase-leaderboard';
import { consumeScoreRunRateLimit } from '../../../lib/score-run-protection';
import { isSameOriginRequest } from '../../../lib/request-origin';

function jsonResponse(
	body: unknown,
	status = 200,
	extraHeaders: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
			...extraHeaders,
		},
	});
}

export const POST: APIRoute = async ({ request }) => {
	if (!isSameOriginRequest(request, process.env.PUBLIC_SITE_ORIGIN)) {
		return jsonResponse({ error: 'Cross-origin requests are not allowed.' }, 403);
	}
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > 2_048) {
		return jsonResponse({ error: 'The request is too large.' }, 413);
	}
	if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
		return jsonResponse({ error: 'A JSON request is required.' }, 415);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: 'A valid JSON request is required.' }, 400);
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return jsonResponse({ error: 'A valid callsign is required.' }, 400);
	}
	const name = normalizeCallsign((body as Record<string, unknown>).name);
	if (!name) return jsonResponse({ error: 'A valid callsign is required.' }, 400);

	const retryAfterSeconds = consumeScoreRunRateLimit('start', name);
	if (retryAfterSeconds !== null) {
		return jsonResponse(
			{ error: 'Too many game starts for this callsign. Try again shortly.' },
			429,
			{ 'Retry-After': `${retryAfterSeconds}` },
		);
	}

	try {
		return jsonResponse({ token: issueScoreRunToken(name) });
	} catch (error) {
		if (error instanceof LeaderboardBackendError && error.kind === 'unconfigured') {
			console.error('A score run could not start because Supabase is not configured.');
			return jsonResponse({ error: 'Score validation is not configured.' }, 503);
		}
		console.error('A score run could not be issued.', error);
		return jsonResponse({ error: 'Score validation is temporarily unavailable.' }, 502);
	}
};
