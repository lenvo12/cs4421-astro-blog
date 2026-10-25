import { describe, expect, it } from 'vitest';
import {
	createReachablePlatform,
	createReachablePlatformRoutes,
	createSummitPlatform,
	assignSlingshotPlatforms,
	makeHighestPlatformLayersStationary,
	climbScoreAtAltitude,
	boostLaunchSpeed,
	boostsAllowedAtAltitude,
	finalDifficultyAtAltitude,
	slingshotLaunchSpeed,
	shouldUseRescueArm,
	getFishSize,
	getDirectionalFlingVelocity,
	getCourseStageIndex,
	getCourseStageBlend,
	getCourseStageWeight,
	getCourseStageMidpointAltitude,
	hasReachablePickup,
	hasReachablePlatform,
	canLandOnPlatform,
	gravityAtAltitude,
	integrateBoostMotion,
	steeringResponseAtAltitude,
	summitCameraLimit,
	updateNebulaPlatform,
	COURSE_MAX_ALTITUDE,
	COURSE_MAX_METERS,
	COURSE_STAGE_COUNT,
	COURSE_STAGES,
	FINAL_DIFFICULTY_START_ALTITUDE,
	GRAVITY,
	JUMP_SPEED,
	NO_BOOST_START_ALTITUDE,
	resizePlatformHorizontally,
	updateMovingPlatform,
	type Platform,
} from './game-physics';

function seededRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
}

describe('directional collision fling', () => {
	it('keeps the impact direction while setting the requested launch speed', () => {
		const fling = getDirectionalFlingVelocity(-3, 4, 1500);
		expect(fling.x).toBeCloseTo(-900);
		expect(fling.y).toBeCloseTo(1200);
		expect(Math.hypot(fling.x, fling.y)).toBeCloseTo(1500);
	});

	it('rejects a missing direction or invalid fling speed', () => {
		expect(() => getDirectionalFlingVelocity(0, 0, 100)).toThrow(RangeError);
		expect(() => getDirectionalFlingVelocity(1, 0, -1)).toThrow(RangeError);
	});
});

