export interface ScoreEntry {
	name: string;
	score: number;
	achievedAt: number;
	summit?: boolean;
}

export const MAX_LEADERBOARD_ENTRIES = 100;

export function rankLeaderboardEntries(entries: readonly ScoreEntry[]): ScoreEntry[] {
	return entries
		.map((entry, index) => ({ entry, index }))
		.sort(
			(left, right) =>
				right.entry.score - left.entry.score ||
				left.entry.achievedAt - right.entry.achievedAt ||
				left.index - right.index,
		)
		.slice(0, MAX_LEADERBOARD_ENTRIES)
		.map(({ entry }) => entry);
}

export function nextScoreAchievementTime(entries: readonly ScoreEntry[], now = Date.now()): number {
	const latestAchievement = entries.reduce(
		(latest, entry) => Math.max(latest, entry.achievedAt),
		0,
	);
	return Math.max(now, latestAchievement + 1);
}
