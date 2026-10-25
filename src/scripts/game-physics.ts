export interface Platform {
	x: number;
	y: number;
	width: number;
	moving: boolean;
	speed: number;
	direction: -1 | 1;
	minX: number;
	maxX: number;
	cracked: boolean;
	falling: boolean;
	fallSpeed: number;
	breakAmount: number;
	nebula?: boolean;
	nebulaPhase?: number;
	opacity?: number;
	slingshot?: boolean;
	summit?: boolean;
}

export interface CourseStage {
	name: string;
	skyTop: string;
	skyBottom: string;
	islandTop: string;
	islandBase: string;
	islandAccent: string;
	flyingObject: string;
}

export interface PlatformAvoidanceZone {
	centerX: number;
	radius: number;
}

export const JUMP_SPEED = 540;
export const GRAVITY = 1050;
export const COURSE_STAGE_HEIGHT_METERS = 1000;
export const COURSE_STAGE_COUNT = 10;
export const COURSE_MAX_METERS = COURSE_STAGE_HEIGHT_METERS * COURSE_STAGE_COUNT;
export const COURSE_MAX_ALTITUDE = COURSE_MAX_METERS * 10;
export const COURSE_STAGE_TRANSITION_FRACTION = 0.16;
export const LOW_GRAVITY_START_ALTITUDE = 80000;
export const NEBULA_PLATFORM_START_ALTITUDE = 70000;
export const NEBULA_PLATFORM_CYCLE_SECONDS = 4.5;
export const FINAL_DIFFICULTY_START_ALTITUDE = COURSE_MAX_ALTITUDE - 25000;
export const NO_BOOST_START_ALTITUDE = COURSE_MAX_ALTITUDE - 10000;

export function finalDifficultyAtAltitude(altitude: number): number {
	const progress = Math.max(
		0,
		Math.min(1, (altitude - FINAL_DIFFICULTY_START_ALTITUDE) /
			(COURSE_MAX_ALTITUDE - FINAL_DIFFICULTY_START_ALTITUDE)),
	);
	return progress * progress * (3 - 2 * progress);
}

export function boostsAllowedAtAltitude(altitude: number): boolean {
	return altitude < NO_BOOST_START_ALTITUDE;
}

export function climbScoreAtAltitude(altitude: number): number {
	return Math.max(0, Math.min(COURSE_MAX_METERS - 1, Math.floor(altitude / 10)));
}

export function summitCameraLimit(
	canvasHeight: number,
	groundSurface: number,
	scrollLine: number,
	playerRadius: number,
	landingGap = 24,
): number {
	const groundY = canvasHeight - groundSurface;
	return Math.max(
		0,
		COURSE_MAX_ALTITUDE - (groundY - scrollLine - playerRadius - landingGap),
	);
}

export function gravityAtAltitude(altitude: number): number {
	return GRAVITY * (altitude >= LOW_GRAVITY_START_ALTITUDE ? 0.6 : 1);
}

export function integrateBoostMotion(
	initialVelocity: number,
	altitude: number,
	deceleration: number,
	delta: number,
): { velocity: number; displacement: number; completed: boolean } {
	let velocity = initialVelocity;
	let currentAltitude = altitude;
	let remaining = Math.max(0, delta);
	let displacement = 0;

	while (remaining > 0 && velocity < 0) {
		const acceleration = deceleration * (gravityAtAltitude(currentAltitude) / GRAVITY);
		let stepDuration = remaining;
		let reachesLowGravity = false;
		if (currentAltitude < LOW_GRAVITY_START_ALTITUDE) {
			const distanceToBoundary = LOW_GRAVITY_START_ALTITUDE - currentAltitude;
			const discriminant = velocity ** 2 - 2 * acceleration * distanceToBoundary;
			if (discriminant >= 0) {
				const boundaryTime = (-velocity - Math.sqrt(discriminant)) / acceleration;
				if (boundaryTime >= 0 && boundaryTime <= stepDuration) {
					stepDuration = boundaryTime;
					reachesLowGravity = true;
				}
			}
		}

		const timeToApex = -velocity / acceleration;
		const completed = timeToApex <= stepDuration;
		if (completed) {
			stepDuration = timeToApex;
			reachesLowGravity = false;
		}

		const stepDisplacement =
			velocity * stepDuration + 0.5 * acceleration * stepDuration ** 2;
		displacement += stepDisplacement;
		currentAltitude -= stepDisplacement;
		velocity += acceleration * stepDuration;
		remaining -= stepDuration;

		if (completed) return { velocity: 0, displacement, completed: true };
		if (reachesLowGravity) {
			currentAltitude = LOW_GRAVITY_START_ALTITUDE;
			continue;
		}
		break;
	}

	return {
		velocity,
		displacement,
		completed: velocity >= 0,
	};
}

