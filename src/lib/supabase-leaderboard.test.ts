import { describe, expect, it } from 'vitest';
import {
	normalizeCallsign,
	parseScoreSubmission,
} from './supabase-leaderboard';

describe('leaderboard submission validation', () => {
	it('trims and collapses spaces without changing callsign capitalization', () => {
		expect(normalizeCallsign('  Cloud   Skater  ')).toBe('Cloud Skater');
		expect(normalizeCallsign('Pip')).not.toBe(normalizeCallsign('pip'));
	});

	it('accepts valid names and scores through the summit limit', () => {
		expect(parseScoreSubmission({ name: 'Pip', score: 10_000 })).toEqual({
			name: 'Pip',
			score: 10_000,
		});
	});

	it('rejects missing names and invalid score values', () => {
		expect(parseScoreSubmission({ name: '   ', score: 5 })).toBeNull();
		expect(parseScoreSubmission({ name: 'Pip', score: 0 })).toBeNull();
		expect(parseScoreSubmission({ name: 'Pip', score: 10_001 })).toBeNull();
		expect(parseScoreSubmission({ name: 'Pip', score: 1.5 })).toBeNull();
		expect(parseScoreSubmission(null)).toBeNull();
	});
});
