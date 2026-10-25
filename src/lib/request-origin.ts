export function isSameOriginRequest(request: Request, publicOrigin?: string): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true;

	try {
		const originUrl = new URL(origin);
		if (publicOrigin) {
			const publicOriginUrl = new URL(publicOrigin);
			return originUrl.origin === publicOriginUrl.origin;
		}

		const requestUrl = new URL(request.url);
		const cloudFrontProtocol = request.headers.get('x-cloudfront-viewer-proto')?.trim();
		const forwardedProtocol = cloudFrontProtocol
			?? request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
		const protocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;

		return originUrl.host === requestUrl.host && originUrl.protocol === protocol;
	} catch {
		return false;
	}
}
