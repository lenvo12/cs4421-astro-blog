import type { APIRoute } from 'astro';
import {
	LeaderboardBackendError,
	getLeaderboard,
	normalizeCallsign,
	parseScoreSubmission,
	submitLeaderboardScore,
} from '../../lib/supabase-leaderboard';
import { isSameOriginRequest } from '../../lib/request-origin';

function jsonResponse(
	body: unknown,
	status = 200,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function backendErrorResponse(error: unknown, operation: string): Response {
	if (error instanceof LeaderboardBackendError && error.kind === 'unconfigured') {
		console.error(`Leaderboard ${operation} is unavailable because Supabase is not configured.`);
		return jsonResponse({ error: 'The shared leaderboard is not configured.' }, 503);
	}
	console.error(`Leaderboard ${operation} failed.`, error);
	return jsonResponse({ error: 'The shared leaderboard is temporarily unavailable.' }, 502);
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const requestedName = url.searchParams.get('name');
	const name = requestedName === null ? undefined : normalizeCallsign(requestedName);
	if (requestedName !== null && name === null) {
		return jsonResponse({ error: 'A valid callsign is required.' }, 400);
	}

	try {
		return jsonResponse(await getLeaderboard(name ?? undefined));
	} catch (error) {
		return backendErrorResponse(error, 'read');
	}
};

export const POST: APIRoute = async ({ request }) => {
	if (!isSameOriginRequest(request)) {
		return jsonResponse({ error: 'Cross-origin requests are not allowed.' }, 403);
	}
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > 2_048) {
		return jsonResponse({ error: 'The submission is too large.' }, 413);
	}
	if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
		return jsonResponse({ error: 'A JSON submission is required.' }, 415);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: 'A valid JSON submission is required.' }, 400);
	}
	const submission = parseScoreSubmission(body);
	if (!submission) {
		return jsonResponse({ error: 'The callsign or score is invalid.' }, 400);
	}

	try {
		return jsonResponse(await submitLeaderboardScore(submission));
	} catch (error) {
		return backendErrorResponse(error, 'submission');
	}
};