export function steeringResponseAtAltitude(altitude: number): number {
	return altitude >= LOW_GRAVITY_START_ALTITUDE ? 0.7 : 1;
}

export function updateNebulaPlatform(platform: Platform, delta: number): void {
	if (!platform.nebula) return;
	const phase = ((platform.nebulaPhase ?? 0) + delta) % NEBULA_PLATFORM_CYCLE_SECONDS;
	platform.nebulaPhase = phase;
	platform.opacity =
		phase < 2
			? 1 - phase / 2
			: phase < 3.5
				? 0
				: Math.min(1, phase - 3.5);
}

export const COURSE_STAGES: CourseStage[] = [
	{
		name: "Earth's Atmosphere",
		skyTop: '#bde9e5', skyBottom: '#ecf4db',
		islandTop: '#e7f7f2', islandBase: '#79b6c2', islandAccent: '#4c9eaa',
		flyingObject: 'bird',
	},
	{
		name: 'The Moon',
		skyTop: '#080d1a', skyBottom: '#252b3b',
		islandTop: '#e3e0d5', islandBase: '#777b82', islandAccent: '#b6b3a8',
		flyingObject: 'lunarProbe',
	},
	{
		name: 'Mars',
		skyTop: '#130d18', skyBottom: '#2d1825',
		islandTop: '#f1c294', islandBase: '#a84f43', islandAccent: '#d98162',
		flyingObject: 'rover',
	},
	{
		name: 'Jupiter',
		skyTop: '#080b1b', skyBottom: '#211629',
		islandTop: '#f0d3a4', islandBase: '#a56e51', islandAccent: '#e1ae78',
		flyingObject: 'jupiterProbe',
	},
	{
		name: 'Saturn',
		skyTop: '#0d0c19', skyBottom: '#292033',
		islandTop: '#f2e1b0', islandBase: '#aa8755', islandAccent: '#e3c989',
		flyingObject: 'ringSat',
	},
	{
		name: 'Uranus',
		skyTop: '#061723', skyBottom: '#142c3a',
		islandTop: '#d7f3ec', islandBase: '#4896a0', islandAccent: '#91ded7',
		flyingObject: 'uranusProbe',
	},
	{
		name: 'Neptune',
		skyTop: '#050b20', skyBottom: '#111d42',
		islandTop: '#d6e4ff', islandBase: '#526daf', islandAccent: '#9bb8f7',
		flyingObject: 'neptuneProbe',
	},
	{
		name: 'Kuiper Belt',
		skyTop: '#080d1c', skyBottom: '#222d46',
		islandTop: '#d7d5d1', islandBase: '#626b79', islandAccent: '#b48c86',
		flyingObject: 'dwarfPlanet',
	},
	{
		name: 'Oort Cloud',
		skyTop: '#070b18', skyBottom: '#1c2439',
		islandTop: '#d6dfeb', islandBase: '#63718a', islandAccent: '#aab9d0',
		flyingObject: 'comet',
	},
	{
		name: 'Interstellar Space',
		skyTop: '#050713', skyBottom: '#211f46',
		islandTop: '#dfe5f5', islandBase: '#5b6382', islandAccent: '#a8a5d7',
		flyingObject: 'voyagerProbe',
	},
];

