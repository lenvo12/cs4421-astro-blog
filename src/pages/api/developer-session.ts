import type { APIRoute } from 'astro';
import {
	createDeveloperSessionToken,
	DEVELOPER_SESSION_COOKIE,
	DEVELOPER_SESSION_TTL_SECONDS,
	isDeveloperAccessConfigured,
	verifyDeveloperPassword,
} from '../../lib/developer-auth';

function redirect(location: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			'Cache-Control': 'no-store',
			Location: location,
		},
	});
}

function isSameOriginRequest(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true;
	try {
		return new URL(origin).origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

export const POST: APIRoute = async ({ cookies, request }) => {
	if (!isSameOriginRequest(request)) {
		return new Response('Cross-origin requests are not allowed.', {
			status: 403,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return new Response('A valid form submission is required.', {
			status: 400,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	if (formData.get('action') === 'logout') {
		cookies.delete(DEVELOPER_SESSION_COOKIE, { path: '/' });
		return redirect('/');
	}

	if (!isDeveloperAccessConfigured()) {
		return new Response('Developer access is not configured on this server.', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	const candidate = formData.get('password');
	if (typeof candidate !== 'string' || !verifyDeveloperPassword(candidate)) {
		return redirect('/developer-access?error=1');
	}

	cookies.set(DEVELOPER_SESSION_COOKIE, createDeveloperSessionToken(), {
		httpOnly: true,
		secure: import.meta.env.PROD || new URL(request.url).protocol === 'https:',
		sameSite: 'strict',
		path: '/',
		maxAge: DEVELOPER_SESSION_TTL_SECONDS,
	});
	return redirect('/');
};
