import { describe, expect, it } from 'vitest';
import { isSameOriginRequest } from './request-origin';

describe('isSameOriginRequest', () => {
	it('accepts requests without an Origin header', () => {
		expect(isSameOriginRequest(new Request('https://game.example/api'))).toBe(true);
	});

	it('accepts a same-origin HTTPS request', () => {
		const request = new Request('https://game.example/api', {
			headers: { Origin: 'https://game.example' },
		});

		expect(isSameOriginRequest(request)).toBe(true);
	});

	it('uses the CloudFront viewer protocol when ECS receives HTTP from the load balancer', () => {
		const request = new Request('http://game.example/api', {
			headers: {
				Origin: 'https://game.example',
				'X-CloudFront-Viewer-Proto': 'https',
				'X-Forwarded-Proto': 'http',
			},
		});

		expect(isSameOriginRequest(request)).toBe(true);
	});

	it('uses the configured public origin when CloudFront changes the origin host', () => {
		const request = new Request('http://internal-alb.example/api', {
			headers: {
				Origin: 'https://game.example',
				'X-CloudFront-Viewer-Proto': 'https',
			},
		});

		expect(isSameOriginRequest(request, 'https://game.example')).toBe(true);
	});

	it('rejects origins that do not match the configured public origin', () => {
		const request = new Request('http://internal-alb.example/api', {
			headers: {
				Origin: 'https://attacker.example',
				'X-CloudFront-Viewer-Proto': 'https',
			},
		});

		expect(isSameOriginRequest(request, 'https://game.example')).toBe(false);
	});

	it('rejects cross-origin requests even with the CloudFront protocol header', () => {
		const request = new Request('http://game.example/api', {
			headers: {
				Origin: 'https://attacker.example',
				'X-CloudFront-Viewer-Proto': 'https',
			},
		});

		expect(isSameOriginRequest(request)).toBe(false);
	});
});