export function getCourseStageIndex(altitude: number): number {
	const meters = Math.max(0, altitude) / 10;
	return Math.min(COURSE_STAGE_COUNT - 1, Math.floor(meters / COURSE_STAGE_HEIGHT_METERS));
}

export function getCourseStageMidpointAltitude(stageIndex: number): number {
	if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= COURSE_STAGE_COUNT) {
		throw new RangeError(`Course stage index must be between 0 and ${COURSE_STAGE_COUNT - 1}.`);
	}
	return (stageIndex + 0.5) * COURSE_STAGE_HEIGHT_METERS * 10;
}

export interface CourseStageBlend {
	from: number;
	to: number;
	amount: number;
}

export function getCourseStageBlend(altitude: number): CourseStageBlend {
	const stageHeight = COURSE_STAGE_HEIGHT_METERS * 10;
	const stageIndex = getCourseStageIndex(altitude);
	const progress = (Math.max(0, altitude) - stageIndex * stageHeight) / stageHeight;
	const transition = COURSE_STAGE_TRANSITION_FRACTION;
	if (stageIndex > 0 && progress <= transition) {
		return {
			from: stageIndex - 1,
			to: stageIndex,
			amount: smoothStageStep((progress + transition) / (transition * 2)),
		};
	}
	if (stageIndex < COURSE_STAGE_COUNT - 1 && progress >= 1 - transition) {
		return {
			from: stageIndex,
			to: stageIndex + 1,
			amount: smoothStageStep((progress - (1 - transition)) / (transition * 2)),
		};
	}
	return { from: stageIndex, to: stageIndex, amount: 0 };
}

export function getCourseStageWeight(altitude: number, targetStage: number): number {
	const blend = getCourseStageBlend(altitude);
	if (blend.from === blend.to) return blend.from === targetStage ? 1 : 0;
	if (blend.from === targetStage) return 1 - blend.amount;
	if (blend.to === targetStage) return blend.amount;
	return 0;
}

function smoothStageStep(value: number): number {
	const amount = Math.max(0, Math.min(1, value));
	return amount * amount * (3 - 2 * amount);
}

export function hasReachablePlatform(
	platform: Platform,
	candidates: Platform[],
	maxJumpHeight: number,
	maxHorizontalReach: number,
): boolean {
	return candidates.some((candidate) => {
		if (candidate === platform || !canLandOnPlatform(candidate) || candidate.y >= platform.y) return false;
		const verticalGap = platform.y - candidate.y;
		if (verticalGap > maxJumpHeight || verticalGap < 0) return false;
		const nearestX = Math.max(candidate.x, Math.min(platform.x + platform.width / 2, candidate.x + candidate.width));
		return Math.abs(nearestX - (platform.x + platform.width / 2)) <= maxHorizontalReach;
	});
}

export function hasReachablePickup(
	platform: Platform,
	pickups: Array<{ x: number; y: number }>,
	maxJumpHeight: number,
	maxHorizontalReach: number,
): boolean {
	const launchY = platform.y;
	const launchX = platform.x + platform.width / 2;
	return pickups.some((pickup) => {
		const verticalGap = launchY - pickup.y;
		return (
			verticalGap >= -20 &&
			verticalGap <= maxJumpHeight &&
			Math.abs(launchX - pickup.x) <= maxHorizontalReach
		);
	});
}

export function canLandOnPlatform(platform: Platform): boolean {
	return !platform.falling;
}

