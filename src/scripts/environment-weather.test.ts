import { describe, expect, it } from 'vitest';
import {
	blendWeatherWeights,
	createWeatherWeights,
	formatClockTime,
	getDaylightFactor,
	parseClockTime,
	shortestTimeDelta,
	summarizeCurrentWeather,
	summarizeWeatherCode,
	WEATHER_KINDS,
} from './environment-weather';

describe('Open-Meteo weather conditions', () => {
	it.each([
		[0, 'clear'],
		[1, 'cloud'],
		[3, 'cloud'],
		[45, 'fog'],
		[48, 'fog'],
		[51, 'drizzle'],
		[57, 'freezing-drizzle'],
		[61, 'rain'],
		[67, 'freezing-rain'],
		[71, 'snow'],
		[77, 'snow-grains'],
		[80, 'rain-showers'],
		[86, 'snow-showers'],
		[95, 'thunderstorm'],
		[96, 'hail'],
		[99, 'hail'],
	])('maps WMO code %i to %s', (code, kind) => {
		expect(summarizeWeatherCode(code).kind).toBe(kind);
	});

	it('covers every previewable weather family and rejects unknown codes', () => {
		expect(new Set(WEATHER_KINDS)).toEqual(
			new Set([
				'clear', 'cloud', 'fog', 'drizzle', 'freezing-drizzle', 'rain', 'freezing-rain',
				'snow', 'snow-grains', 'rain-showers', 'snow-showers', 'thunderstorm', 'hail',
			]),
		);
		expect(() => summarizeWeatherCode(100)).toThrow(RangeError);
	});

	it('uses measured precipitation when a clear/cloud code disagrees with current rain', () => {
		expect(summarizeCurrentWeather(0, 2.4, 2.4, 0).kind).toBe('rain');
		expect(summarizeCurrentWeather(1, 0.3, 0.2, 0).kind).toBe('drizzle');
		expect(summarizeCurrentWeather(0, 1.2, 0, 0.8).kind).toBe('rain-showers');
		expect(summarizeCurrentWeather(0, 0, 0, 0).kind).toBe('clear');
		expect(summarizeCurrentWeather(61, 4, 4, 0).kind).toBe('rain');
	});
});

describe('time and daylight transitions', () => {
	it('parses valid local times and rejects out-of-range clock values', () => {
		expect(parseClockTime('00:00')).toBe(0);
		expect(parseClockTime('23:59')).toBe(1439);
		expect(parseClockTime('24:00')).toBeNull();
		expect(parseClockTime('12:60')).toBeNull();
		expect(parseClockTime('not-a-time')).toBeNull();
	});

	it('formats values across the midnight boundary', () => {
		expect(formatClockTime(0)).toBe('00:00');
		expect(formatClockTime(1439)).toBe('23:59');
		expect(formatClockTime(1440)).toBe('00:00');
		expect(formatClockTime(-1)).toBe('23:59');
	});

	it('takes the shortest route across midnight in both directions', () => {
		expect(shortestTimeDelta(23 * 60 + 50, 10)).toBe(20);
		expect(shortestTimeDelta(10, 23 * 60 + 50)).toBe(-20);
	});

	it('crosses sunrise and sunset continuously and keeps the night/day endpoints stable', () => {
		const sunrise = 6 * 60;
		const sunset = 18 * 60;
		expect(getDaylightFactor(0, sunrise, sunset)).toBe(0);
		expect(getDaylightFactor(12 * 60, sunrise, sunset)).toBe(1);
		expect(getDaylightFactor(sunrise - 1, sunrise, sunset)).toBeLessThan(0.5);
		expect(getDaylightFactor(sunrise + 1, sunrise, sunset)).toBeGreaterThan(0.5);
		expect(getDaylightFactor(sunset - 1, sunrise, sunset)).toBeGreaterThan(0.5);
		expect(getDaylightFactor(sunset + 1, sunrise, sunset)).toBeLessThan(0.5);
	});

	it('handles sunrise near midnight without a discontinuity', () => {
		const beforeMidnight = getDaylightFactor(23 * 60 + 59, 5, 13 * 60);
		const afterMidnight = getDaylightFactor(0, 5, 13 * 60);
		expect(Math.abs(beforeMidnight - afterMidnight)).toBeLessThan(0.02);
	});

	it('honors polar day and night when sunrise and sunset coincide', () => {
		expect(getDaylightFactor(12 * 60, 0, 0, 1, 1)).toBe(1);
		expect(getDaylightFactor(12 * 60, 0, 0, 1, 0)).toBe(0);
		expect(getDaylightFactor(12 * 60, 0, 0, 0.5, 1)).toBeCloseTo(0.5);
	});
});

describe('weather crossfades', () => {
	it('keeps total weather opacity normalized through and between transitions', () => {
		const clear = createWeatherWeights('clear');
		const storm = createWeatherWeights('thunderstorm');
		for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
			const weights = blendWeatherWeights(clear, storm, progress);
			expect(Array.from(weights.values()).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
			expect(weights.get('thunderstorm')).toBeGreaterThanOrEqual(0);
			expect(weights.get('clear')).toBeGreaterThanOrEqual(0);
		}
		expect(blendWeatherWeights(clear, storm, 0).get('clear')).toBe(1);
		expect(blendWeatherWeights(clear, storm, 1).get('thunderstorm')).toBe(1);
	});
});
