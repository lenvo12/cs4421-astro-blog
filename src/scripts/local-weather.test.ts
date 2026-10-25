import { describe, expect, it, vi } from 'vitest';
import { LocalWeatherError, requestLocalWeather } from './local-weather';

const position: GeolocationPosition = {
	coords: {
		latitude: 51.5074,
		longitude: -0.1278,
		accuracy: 20,
		altitude: null,
		altitudeAccuracy: null,
		heading: null,
		speed: null,
		toJSON: () => ({
			latitude: 51.5074,
			longitude: -0.1278,
			accuracy: 20,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null,
		}),
	},
	timestamp: 1,
	toJSON: () => ({
		coords: {
			latitude: 51.5074,
			longitude: -0.1278,
			accuracy: 20,
			altitude: null,
			altitudeAccuracy: null,
			heading: null,
			speed: null,
			toJSON: () => ({}),
		},
		timestamp: 1,
	}),
};

function makeResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function makeGeolocation(): Pick<Geolocation, 'getCurrentPosition'> {
	return {
		getCurrentPosition(success) {
			success(position);
		},
	};
}

function makeForecast(weatherCode = 3): object {
	return {
		current: {
			temperature_2m: 12.4,
			is_day: 1,
			weather_code: weatherCode,
			cloud_cover: 76,
			precipitation: 0,
			rain: 0,
			showers: 0,
			time: '2026-10-25T16:00',
		},
		daily: {
			sunrise: ['2026-10-25T07:10'],
			sunset: ['2026-10-25T17:40'],
		},
	};
}

function makeRequestOptions(
	fetcher: typeof fetch,
	extra: Partial<Parameters<typeof requestLocalWeather>[0]> = {},
): Parameters<typeof requestLocalWeather>[0] {
	return {
		signal: new AbortController().signal,
		geolocation: makeGeolocation(),
		fetcher,
		isSecureContext: true,
		...extra,
	};
}

describe('local weather service', () => {
	it('requests rounded coordinates and returns normalized live conditions', async () => {
		const fetcher: typeof fetch = vi.fn(async () => makeResponse(makeForecast()));
		const onStageChange = vi.fn();

		const observation = await requestLocalWeather(
			makeRequestOptions(fetcher, { onStageChange }),
		);

		expect(observation).toMatchObject({
			kind: 'cloud',
			label: 'Cloudy',
			temperatureCelsius: 12.4,
			cloudCoverPercent: 76,
			precipitationMillimeters: 0,
			isDay: true,
			observedAt: '2026-10-25T16:00',
			sunrise: '07:10',
			sunset: '17:40',
		});
		expect(onStageChange.mock.calls).toEqual([[ 'location' ], [ 'forecast' ]]);

		const [requestedUrl] = vi.mocked(fetcher).mock.calls[0];
		const requestUrl = new URL(`${requestedUrl}`);
		expect(requestUrl.origin + requestUrl.pathname).toBe(
			'https://api.open-meteo.com/v1/forecast',
		);
		expect(requestUrl.searchParams.get('latitude')).toBe('51.51');
		expect(requestUrl.searchParams.get('longitude')).toBe('-0.13');
		expect(requestUrl.searchParams.get('current')).toContain('weather_code');
		expect(observation.sourceUrl).toContain('https://open-meteo.com/en/docs?');
	});

	it('retries a transient network failure and uses the returned non-clear condition', async () => {
		const fetcher: typeof fetch = vi.fn()
			.mockRejectedValueOnce(new TypeError('Temporary connection failure'))
			.mockResolvedValueOnce(makeResponse(makeForecast(61)));

		const observation = await requestLocalWeather(makeRequestOptions(fetcher));

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(observation.kind).toBe('rain');
		expect(observation.label).toBe('Rain');
	});

	it('does not contact Open-Meteo when the browser denies location', async () => {
		const denied = {
			code: 1,
			message: 'Permission denied',
			PERMISSION_DENIED: 1,
			POSITION_UNAVAILABLE: 2,
			TIMEOUT: 3,
		} satisfies GeolocationPositionError;
		const geolocation: Pick<Geolocation, 'getCurrentPosition'> = {
			getCurrentPosition(_success, error) {
				error?.(denied);
			},
		};
		const fetcher: typeof fetch = vi.fn();

		await expect(requestLocalWeather(
			makeRequestOptions(fetcher, { geolocation }),
		)).rejects.toMatchObject({ reason: 'permission-denied' });
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('rejects insecure contexts before requesting location', async () => {
		const geolocation = makeGeolocation();
		const getCurrentPosition = vi.spyOn(geolocation, 'getCurrentPosition');

		await expect(requestLocalWeather(
			makeRequestOptions(vi.fn(), { geolocation, isSecureContext: false }),
		)).rejects.toMatchObject({ reason: 'insecure-context' });
		expect(getCurrentPosition).not.toHaveBeenCalled();
	});

	it('rejects invalid or unsupported forecast data instead of treating it as clear', async () => {
		const fetcher: typeof fetch = vi.fn(async () => makeResponse(makeForecast(100)));

		await expect(requestLocalWeather(makeRequestOptions(fetcher))).rejects.toMatchObject({
			reason: 'invalid-response',
		});
	});

	it('reports service errors from Open-Meteo', async () => {
		const fetcher: typeof fetch = vi.fn(async () =>
			makeResponse({ error: true, reason: 'Invalid coordinates' }),
		);

		await expect(requestLocalWeather(makeRequestOptions(fetcher))).rejects.toMatchObject({
			reason: 'service',
			message: 'Invalid coordinates',
		});
	});

	it('stops a pending location lookup when the user disables weather', async () => {
		const controller = new AbortController();
		const geolocation: Pick<Geolocation, 'getCurrentPosition'> = {
			getCurrentPosition() {},
		};
		const pending = requestLocalWeather(
			makeRequestOptions(vi.fn(), {
				geolocation,
				signal: controller.signal,
			}),
		);
		controller.abort();

		await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
	});

	it('maps the failure to a typed weather error', () => {
		expect(new LocalWeatherError('network', 'offline')).toMatchObject({
			name: 'LocalWeatherError',
			reason: 'network',
			message: 'offline',
		});
	});
});