export function resizePlatformHorizontally(
	platform: Platform,
	scale: number,
	canvasWidth: number,
): void {
	platform.width *= scale;
	const maxX = Math.max(0, canvasWidth - platform.width);
	const clampX = (x: number, minimum: number, maximum: number) =>
		Math.max(minimum, Math.min(maximum, x));

	if (platform.moving) {
		platform.minX = clampX(platform.minX * scale, 0, maxX);
		platform.maxX = clampX(platform.maxX * scale, platform.minX, maxX);
		platform.x = clampX(platform.x * scale, platform.minX, platform.maxX);
		platform.speed *= scale;
		return;
	}

	platform.x = clampX(platform.x * scale, 0, maxX);
	platform.minX = platform.x;
	platform.maxX = platform.x;
}

export function createReachablePlatform(
	previous: Platform,
	canvasWidth: number,
	random: () => number = Math.random,
	altitude = 0,
	route?: -1 | 1,
): Platform {
	const difficulty = Math.max(0, Math.min(1, altitude / COURSE_MAX_ALTITUDE));
	const finalDifficulty = finalDifficultyAtAltitude(altitude);
	const standardWidth = Math.max(54, Math.min(68, canvasWidth * 0.18));
	const platformWidth = Math.max(42, standardWidth - finalDifficulty * 12);
	const horizontalStep = Math.min(
		44 + difficulty * 116 + finalDifficulty * 20,
		canvasWidth * (0.16 + difficulty * 0.24 + finalDifficulty * 0.07),
	);
	const previousCenter = previous.x + previous.width / 2;
	let direction = route ?? (random() < 0.5 ? -1 : 1);
	const edgeMargin = Math.max(platformWidth, canvasWidth * 0.18);
	if (route === undefined) {
		if (previousCenter < edgeMargin && direction < 0) direction = 1;
		else if (previousCenter > canvasWidth - edgeMargin && direction > 0) direction = -1;
	}
	const centerCorrection = Math.max(
		-24,
		Math.min(24, (canvasWidth / 2 - previousCenter) * 0.18),
	);
	const requestedStep = Math.max(
		-horizontalStep,
		Math.min(
			horizontalStep,
			direction * (24 + random() * Math.max(0, horizontalStep - 24)) + centerCorrection,
		),
	);
	const nextCenter = Math.max(
		platformWidth / 2 + 8,
		Math.min(
			canvasWidth - platformWidth / 2 - 8,
			previousCenter + requestedStep,
		),
	);
	const x = nextCenter - platformWidth / 2;
	const moving = random() < Math.min(0.62, 0.06 + difficulty * 0.38 + finalDifficulty * 0.15);
	const laneWidth = canvasWidth - platformWidth;
	const travelRange = moving
		? Math.min(laneWidth, laneWidth * (0.09 + difficulty * 0.22 + random() * 0.1 + finalDifficulty * 0.1))
		: 0;
	const minX = moving
		? Math.max(0, Math.min(laneWidth - travelRange, x - random() * travelRange))
		: x;
	const maxX = minX + travelRange;

	const platform: Platform = {
		x,
		y: previous.y - (
			104 + difficulty * 20 + random() * (8 - difficulty * 4) + finalDifficulty * 7
		),
		width: platformWidth,
		moving,
		speed: moving ? 36 + travelRange * 0.1 : 0,
		direction: random() < 0.5 ? -1 : 1,
		minX,
		maxX,
		cracked: altitude >= 9000 && random() < Math.min(0.9, difficulty * 0.7 + finalDifficulty * 0.15),
		falling: false,
		fallSpeed: 0,
		breakAmount: 0,
	};
	if (altitude >= NEBULA_PLATFORM_START_ALTITUDE) {
		platform.nebula = random() < 0.2;
		if (platform.nebula) {
			platform.nebulaPhase = random() * NEBULA_PLATFORM_CYCLE_SECONDS;
			platform.opacity = 1;
		}
	}
	return platform;
}

