export type WeatherKind =
	| 'clear'
	| 'cloud'
	| 'fog'
	| 'drizzle'
	| 'freezing-drizzle'
	| 'rain'
	| 'freezing-rain'
	| 'snow'
	| 'snow-grains'
	| 'rain-showers'
	| 'snow-showers'
	| 'thunderstorm'
	| 'hail';

export const WEATHER_KINDS: readonly WeatherKind[] = [
	'clear',
	'cloud',
	'fog',
	'drizzle',
	'freezing-drizzle',
	'rain',
	'freezing-rain',
	'snow',
	'snow-grains',
	'rain-showers',
	'snow-showers',
	'thunderstorm',
	'hail',
];

export type WeatherWeights = Map<WeatherKind, number>;

export function createWeatherWeights(kind: WeatherKind): WeatherWeights {
	return new Map(
		WEATHER_KINDS.map((weather): [WeatherKind, number] => [weather, weather === kind ? 1 : 0]),
	);
}

export function blendWeatherWeights(
	from: WeatherWeights,
	to: WeatherWeights,
	progress: number,
): WeatherWeights {
	const amount = smoothStep(progress);
	return new Map(
		WEATHER_KINDS.map((kind): [WeatherKind, number] => [
			kind,
			(from.get(kind) ?? 0) * (1 - amount) + (to.get(kind) ?? 0) * amount,
		]),
	);
}

export function summarizeWeatherCode(code: number): { kind: WeatherKind; label: string } {
	if (code === 0) return { kind: 'clear', label: 'Clear' };
	if ([1, 2, 3].includes(code)) return { kind: 'cloud', label: 'Cloudy' };
	if ([45, 48].includes(code)) return { kind: 'fog', label: 'Fog' };
	if ([51, 53, 55].includes(code)) return { kind: 'drizzle', label: 'Drizzle' };
	if ([56, 57].includes(code)) return { kind: 'freezing-drizzle', label: 'Freezing drizzle' };
	if ([61, 63, 65].includes(code)) return { kind: 'rain', label: 'Rain' };
	if ([66, 67].includes(code)) return { kind: 'freezing-rain', label: 'Freezing rain' };
	if ([71, 73, 75].includes(code)) return { kind: 'snow', label: 'Snow' };
	if (code === 77) return { kind: 'snow-grains', label: 'Snow grains' };
	if ([80, 81, 82].includes(code)) return { kind: 'rain-showers', label: 'Rain showers' };
	if ([85, 86].includes(code)) return { kind: 'snow-showers', label: 'Snow showers' };
	if (code === 95) return { kind: 'thunderstorm', label: 'Thunderstorm' };
	if ([96, 99].includes(code)) return { kind: 'hail', label: 'Thunderstorm with hail' };
	throw new RangeError(`Unknown Open-Meteo weather code: ${code}`);
}

export function summarizeCurrentWeather(
	code: number,
	precipitation: number,
	rain: number,
	showers: number,
): { kind: WeatherKind; label: string } {
	const summary = summarizeWeatherCode(code);
	if (summary.kind !== 'clear' && summary.kind !== 'cloud') return summary;
	if (showers > 0) return { kind: 'rain-showers', label: 'Rain showers' };
	if (rain >= 1) return { kind: 'rain', label: 'Rain' };
	if (precipitation > 0 || rain > 0) return { kind: 'drizzle', label: 'Drizzle' };
	return summary;
}

export function parseClockTime(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})/.exec(value);
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23 || minute > 59) return null;
	return hour * 60 + minute;
}

export function formatClockTime(minutes: number): string {
	const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
	const hour = Math.floor(normalized / 60);
	const minute = normalized % 60;
	return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}

export function shortestTimeDelta(from: number, to: number): number {
	return ((to - from + 2160) % 1440) - 720;
}

export function getDaylightFactor(
	time: number,
	sunrise: number,
	sunset: number,
	polarOverrideBlend = 0,
	polarOverrideDaylight = 0,
): number {
	const dawn = smoothStep((shortestTimeDelta(sunrise, time) + 55) / 110);
	const dusk = smoothStep((shortestTimeDelta(sunset, time) + 55) / 110);
	const naturalDaylight = dawn * (1 - dusk);
	const overrideBlend = clamp(polarOverrideBlend);
	return clamp(naturalDaylight * (1 - overrideBlend) + polarOverrideDaylight * overrideBlend);
}

function smoothStep(value: number): number {
	const amount = clamp(value);
	return amount * amount * (3 - 2 * amount);
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}
