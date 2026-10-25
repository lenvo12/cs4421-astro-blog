import { summarizeCurrentWeather, type WeatherKind } from './environment-weather';

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

export type WeatherLoadStage = 'location' | 'forecast';

export type LocalWeatherFailureReason =
	| 'insecure-context'
	| 'location-unavailable'
	| 'permission-denied'
	| 'location-timeout'
	| 'network'
	| 'service'
	| 'invalid-response'
	| 'cancelled';

export class LocalWeatherError extends Error {
	constructor(
		readonly reason: LocalWeatherFailureReason,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'LocalWeatherError';
	}
}

export interface LocalWeatherObservation {
	kind: WeatherKind;
	label: string;
	temperatureCelsius: number;
	cloudCoverPercent: number;
	precipitationMillimeters: number;
	isDay: boolean;
	observedAt: string;
	sunrise: string | null;
	sunset: string | null;
	sourceUrl: string;
}

interface CurrentWeatherResponse {
	temperature_2m: number;
	is_day: number;
	weather_code: number;
	cloud_cover: number;
	precipitation: number;
	rain: number;
	showers: number;
	time: string;
}

interface ForecastResponse {
	current?: CurrentWeatherResponse;
	daily?: {
		sunrise?: string[];
		sunset?: string[];
	};
	error?: boolean;
	reason?: string;
}

interface WeatherRequestOptions {
	signal: AbortSignal;
	geolocation?: Pick<Geolocation, 'getCurrentPosition'> | null;
	fetcher?: typeof fetch;
	isSecureContext?: boolean;
	onStageChange?: (stage: WeatherLoadStage) => void;
	timeoutMs?: number;
}

export async function requestLocalWeather({
	signal,
	geolocation,
	fetcher = fetch,
	isSecureContext = globalThis.isSecureContext,
	onStageChange,
	timeoutMs = REQUEST_TIMEOUT_MS,
}: WeatherRequestOptions): Promise<LocalWeatherObservation> {
	if (!isSecureContext) {
		throw new LocalWeatherError(
			'insecure-context',
			'Local weather requires HTTPS or localhost.',
		);
	}
	if (signal.aborted) throw cancelledError();

	const locationProvider = geolocation === undefined
		? typeof navigator === 'undefined' ? null : navigator.geolocation
		: geolocation;
	if (!locationProvider) {
		throw new LocalWeatherError(
			'location-unavailable',
			'Location is unavailable in this browser.',
		);
	}

	onStageChange?.('location');
	const position = await getPosition(locationProvider, signal, timeoutMs);
	const { latitude, longitude } = position.coords;
	if (
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude) ||
		latitude < -90 ||
		latitude > 90 ||
		longitude < -180 ||
		longitude > 180
	) {
		throw new LocalWeatherError('invalid-response', 'The browser returned invalid coordinates.');
	}

	const roundedLatitude = latitude.toFixed(2);
	const roundedLongitude = longitude.toFixed(2);
	const query = new URLSearchParams({
		latitude: roundedLatitude,
		longitude: roundedLongitude,
		current: 'temperature_2m,is_day,weather_code,cloud_cover,precipitation,rain,showers',
		daily: 'sunrise,sunset',
		timezone: 'auto',
		forecast_days: '1',
	});
	const sourceQuery = new URLSearchParams({
		latitude: roundedLatitude,
		longitude: roundedLongitude,
		current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover',
		timezone: 'auto',
	});

	onStageChange?.('forecast');
	const response = await fetchForecast(
		`${OPEN_METEO_ENDPOINT}?${query}`,
		signal,
		fetcher,
		timeoutMs,
	);

	let result: ForecastResponse;
	try {
		result = await response.json() as ForecastResponse;
	} catch (error) {
		throw new LocalWeatherError(
			'invalid-response',
			'Open-Meteo returned an unreadable response.',
			{ cause: error },
		);
	}

	if (result.error) {
		throw new LocalWeatherError(
			'service',
			result.reason ?? 'Open-Meteo could not provide weather for this location.',
		);
	}

	const current = result.current;
	if (
		!current ||
		!Number.isFinite(current.temperature_2m) ||
		!Number.isInteger(current.weather_code) ||
		!Number.isFinite(current.cloud_cover) ||
		current.cloud_cover < 0 ||
		current.cloud_cover > 100 ||
		!Number.isFinite(current.precipitation) ||
		current.precipitation < 0 ||
		!Number.isFinite(current.rain) ||
		current.rain < 0 ||
		!Number.isFinite(current.showers) ||
		current.showers < 0 ||
		![0, 1].includes(current.is_day) ||
		typeof current.time !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current.time)
	) {
		throw new LocalWeatherError(
			'invalid-response',
			'Open-Meteo returned incomplete or invalid current conditions.',
		);
	}

	let summary: ReturnType<typeof summarizeCurrentWeather>;
	try {
		summary = summarizeCurrentWeather(
			current.weather_code,
			current.precipitation,
			current.rain,
			current.showers,
		);
	} catch (error) {
		throw new LocalWeatherError(
			'invalid-response',
			'Open-Meteo returned an unsupported weather code.',
			{ cause: error },
		);
	}

	return {
		kind: summary.kind,
		label: summary.label,
		temperatureCelsius: current.temperature_2m,
		cloudCoverPercent: current.cloud_cover,
		precipitationMillimeters: current.precipitation,
		isDay: current.is_day === 1,
		observedAt: current.time,
		sunrise: getClockTime(result.daily?.sunrise?.[0]),
		sunset: getClockTime(result.daily?.sunset?.[0]),
		sourceUrl: `https://open-meteo.com/en/docs?${sourceQuery}`,
	};
}