export function createReachablePlatformRoutes(
	previousPlatforms: Platform[],
	canvasWidth: number,
	random: () => number = Math.random,
	altitude = 0,
	avoidanceZones: PlatformAvoidanceZone[] = [],
): Platform[] {
	if (previousPlatforms.length === 0) throw new Error('At least one previous platform is required.');

	const previous = previousPlatforms[0];
	let main = createReachablePlatform(previous, canvasWidth, random, altitude);
	if (avoidanceZones.length > 0 && platformAvoidancePenalty(main, avoidanceZones) > 0) {
		const preferredCenter = main.x + main.width / 2;
		const candidates = [
			main,
			createReachablePlatform(previous, canvasWidth, random, altitude, -1),
			createReachablePlatform(previous, canvasWidth, random, altitude, 1),
		];
		main = candidates.reduce((best, candidate) => {
			const candidatePenalty = platformAvoidancePenalty(candidate, avoidanceZones);
			const bestPenalty = platformAvoidancePenalty(best, avoidanceZones);
			const candidateDistance = Math.abs(candidate.x + candidate.width / 2 - preferredCenter);
			const bestDistance = Math.abs(best.x + best.width / 2 - preferredCenter);
			return candidatePenalty < bestPenalty ||
				(candidatePenalty === bestPenalty && candidateDistance < bestDistance)
				? candidate
				: best;
		});
	}
	if (avoidanceZones.length > 0) makePlatformStationary(main);

	const alternateChance = 0.34 * (1 - finalDifficultyAtAltitude(altitude) * 0.75);
	if (random() >= alternateChance || canvasWidth <= 220) return [main];

	const mainCenter = main.x + main.width / 2;
	const previousCenter = previous.x + previous.width / 2;
	const alternateDirection: -1 | 1 = mainCenter < previousCenter ? 1 : -1;
	const alternate = createReachablePlatform(
		previous,
		canvasWidth,
		random,
		altitude,
		alternateDirection,
	);
	if (
		avoidanceZones.length > 0 &&
		platformAvoidancePenalty(alternate, avoidanceZones) > 0
	) return [main];

	const alternateCenter = alternate.x + alternate.width / 2;
	const separation = Math.abs(mainCenter - alternateCenter);
	const minSeparation = Math.max(main.width, alternate.width) + 5;
	const maxSeparation = Math.min(canvasWidth * 0.3, 118);
	if (separation < minSeparation || separation > maxSeparation) return [main];

	alternate.y = main.y + 8;
	main.moving = false;
	main.speed = 0;
	main.minX = main.x;
	main.maxX = main.x;
	alternate.moving = false;
	alternate.speed = 0;
	alternate.minX = alternate.x;
	alternate.maxX = alternate.x;
	if (main.cracked && alternate.cracked) alternate.cracked = false;
	return [main, alternate];
}

export function makePlatformStationary(platform: Platform): void {
	platform.moving = false;
	platform.speed = 0;
	platform.minX = platform.x;
	platform.maxX = platform.x;
}

export function makeHighestPlatformLayersStationary(
	platforms: Platform[],
	layerCount: number,
): void {
	if (!Number.isInteger(layerCount) || layerCount < 0) {
		throw new RangeError('Platform layer count must be a nonnegative integer.');
	}

	const layers: Array<{ y: number; platforms: Platform[] }> = [];
	for (const platform of [...platforms]
		.filter((candidate) => !candidate.summit)
		.sort((first, second) => first.y - second.y)) {
		let layer = layers.find((candidate) => Math.abs(candidate.y - platform.y) <= 12);
		if (!layer) {
			layer = { y: platform.y, platforms: [] };
			layers.push(layer);
		}
		layer.platforms.push(platform);
	}

	for (const layer of layers.slice(0, layerCount)) {
		for (const platform of layer.platforms) makePlatformStationary(platform);
	}
}

function platformAvoidancePenalty(
	platform: Platform,
	zones: PlatformAvoidanceZone[],
): number {
	const center = platform.x + platform.width / 2;
	return zones.reduce(
		(penalty, zone) =>
			penalty + Math.max(0, zone.radius + platform.width / 2 + 8 - Math.abs(center - zone.centerX)),
		0,
	);
}