describe('reachable platform generation', () => {
	it('creates a wide, stable summit platform centered in the canvas', () => {
		const approach: Platform = {
			x: 340, y: 220, width: 60, moving: true, speed: 80, direction: 1,
			minX: 300, maxX: 500, cracked: true, falling: false, fallSpeed: 0, breakAmount: 0,
			slingshot: true,
		};
		const summit = createSummitPlatform(approach, 800, 140);

		expect(summit.summit).toBe(true);
		expect(summit.y).toBe(140);
		expect(summit.width).toBeGreaterThan(approach.width);
		expect(summit.x + summit.width / 2).toBe(400);
		expect(summit.moving).toBe(false);
		expect(summit.cracked).toBe(false);
		expect(summit.falling).toBe(false);
		expect(summit.slingshot).toBe(false);
		expect(
			hasReachablePlatform(approach, [summit], (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 800 * 0.38),
		).toBe(true);
	});

	it('keeps every platform in the four highest course layers stationary', () => {
		const platforms: Platform[] = Array.from({ length: 6 }, (_, index) => ({
			x: 100,
			y: 100 + index * 110,
			width: 64,
			moving: true,
			speed: 70,
			direction: 1,
			minX: 80,
			maxX: 140,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		}));
		const alternate = { ...platforms[0], y: platforms[0].y + 8 };
		platforms.push(alternate);
		const summit: Platform = {
			...platforms[0],
			y: 0,
			moving: false,
			speed: 0,
			summit: true,
		};
		platforms.push(summit);

		makeHighestPlatformLayersStationary(platforms, 4);

		for (const platform of [...platforms.slice(0, 4), alternate]) {
			expect(platform.moving).toBe(false);
			expect(platform.speed).toBe(0);
			expect(platform.minX).toBe(platform.x);
			expect(platform.maxX).toBe(platform.x);
		}
		expect(platforms[4].moving).toBe(true);
		expect(platforms[5].moving).toBe(true);
		expect(summit.moving).toBe(false);
	});

	it('defines ten consecutive 1,000-metre stages ending at 10,000 metres', () => {
		expect(COURSE_STAGES).toHaveLength(COURSE_STAGE_COUNT);
		expect(COURSE_MAX_METERS).toBe(10000);
		expect(COURSE_MAX_ALTITUDE).toBe(100000);
		expect(new Set(COURSE_STAGES.map((stage) => stage.flyingObject)).size).toBe(10);
		expect(getCourseStageIndex(0)).toBe(0);
		expect(getCourseStageIndex(9999)).toBe(0);
		expect(getCourseStageIndex(10000)).toBe(1);
		expect(getCourseStageIndex(COURSE_MAX_ALTITUDE)).toBe(9);
		expect(COURSE_STAGES.map((stage) => stage.name)).toEqual([
			"Earth's Atmosphere",
			'The Moon',
			'Mars',
			'Jupiter',
			'Saturn',
			'Uranus',
			'Neptune',
			'Kuiper Belt',
			'Oort Cloud',
			'Interstellar Space',
		]);
	});

	it('crossfades only adjacent course regions in a broad smooth transition', () => {
		expect(getCourseStageBlend(8399)).toEqual({ from: 0, to: 0, amount: 0 });
		expect(getCourseStageBlend(8400)).toEqual({ from: 0, to: 1, amount: 0 });
		expect(getCourseStageBlend(10000)).toEqual({ from: 0, to: 1, amount: 0.5 });
		expect(getCourseStageBlend(11600)).toEqual({ from: 0, to: 1, amount: 1 });
		expect(getCourseStageBlend(11601)).toEqual({ from: 1, to: 1, amount: 0 });
		expect(getCourseStageWeight(10000, 0)).toBe(0.5);
		expect(getCourseStageWeight(10000, 1)).toBe(0.5);
		expect(getCourseStageWeight(10000, 2)).toBe(0);
	});

	it('places major planets at the midpoint of their course regions', () => {
		expect(Array.from({ length: 7 }, (_, stage) =>
			getCourseStageMidpointAltitude(stage + 1),
		)).toEqual([15000, 25000, 35000, 45000, 55000, 65000, 75000]);
	});

	it('assigns slingshots to about one percent of permanent stationary platforms only', () => {
		const platform: Platform = {
			x: 100, y: 300, width: 80, moving: false, speed: 0, direction: 1,
			minX: 100, maxX: 100, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		const generated = Array.from({ length: 2000 }, () => ({ ...platform }));
		assignSlingshotPlatforms(generated, seededRandom(4421));

		const rate = generated.filter((item) => item.slingshot).length / generated.length;
		expect(rate).toBeGreaterThan(0.007);
		expect(rate).toBeLessThan(0.013);

		const ineligible = [
			{ ...platform, moving: true },
			{ ...platform, cracked: true },
			{ ...platform, falling: true },
			{ ...platform, nebula: true },
		];
		assignSlingshotPlatforms(ineligible, () => 0);
		expect(ineligible.every((item) => !item.slingshot)).toBe(true);
	});

	it('launches slingshots with enough speed for a 500-metre ballistic rise', () => {
		expect(slingshotLaunchSpeed(0) ** 2 / (2 * GRAVITY)).toBeCloseTo(5000);
		expect(slingshotLaunchSpeed(80000) ** 2 / (2 * (GRAVITY * 0.6))).toBeCloseTo(5000);
		expect(slingshotLaunchSpeed(79000) ** 2 / 2).toBeCloseTo(
			1000 * GRAVITY + 4000 * GRAVITY * 0.6,
		);
		for (const startingAltitude of [0, 79000, 80000]) {
			let velocity = slingshotLaunchSpeed(startingAltitude);
			let rise = 0;
			const step = 0.0001;
			while (velocity > 0) {
				velocity -= gravityAtAltitude(startingAltitude + rise) * step;
				rise += Math.max(0, velocity) * step;
			}
			expect(rise).toBeCloseTo(5000, 0);
		}
	});

	it('maintains the slingshot rise with the game’s 32 ms frame cap', () => {
		for (const startingAltitude of [0, 79000, 80000]) {
			let velocity = -slingshotLaunchSpeed(startingAltitude);
			let rise = 0;
			let completed = false;
			let frames = 0;
			while (!completed && frames < 1000) {
				const motion = integrateBoostMotion(
					velocity,
					startingAltitude + rise,
					GRAVITY,
					0.032,
				);
				velocity = motion.velocity;
				rise -= motion.displacement;
				completed = motion.completed;
				frames += 1;
			}
			expect(completed).toBe(true);
			expect(rise).toBeCloseTo(5000, 5);
		}
	});

	it('ramps the final 2,500 metres and removes boosts in the final 1,000 metres', () => {
		expect(FINAL_DIFFICULTY_START_ALTITUDE).toBe(75000);
		expect(finalDifficultyAtAltitude(75000)).toBe(0);
		expect(finalDifficultyAtAltitude(87500)).toBeCloseTo(0.5);
		expect(finalDifficultyAtAltitude(COURSE_MAX_ALTITUDE)).toBe(1);
		expect(NO_BOOST_START_ALTITUDE).toBe(90000);
		expect(boostsAllowedAtAltitude(NO_BOOST_START_ALTITUDE - 1)).toBe(true);
		expect(boostsAllowedAtAltitude(NO_BOOST_START_ALTITUDE)).toBe(false);

		const platform: Platform = {
			x: 100, y: 300, width: 80, moving: false, speed: 0, direction: 1,
			minX: 100, maxX: 100, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		const finalLedge = { ...platform };
		assignSlingshotPlatforms([finalLedge], () => 0, NO_BOOST_START_ALTITUDE);
		expect(finalLedge.slingshot).toBe(false);
	});

	it('keeps in-air scores below 10 km and parks the summit safely in view', () => {
		const canvasHeight = 330;
		const groundSurface = 60;
		const scrollLine = canvasHeight * 0.39;
		const playerRadius = 16;
		const cameraLimit = summitCameraLimit(
			canvasHeight,
			groundSurface,
			scrollLine,
			playerRadius,
		);
		const summitScreenY = canvasHeight - groundSurface - COURSE_MAX_ALTITUDE + cameraLimit;

		expect(climbScoreAtAltitude(COURSE_MAX_ALTITUDE)).toBe(COURSE_MAX_METERS - 1);
		expect(climbScoreAtAltitude(COURSE_MAX_ALTITUDE + 5000)).toBe(COURSE_MAX_METERS - 1);
		expect(summitScreenY).toBeCloseTo(scrollLine + playerRadius + 24);
	});

	it('uses the robotic rescue arm on one fifth of fall failures', () => {
		const random = seededRandom(901);
		const rescued = Array.from({ length: 4000 }, () => shouldUseRescueArm(random))
			.filter(Boolean).length;
		expect(rescued / 4000).toBeGreaterThan(0.18);
		expect(rescued / 4000).toBeLessThan(0.22);
		expect(shouldUseRescueArm(() => 0.19)).toBe(true);
		expect(shouldUseRescueArm(() => 0.2)).toBe(false);
	});

	it('only considers intact ledges within jump height and horizontal reach rescue-safe', () => {
		const platform: Platform = {
			x: 100, y: 300, width: 80, moving: false, speed: 0, direction: 1,
			minX: 100, maxX: 100, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		const next: Platform = { ...platform, x: 190, y: 190 };
		expect(hasReachablePlatform(platform, [next], 140, 160)).toBe(true);
		expect(hasReachablePlatform(platform, [{ ...next, y: 150 }], 140, 160)).toBe(false);
		expect(hasReachablePlatform(platform, [{ ...next, x: 400 }], 140, 160)).toBe(false);
		expect(hasReachablePlatform(platform, [{ ...next, falling: true }], 140, 160)).toBe(false);
		expect(
			hasReachablePlatform(
				platform,
				[{ ...next, nebula: true, opacity: 0.49 }],
				140,
				160,
			),
		).toBe(true);
		expect(
			hasReachablePlatform(
				platform,
				[{ ...next, nebula: true, opacity: 0 }],
				140,
				160,
			),
		).toBe(true);
	});

	it('detects a fish Pip can already reach before dispatching a rescue', () => {
		const platform: Platform = {
			x: 100, y: 300, width: 80, moving: false, speed: 0, direction: 1,
			minX: 100, maxX: 100, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		expect(hasReachablePickup(platform, [{ x: 140, y: 258 }], 138, 120)).toBe(true);
		expect(hasReachablePickup(platform, [{ x: 450, y: 258 }], 138, 120)).toBe(false);
		expect(hasReachablePickup(platform, [{ x: 140, y: 120 }], 138, 120)).toBe(false);
	});

	it('applies low gravity and sluggish steering only above 8,000 metres', () => {
		expect(gravityAtAltitude(79999)).toBe(GRAVITY);
		expect(gravityAtAltitude(80000)).toBe(GRAVITY * 0.6);
		expect(steeringResponseAtAltitude(79999)).toBe(1);
		expect(steeringResponseAtAltitude(80000)).toBe(0.7);
	});

	it('keeps nebula ledges solid to physics while they disappear visually', () => {
		const platform: Platform = {
			x: 100, y: 300, width: 80, moving: false, speed: 0, direction: 1,
			minX: 100, maxX: 100, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
			nebula: true, nebulaPhase: 0, opacity: 1,
		};
		expect(canLandOnPlatform(platform)).toBe(true);
		updateNebulaPlatform(platform, 1);
		expect(platform.opacity).toBeCloseTo(0.5);
		expect(canLandOnPlatform(platform)).toBe(true);
		updateNebulaPlatform(platform, 0.2);
		expect(platform.opacity).toBeCloseTo(0.4);
		expect(canLandOnPlatform(platform)).toBe(true);
		updateNebulaPlatform(platform, 1.3);
		expect(platform.opacity).toBe(0);
		expect(canLandOnPlatform(platform)).toBe(true);
		updateNebulaPlatform(platform, 1.5);
		expect(platform.opacity).toBeCloseTo(0.5);
		updateNebulaPlatform(platform, 0.5);
		expect(platform.opacity).toBe(1);
		expect(canLandOnPlatform({ ...platform, falling: true })).toBe(false);
	});

	it('spawns disappearing ledges only above 7,000 metres at the requested rate', () => {
		const previous: Platform = {
			x: 360, y: 400, width: 80, moving: false, speed: 0, direction: 1,
			minX: 0, maxX: 0, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		const below = Array.from({ length: 400 }, (_, seed) =>
			createReachablePlatform(previous, 800, seededRandom(seed + 1), 69999),
		);
		const above = Array.from({ length: 1200 }, (_, seed) =>
			createReachablePlatform(previous, 800, seededRandom(seed + 1), 70000),
		);
		expect(below.some((platform) => platform.nebula)).toBe(false);
		const ratio = above.filter((platform) => platform.nebula).length / above.length;
		expect(ratio).toBeGreaterThan(0.16);
		expect(ratio).toBeLessThan(0.24);
	});

	it('increases platform spacing, moving chance, and cracked ledges with altitude', () => {
		const lowRandom = seededRandom(73);
		const highRandom = seededRandom(73);
		const base: Platform = {
			x: 360, y: 400, width: 80, moving: false, speed: 0, direction: 1,
			minX: 0, maxX: 0, cracked: false, falling: false, fallSpeed: 0, breakAmount: 0,
		};
		const low = Array.from({ length: 500 }, () =>
			createReachablePlatform(base, 800, lowRandom, 0),
		);
		const high = Array.from({ length: 500 }, () =>
			createReachablePlatform(base, 800, highRandom, COURSE_MAX_ALTITUDE),
		);
		const movingRate = (route: Platform[]) => route.filter((platform) => platform.moving).length;
		const crackedRate = (route: Platform[]) => route.filter((platform) => platform.cracked).length;
		const averageGap = (route: Platform[]) =>
			route.reduce((sum, platform) => sum + (base.y - platform.y), 0) / route.length;

		expect(averageGap(high)).toBeGreaterThan(averageGap(low));
		expect(movingRate(high)).toBeGreaterThan(movingRate(low));
		expect(crackedRate(high)).toBeGreaterThan(crackedRate(low));
	});

	it.each([280, 760])('keeps a generated route climbable through all 10,000 metres at width %i', (width) => {
		const random = seededRandom(width + 10000);
		const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
		let previous: Platform = {
			x: (width - 60) / 2,
			y: COURSE_MAX_ALTITUDE,
			width: 60,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 0,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		let layers = 0;
		while (previous.y > 0 && layers < 1000) {
			const layer = createReachablePlatformRoutes(
				[previous],
				width,
				random,
				COURSE_MAX_ALTITUDE - previous.y,
			);
			const next = layer[0];
			if (next.y <= 0) next.y = 0;
			const gap = previous.y - next.y;
			expect(gap).toBeGreaterThan(0);
			expect(gap).toBeLessThan(maxJumpHeight);
			expect(next.x).toBeGreaterThanOrEqual(0);
			expect(next.x + next.width).toBeLessThanOrEqual(width);
			previous = next;
			layers += 1;
		}

		expect(previous.y).toBe(0);
		expect(layers).toBeLessThan(1000);
	});

	it('resizes moving platforms and keeps their travel lanes within the new canvas', () => {
		const platform: Platform = {
			x: 280,
			y: 200,
			width: 80,
			moving: true,
			speed: 120,
			direction: 1,
			minX: 180,
			maxX: 340,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		resizePlatformHorizontally(platform, 0.5, 200);

		expect(platform.width).toBe(40);
		expect(platform.x).toBe(140);
		expect(platform.minX).toBe(90);
		expect(platform.maxX).toBe(160);
		expect(platform.speed).toBe(60);
		expect(platform.x).toBeGreaterThanOrEqual(platform.minX);
		expect(platform.x).toBeLessThanOrEqual(platform.maxX);
		expect(platform.maxX + platform.width).toBeLessThanOrEqual(200);
	});

	it('clamps a resized moving lane when the new canvas is narrower', () => {
		const platform: Platform = {
			x: 270,
			y: 200,
			width: 80,
			moving: true,
			speed: 120,
			direction: 1,
			minX: 200,
			maxX: 320,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		resizePlatformHorizontally(platform, 0.5, 120);

		expect(platform.minX).toBeLessThanOrEqual(platform.x);
		expect(platform.x).toBeLessThanOrEqual(platform.maxX);
		expect(platform.maxX + platform.width).toBeLessThanOrEqual(120);
	});

	it.each([280, 420, 760])('keeps each generated ledge reachable at canvas width %i', (width) => {
		const random = seededRandom(width);
		const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
		let previous: Platform = {
			x: (width - Math.max(76, Math.min(98, width * 0.25))) / 2,
			y: 360,
			width: Math.max(76, Math.min(98, width * 0.25)),
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: width,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		for (let index = 0; index < 1000; index += 1) {
			const next = createReachablePlatform(previous, width, random);
			const verticalGap = previous.y - next.y;
			const horizontalGap = Math.abs(
				previous.x + previous.width / 2 - next.x - next.width / 2,
			);

			expect(verticalGap).toBeGreaterThanOrEqual(104);
			expect(verticalGap).toBeLessThanOrEqual(112);
			expect(verticalGap).toBeLessThan(maxJumpHeight);
			expect(horizontalGap).toBeLessThanOrEqual(Math.min(48, width * 0.17));
			expect(next.x).toBeGreaterThanOrEqual(0);
			expect(next.x + next.width).toBeLessThanOrEqual(width);
			expect(next.minX).toBeLessThanOrEqual(next.x);
			expect(next.maxX).toBeGreaterThanOrEqual(next.x);
			previous = next;
		}
	});

	it('creates a mix of moving and stationary ledges', () => {
		const random = seededRandom(197);
		let previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 720,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		let movingCount = 0;
		const count = 500;

		for (let index = 0; index < count; index += 1) {
			previous = createReachablePlatform(previous, 800, random);
			if (previous.moving) {
				movingCount += 1;
				expect(previous.speed).toBeGreaterThan(0);
				expect(previous.minX).toBeLessThanOrEqual(previous.x);
				expect(previous.maxX).toBeGreaterThanOrEqual(previous.x);
			}
		}

		expect(movingCount).toBeGreaterThan(count * 0.04);
		expect(movingCount).toBeLessThan(count * 0.14);
	});

	it('provides alternate reachable routes and keeps a safe option in each layer', () => {
		const previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 800,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		const routes = createReachablePlatformRoutes([previous], 800, () => 0.3, 50000);

		expect(routes).toHaveLength(2);
		expect(routes.some((platform) => !platform.cracked)).toBe(true);
		expect(
			Math.abs(
				routes[0].x +
					routes[0].width / 2 -
					routes[1].x -
					routes[1].width / 2,
			),
		).toBeGreaterThan(40);
		for (const route of routes) {
			expect(previous.y - route.y).toBeLessThan((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY));
			expect(Math.abs(previous.x + previous.width / 2 - route.x - route.width / 2)).toBeLessThanOrEqual(152);
		}
	});

	it('steers generated platforms around scenery lanes without teleporting the route', () => {
		const previous: Platform = {
			x: 216,
			y: 400,
			width: 68,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 216,
			maxX: 216,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		const routes = createReachablePlatformRoutes(
			[previous],
			800,
			() => 0.3,
			50000,
			[{ centerX: 180, radius: 70 }],
		);
		const previousCenter = previous.x + previous.width / 2;

		expect(routes.length).toBeGreaterThan(0);
		for (const route of routes) {
			const center = route.x + route.width / 2;
			expect(Math.abs(center - 180)).toBeGreaterThanOrEqual(route.width / 2 + 78);
			expect(Math.abs(center - previousCenter)).toBeLessThan(130);
			expect(route.moving).toBe(false);
		}
	});

	it.each([280, 420, 760, 800])(
		'keeps generated iceberg bounds separate across consecutive route layers at width %i',
		(width) => {
		const random = seededRandom(7701);
		let routes: Platform[] = [{
			x: (width - 80) / 2,
			y: 500,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 0,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		}];
		const allPlatforms = [...routes];
		for (let layer = 0; layer < 160; layer += 1) {
			const next = createReachablePlatformRoutes(routes, width, random, layer * 90);
			expect(next.length).toBeGreaterThan(0);
			for (let first = 0; first < next.length; first += 1) {
				for (let second = first + 1; second < next.length; second += 1) {
					const horizontalOverlap =
						next[first].x < next[second].x + next[second].width + 4 &&
						next[first].x + next[first].width + 4 > next[second].x;
					const verticalOverlap =
						next[first].y < next[second].y + 32 && next[first].y + 32 > next[second].y;
					expect(horizontalOverlap && verticalOverlap).toBe(false);
				}
			}
			for (const platform of next) {
				for (const existing of allPlatforms) {
					const horizontalOverlap =
						platform.x < existing.x + existing.width + 4 &&
						platform.x + platform.width + 4 > existing.x;
					const verticalOverlap =
						platform.y < existing.y + 32 && platform.y + 32 > existing.y;
					expect(horizontalOverlap && verticalOverlap).toBe(false);
				}
			}
			allPlatforms.push(...next);
			routes = next;
		}
		},
	);

	it('keeps moving ledge routes short and varied', () => {
		const random = seededRandom(89);
		const ranges: number[] = [];
		let previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 720,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		for (let index = 0; index < 200; index += 1) {
			previous = createReachablePlatform(previous, 800, random);
			if (previous.moving) ranges.push(previous.maxX - previous.minX);
		}

		expect(Math.min(...ranges)).toBeGreaterThan(50);
		expect(Math.max(...ranges)).toBeLessThanOrEqual(800 * 0.28);
		expect(new Set(ranges).size).toBeGreaterThan(10);
	});

	it('moves upper ledges faster while keeping them within their lanes', () => {
		const lowPlatform: Platform = {
			x: 200,
			y: 200,
			width: 80,
			moving: true,
			speed: 40,
			direction: 1,
			minX: 100,
			maxX: 400,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		const highPlatform = { ...lowPlatform };

		updateMovingPlatform(lowPlatform, 0.5, 0);
		updateMovingPlatform(highPlatform, 0.5, 20000);

		expect(lowPlatform.x).toBe(209);
		expect(highPlatform.x).toBe(231);
		expect(highPlatform.x).toBeGreaterThan(lowPlatform.x);

		highPlatform.x = highPlatform.maxX - 1;
		highPlatform.direction = 1;
		updateMovingPlatform(highPlatform, 1, 2000);
		expect(highPlatform.x).toBeLessThanOrEqual(highPlatform.maxX);
		expect(highPlatform.x).toBeGreaterThanOrEqual(highPlatform.minX);
		expect(highPlatform.direction).toBe(-1);
	});

	it('increases moving ledge speed progressively with climb altitude', () => {
		const makePlatform = (): Platform => ({
			x: 200,
			y: 200,
			width: 80,
			moving: true,
			speed: 40,
			direction: 1,
			minX: 100,
			maxX: 400,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		});
		const low = makePlatform();
		const middle = makePlatform();
		const high = makePlatform();

		updateMovingPlatform(low, 0.5, 0);
		updateMovingPlatform(middle, 0.5, 4000);
		updateMovingPlatform(high, 0.5, 12000);

		expect(middle.x - 200).toBeGreaterThan(low.x - 200);
		expect(high.x - 200).toBeGreaterThan(middle.x - 200);
	});

	it('eases moving platforms into their endpoints and reverses them smoothly', () => {
		const platform: Platform = {
			x: 200,
			y: 200,
			width: 80,
			moving: true,
			speed: 100,
			direction: -1,
			minX: 100,
			maxX: 500,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		updateMovingPlatform(platform, 0.1, 0);
		const interiorMovement = Math.abs(platform.x - 200);

		platform.x = platform.minX + 1;
		platform.direction = -1;
		const beforeLowerTurn = platform.x;
		updateMovingPlatform(platform, 0.1, 0);
		expect(Math.abs(platform.x - beforeLowerTurn)).toBeLessThan(interiorMovement);

		platform.x = platform.maxX - 1;
		platform.direction = 1;
		const beforeTurn = platform.x;
		updateMovingPlatform(platform, 0.1, 0);
		expect(Math.abs(platform.x - beforeTurn)).toBeLessThan(interiorMovement);
		expect(platform.x).toBeLessThanOrEqual(platform.maxX);
		expect(platform.x).toBeGreaterThanOrEqual(platform.minX);
	});

	it('increases the travel speed of ledges with wider routes', () => {
		const random = seededRandom(57);
		const movingPlatforms: Platform[] = [];
		let previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 800,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		for (let index = 0; index < 300; index += 1) {
			previous = createReachablePlatform(previous, 800, random);
			if (previous.moving) movingPlatforms.push(previous);
		}

		const byRange = movingPlatforms.sort(
			(a, b) => a.maxX - a.minX - (b.maxX - b.minX),
		);
		expect(byRange.at(-1)!.speed).toBeGreaterThan(byRange[0].speed);
	});

	it('scales boost launch strength with fish size and caps it safely', () => {
		expect(boostLaunchSpeed(0.8)).toBe(908);
		expect(boostLaunchSpeed(1.1)).toBe(1016);
		expect(boostLaunchSpeed(1.4)).toBe(1124);
		expect(boostLaunchSpeed(0)).toBe(908);
		expect(boostLaunchSpeed(8)).toBe(1124);
	});

	it('randomizes fish size across the full range at every altitude', () => {
		expect(getFishSize(0, () => 0)).toBe(0.8);
		expect(getFishSize(0, () => 1)).toBe(1.4);
		expect(getFishSize(14000, () => 0.5)).toBeCloseTo(1.1);
	});

	it('keeps cracked ice absent early and makes it more common with altitude', () => {
		const previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 720,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		const random = () => 0.1;
		const early = createReachablePlatform(previous, 800, random, 0);
		const firstCracks = createReachablePlatform(previous, 800, random, 550);
		const rising = createReachablePlatform(previous, 800, random, 30000);
		const high = createReachablePlatform(previous, 800, random, 70000);

		expect(early.cracked).toBe(false);
		expect(firstCracks.cracked).toBe(false);
		expect(rising.cracked).toBe(true);
		expect(high.cracked).toBe(true);
		expect(previous.y - high.y).toBeGreaterThan(previous.y - early.y);
	});

	it('keeps a long generated course near the center while still using both sides', () => {
		const random = seededRandom(4119);
		const width = 800;
		let previous: Platform = {
			x: width / 2 - 30,
			y: 500,
			width: 60,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 0,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};
		const centers: number[] = [];
		for (let layer = 0; layer < 3000; layer += 1) {
			previous = createReachablePlatform(previous, width, random, layer * 30);
			centers.push(previous.x + previous.width / 2);
		}
		const averageCenter = centers.reduce((sum, center) => sum + center, 0) / centers.length;
		expect(averageCenter).toBeGreaterThan(width * 0.38);
		expect(averageCenter).toBeLessThan(width * 0.62);
		expect(Math.min(...centers)).toBeLessThan(width * 0.2);
		expect(Math.max(...centers)).toBeGreaterThan(width * 0.8);
	});

	it('keeps late-climb platform gaps below Pip’s maximum jump height', () => {
		const random = seededRandom(3301);
		const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
		let previous: Platform = {
			x: 360,
			y: 400,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 0,
			maxX: 720,
			cracked: false,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		for (let index = 0; index < 500; index += 1) {
			const next = createReachablePlatform(previous, 800, random, 85000);
			const gap = previous.y - next.y;
			expect(gap).toBeGreaterThanOrEqual(110);
			expect(gap).toBeLessThanOrEqual(132);
			expect(gap).toBeLessThan(maxJumpHeight);
			previous = next;
		}
	});

	it.each([280, 420, 760])(
		'keeps the harder final climb reachable at canvas width %i',
		(width) => {
			const random = seededRandom(width + 75000);
			const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
			let previous: Platform = {
				x: (width - 60) / 2,
				y: 400,
				width: 60,
				moving: false,
				speed: 0,
				direction: 1,
				minX: 0,
				maxX: width - 60,
				cracked: false,
				falling: false,
				fallSpeed: 0,
				breakAmount: 0,
			};

			for (let index = 0; index <= 500; index += 1) {
				const altitude = FINAL_DIFFICULTY_START_ALTITUDE + index * 50;
				const next = createReachablePlatform(previous, width, random, altitude);
				const gap = previous.y - next.y;
				expect(gap).toBeLessThan(maxJumpHeight);
				expect(next.width).toBeGreaterThanOrEqual(42);
				expect(next.x).toBeGreaterThanOrEqual(0);
				expect(next.x + next.width).toBeLessThanOrEqual(width);
				previous = next;
			}
		},
	);

	it('makes a cracked iceberg fall after its one jump', () => {
		const platform: Platform = {
			x: 100,
			y: 200,
			width: 80,
			moving: false,
			speed: 0,
			direction: 1,
			minX: 100,
			maxX: 100,
			cracked: true,
			falling: false,
			fallSpeed: 0,
			breakAmount: 0,
		};

		platform.falling = true;
		updateMovingPlatform(platform, 0.25, 0);

		expect(platform.fallSpeed).toBeGreaterThan(0);
		expect(platform.y).toBeGreaterThan(200);
		expect(platform.breakAmount).toBeGreaterThan(0);
		expect(platform.breakAmount).toBeLessThan(1);
	});
});
