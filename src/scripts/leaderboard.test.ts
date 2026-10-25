import { describe, expect, it } from 'vitest';
import {
	MAX_LEADERBOARD_ENTRIES,
	nextScoreAchievementTime,
	rankLeaderboardEntries,
	type ScoreEntry,
} from './leaderboard';

describe('leaderboard ranking', () => {
	it('ranks an equal score by the time it was first achieved', () => {
		const entries: ScoreEntry[] = [
			{ name: 'Later', score: 850, achievedAt: 200 },
			{ name: 'First', score: 850, achievedAt: 100 },
		];

		expect(rankLeaderboardEntries(entries).map(({ name }) => name)).toEqual(['First', 'Later']);
	});

	it('preserves existing order when legacy ties have no distinct achievement time', () => {
		const entries: ScoreEntry[] = [
			{ name: 'Earlier row', score: 850, achievedAt: 0 },
			{ name: 'Later row', score: 850, achievedAt: 0 },
		];

		expect(rankLeaderboardEntries(entries).map(({ name }) => name)).toEqual([
			'Earlier row',
			'Later row',
		]);
	});

	it('keeps only the top 100 entries', () => {
		const entries = Array.from({ length: MAX_LEADERBOARD_ENTRIES + 5 }, (_, index) => ({
			name: `Player ${index}`,
			score: MAX_LEADERBOARD_ENTRIES + 5 - index,
			achievedAt: index,
		}));

		expect(rankLeaderboardEntries(entries)).toHaveLength(MAX_LEADERBOARD_ENTRIES);
		expect(rankLeaderboardEntries(entries).at(-1)?.score).toBe(6);
	});

	it('assigns a later achievement order even if the local clock moves backwards', () => {
		const entries: ScoreEntry[] = [{ name: 'First', score: 850, achievedAt: 500 }];
		expect(nextScoreAchievementTime(entries, 100)).toBe(501);
	});
});