export function assignSlingshotPlatforms(
	platforms: Platform[],
	random: () => number = Math.random,
	altitude = 0,
): void {
	for (const platform of platforms) {
		platform.slingshot =
			boostsAllowedAtAltitude(altitude) &&
			!platform.moving &&
			!platform.cracked &&
			!platform.falling &&
			!platform.nebula &&
			random() < 0.01;
	}
}

export function updateMovingPlatform(platform: Platform, delta: number, altitude: number): void {
	if (platform.falling) {
		platform.fallSpeed += 220 * delta;
		platform.y += platform.fallSpeed * delta;
		platform.breakAmount = Math.min(1, platform.breakAmount + delta * 2.4);
		return;
	}
	if (!platform.moving || platform.maxX <= platform.minX) return;

	const speedScale =
		0.45 +
		Math.min(5.5, (Math.max(0, altitude) / COURSE_MAX_ALTITUDE) * 5.5);
	const laneWidth = platform.maxX - platform.minX;
	const accelerationDistance = Math.min(38, laneWidth * 0.18);
	let remaining = delta;

	while (remaining > 0) {
		const distanceToEnd =
			platform.direction === 1 ? platform.maxX - platform.x : platform.x - platform.minX;
		if (distanceToEnd <= 0.05) {
			platform.x = platform.direction === 1 ? platform.maxX : platform.minX;
			platform.direction = platform.direction === 1 ? -1 : 1;
			continue;
		}

		const currentSpeed =
			platform.speed *
			speedScale *
			Math.min(1, Math.sqrt(distanceToEnd / accelerationDistance));
		const step = Math.min(remaining, distanceToEnd / Math.max(currentSpeed, 0.001));
		const movement = Math.min(distanceToEnd, currentSpeed * step);
		platform.x += platform.direction * movement;
		remaining -= step;
	}
}

export function boostLaunchSpeed(fishSize: number): number {
	const size = Math.max(0.8, Math.min(1.4, fishSize));
	return 620 + size * 360;
}

export function getDirectionalFlingVelocity(
	velocityX: number,
	velocityY: number,
	speed: number,
): { x: number; y: number } {
	const magnitude = Math.hypot(velocityX, velocityY);
	if (!Number.isFinite(magnitude) || magnitude === 0 || !Number.isFinite(speed) || speed < 0) {
		throw new RangeError('A fling needs a nonzero direction and a finite, nonnegative speed.');
	}
	return {
		x: (velocityX / magnitude) * speed,
		y: (velocityY / magnitude) * speed,
	};
}

export function createSummitPlatform(
	_previous: Platform,
	canvasWidth: number,
	y: number,
): Platform {
	const platformWidth = Math.min(
		canvasWidth,
		Math.max(160, canvasWidth * 0.66),
	);
	const maxX = Math.max(0, canvasWidth - platformWidth);
	const x = maxX / 2;
	return {
		x,
		y,
		width: platformWidth,
		moving: false,
		speed: 0,
		direction: 1,
		minX: x,
		maxX: x,
		cracked: false,
		falling: false,
		fallSpeed: 0,
		breakAmount: 0,
		slingshot: false,
		summit: true,
	};
}

export function slingshotLaunchSpeed(altitude: number): number {
	const lowGravityDistance = Math.min(
		5000,
		Math.max(0, altitude + 5000 - LOW_GRAVITY_START_ALTITUDE),
	);
	const normalGravityDistance = 5000 - lowGravityDistance;
	const requiredEnergy =
		normalGravityDistance * GRAVITY + lowGravityDistance * GRAVITY * 0.6;
	return Math.sqrt(2 * requiredEnergy);
}

export function shouldUseRescueArm(random: () => number = Math.random): boolean {
	return random() < 0.2;
}

export function getFishSize(_altitude: number, random: () => number = Math.random): number {
	return 0.8 + random() * 0.6;
}