function getPosition(
	geolocation: Pick<Geolocation, 'getCurrentPosition'>,
	signal: AbortSignal,
	timeoutMs: number,
): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timeout = globalThis.setTimeout(() => {
			finish(() => reject(new LocalWeatherError(
				'location-timeout',
				'Location lookup timed out.',
			)));
		}, timeoutMs);

		const removeAbortHandler = (): void => signal.removeEventListener('abort', onAbort);
		const finish = (complete: () => void): void => {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timeout);
			removeAbortHandler();
			complete();
		};
		const onAbort = (): void => finish(() => reject(cancelledError()));

		signal.addEventListener('abort', onAbort, { once: true });
		if (signal.aborted) {
			onAbort();
			return;
		}

		try {
			geolocation.getCurrentPosition(
				(position) => finish(() => resolve(position)),
				(error) => finish(() => reject(mapGeolocationError(error))),
				{
					enableHighAccuracy: false,
					timeout: timeoutMs,
					maximumAge: 300_000,
				},
			);
		} catch (error) {
			finish(() => reject(new LocalWeatherError(
				'location-unavailable',
				'The browser could not start a location lookup.',
				{ cause: error },
			)));
		}
	});
}

function mapGeolocationError(error: GeolocationPositionError): LocalWeatherError {
	if (error.code === error.PERMISSION_DENIED) {
		return new LocalWeatherError('permission-denied', 'Location permission was denied.');
	}
	if (error.code === error.TIMEOUT) {
		return new LocalWeatherError('location-timeout', 'Location lookup timed out.');
	}
	return new LocalWeatherError(
		'location-unavailable',
		'The browser could not determine your location.',
	);
}

async function fetchForecast(
	url: string,
	signal: AbortSignal,
	fetcher: typeof fetch,
	timeoutMs: number,
): Promise<Response> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
		if (signal.aborted) throw cancelledError();
		const controller = new AbortController();
		let timedOut = false;
		const onAbort = (): void => controller.abort();
		signal.addEventListener('abort', onAbort, { once: true });
		const timeout = globalThis.setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		try {
			const response = await fetcher(url, { signal: controller.signal });
			if (response.ok) return response;
			if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
				lastError = new LocalWeatherError(
					'service',
					`Open-Meteo temporarily returned HTTP ${response.status}.`,
				);
			} else {
				throw new LocalWeatherError(
					'service',
					`Open-Meteo returned HTTP ${response.status}.`,
				);
			}
		} catch (error) {
			if (signal.aborted) throw cancelledError();
			if (timedOut) {
				lastError = new LocalWeatherError(
					'network',
					'The Open-Meteo request timed out.',
					{ cause: error },
				);
			} else if (
				error instanceof LocalWeatherError &&
				error.reason === 'service'
			) {
				throw error;
			} else {
				lastError = new LocalWeatherError(
					'network',
					'Could not reach Open-Meteo.',
					{ cause: error },
				);
			}
		} finally {
			globalThis.clearTimeout(timeout);
			signal.removeEventListener('abort', onAbort);
		}

		if (attempt < MAX_RETRIES) await waitBeforeRetry(signal);
	}

	if (lastError instanceof LocalWeatherError) throw lastError;
	throw new LocalWeatherError('network', 'Could not reach Open-Meteo.');
}

function waitBeforeRetry(signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(cancelledError());
			return;
		}

		const timeout = globalThis.setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, 350);
		const onAbort = (): void => {
			globalThis.clearTimeout(timeout);
			signal.removeEventListener('abort', onAbort);
			reject(cancelledError());
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

function getClockTime(value: string | undefined): string | null {
	if (typeof value !== 'string') return null;
	const time = value.split('T')[1];
	return time && /^\d{2}:\d{2}$/.test(time) ? time : null;
}

function cancelledError(): LocalWeatherError {
	return new LocalWeatherError('cancelled', 'Weather lookup was cancelled.');
}
