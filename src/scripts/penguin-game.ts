import {
	createReachablePlatform,
	createReachablePlatformRoutes,
	createSummitPlatform,
	assignSlingshotPlatforms,
	makeHighestPlatformLayersStationary,
	makePlatformStationary,
	getDirectionalFlingVelocity,
	climbScoreAtAltitude,
	summitCameraLimit,
	slingshotLaunchSpeed,
	shouldUseRescueArm,
	getFishSize,
	getCourseStageIndex,
	getCourseStageBlend,
	getCourseStageWeight,
	getCourseStageMidpointAltitude,
	hasReachablePickup,
	hasReachablePlatform,
	GRAVITY,
	JUMP_SPEED,
	resizePlatformHorizontally,
	steeringResponseAtAltitude,
	updateNebulaPlatform,
	updateMovingPlatform,
	integrateBoostMotion,
	boostLaunchSpeed,
	boostsAllowedAtAltitude,
	COURSE_MAX_ALTITUDE,
	COURSE_MAX_METERS,
	COURSE_STAGES,
	type Platform,
	type PlatformAvoidanceZone,
	canLandOnPlatform,
	gravityAtAltitude,
} from './game-physics';
import {
	blendWeatherWeights,
	createWeatherWeights,
	formatClockTime,
	getDaylightFactor,
	parseClockTime,
	shortestTimeDelta,
	type WeatherKind,
} from './environment-weather';
import {
	LocalWeatherError,
	requestLocalWeather,
	type LocalWeatherObservation,
	type WeatherLoadStage,
} from './local-weather';
import {
	rankLeaderboardEntries,
	type ScoreEntry,
} from './leaderboard';
import { createScoreRun, fetchLeaderboard, postLeaderboardScore } from './leaderboard-client';
interface BackgroundElement {
	type:
		| 'cloud' | 'bird' | 'plane' | 'distantPlane' | 'star' | 'comet' | 'station' | 'satellite' | 'asteroid'
		| 'lunarProbe' | 'rover' | 'jellyfish' | 'crystal' | 'aurora' | 'solarFlare' | 'deepProbe'
		| 'jupiterProbe' | 'uranusProbe' | 'neptuneProbe' | 'voyagerProbe'
		| 'marsHelicopter' | 'cassiniProbe' | 'newHorizonsProbe' | 'arrokoth' | 'oortComet' | 'interstellarObject'
		| 'alienScout' | 'alienMothership';
	x: number;
	y: number;
	size: number;
	speed: number;
	parallax: number;
	phase: number;
	vx: number;
	vy: number;
	contrail: Array<{ x: number; y: number; age: number }>;
	region?: number;
	worldAltitude?: number;
}

type AmbientType =
	| 'ringDebris'
	| 'bubble'
	| 'frozenAsteroid'
	| 'cometStreak';

interface AmbientElement {
	type: AmbientType;
	x: number;
	y: number;
	baseY: number;
	vx: number;
	vy: number;
	size: number;
	phase: number;
	rotation: number;
	originX: number;
	age: number;
	color: string;
	labelColor: string;
	bobAmplitude: number;
	bobFrequency: number;
	worldAltitude?: number;
}

interface StageScenery {
	background: BackgroundElement[];
	ambient: AmbientElement[];
}

interface DebrisHazard {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	rotation: number;
	worldAltitude: number;
}

interface TwinklingStar {
	x: number;
	y: number;
	size: number;
	phase: number;
}

interface SummitParticle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	lifetime: number;
	size: number;
	color: string;
}

interface SummitFish {
	platform: Platform;
	offsetX: number;
	offsetY: number;
	phase: number;
}

interface SummitHeartParticle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	lifetime: number;
	size: number;
}

interface WeatherCloud {
	x: number;
	worldAltitude: number;
	scale: number;
	phase: number;
	drift: number;
	opacity: number;
}

interface FogBank {
	x: number;
	worldAltitude: number;
	radius: number;
	phase: number;
	drift: number;
	opacity: number;
}

interface ConstellationPattern {
	points: Array<{ x: number; y: number }>;
	links: Array<[number, number]>;
}

interface BoostPickup {
	x: number;
	y: number;
	phase: number;
	size: number;
	platform: Platform;
	offsetY: number;
	sideOffset?: number;
}

type GameMode = 'ready' | 'playing' | 'over' | 'won';
let activeWeatherWeights = createWeatherWeights('clear');

type PlanetAppearance = 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

function requiredElement<T extends Element>(element: T | null, selector: string): T {
	if (!element) throw new Error(`The game page is missing ${selector}.`);
	return element;
}

const shell = requiredElement(document.querySelector<HTMLElement>('#site-shell'), '#site-shell');
const canvas = requiredElement(document.querySelector<HTMLCanvasElement>('#game-canvas'), '#game-canvas');
const scoreValue = requiredElement(document.querySelector<HTMLElement>('#score-value'), '#score-value');
const localConditions = requiredElement(
	document.querySelector<HTMLElement>('#local-conditions'),
	'#local-conditions',
);
const localConditionsValue = requiredElement(
	document.querySelector<HTMLElement>('#local-conditions-value'),
	'#local-conditions-value',
);
const weatherSourceLink = requiredElement(
	document.querySelector<HTMLAnchorElement>('#weather-source-link'),
	'#weather-source-link',
);
const weatherAttribution = requiredElement(
	document.querySelector<HTMLElement>('#weather-attribution'),
	'#weather-attribution',
);
const gameMessage = requiredElement(document.querySelector<HTMLElement>('#game-message'), '#game-message');
const playButton = requiredElement(document.querySelector<HTMLButtonElement>('#play-button'), '#play-button');
const playLabel = requiredElement(document.querySelector<HTMLElement>('#play-label'), '#play-label');
const pilotForm = requiredElement(document.querySelector<HTMLFormElement>('#pilot-form'), '#pilot-form');
const pilotInput = requiredElement(document.querySelector<HTMLInputElement>('#pilot-name'), '#pilot-name');
const pilotNameLabel = requiredElement(
	document.querySelector<HTMLLabelElement>('#pilot-name-label'),
	'#pilot-name-label',
);
const pilotSaveButton = requiredElement(
	document.querySelector<HTMLButtonElement>('#pilot-save-button'),
	'#pilot-save-button',
);
const storageNote = requiredElement(document.querySelector<HTMLElement>('#storage-note'), '#storage-note');
const weatherLoading = requiredElement(document.querySelector<HTMLElement>('#weather-loading'), '#weather-loading');
const weatherConsent = requiredElement(document.querySelector<HTMLInputElement>('#weather-consent'), '#weather-consent');
const weatherStatus = requiredElement(document.querySelector<HTMLElement>('#weather-status'), '#weather-status');
const weatherInfoToggle = requiredElement(
	document.querySelector<HTMLButtonElement>('#weather-info-toggle'),
	'#weather-info-toggle',
);
const weatherInfo = requiredElement(document.querySelector<HTMLElement>('#weather-info'), '#weather-info');
const weatherInfoClose = requiredElement(
	document.querySelector<HTMLButtonElement>('#weather-info-close'),
	'#weather-info-close',
);
const altitudeMeterFill = requiredElement(
	document.querySelector<HTMLElement>('#altitude-meter-fill'),
	'#altitude-meter-fill',
);
const altitudeMeter = requiredElement(
	document.querySelector<HTMLElement>('.altitude-meter'),
	'.altitude-meter',
);
const personalBestMarker = requiredElement(
	document.querySelector<HTMLElement>('#personal-best-marker'),
	'#personal-best-marker',
);
const personalBestMarkerLabel = requiredElement(
	document.querySelector<HTMLElement>('#personal-best-marker-label'),
	'#personal-best-marker-label',
);
const leaderboardMaxMarker = requiredElement(
	document.querySelector<HTMLElement>('#leaderboard-max-marker'),
	'#leaderboard-max-marker',
);
const leaderboardMaxMarkerLabel = requiredElement(
	document.querySelector<HTMLElement>('#leaderboard-max-marker-label'),
	'#leaderboard-max-marker-label',
);
const currentZone = requiredElement(document.querySelector<HTMLElement>('#current-zone'), '#current-zone');
const summitVictory = requiredElement(
	document.querySelector<HTMLElement>('#summit-victory'),
	'#summit-victory',
);
const summitVictoryTitle = requiredElement(
	document.querySelector<HTMLElement>('#summit-victory-title'),
	'#summit-victory-title',
);
const summitVictoryCopy = requiredElement(
	document.querySelector<HTMLElement>('#summit-victory-copy'),
	'#summit-victory-copy',
);
const summitRestartButton = requiredElement(
	document.querySelector<HTMLButtonElement>('#summit-restart'),
	'#summit-restart',
);
const summitDismissButton = requiredElement(
	document.querySelector<HTMLButtonElement>('#summit-dismiss'),
	'#summit-dismiss',
);
const leaderboardList = requiredElement(
	document.querySelector<HTMLOListElement>('#leaderboard-list'),
	'#leaderboard-list',
);
const leftButton = requiredElement(document.querySelector<HTMLButtonElement>('#move-left'), '#move-left');
const rightButton = requiredElement(document.querySelector<HTMLButtonElement>('#move-right'), '#move-right');

const context: CanvasRenderingContext2D = canvas.getContext('2d') ?? (() => {
	throw new Error('The game needs a browser with canvas support.');
})();
let interstellarNebulaTexture: HTMLCanvasElement | null = null;
let interstellarNebulaTextureWidth = 0;
let interstellarNebulaTextureHeight = 0;
let interstellarNebulaTexturePixelRatio = 0;
let interstellarBaseTexture: HTMLCanvasElement | null = null;
let interstellarForegroundStarTexture: HTMLCanvasElement | null = null;
let canvasPixelRatio = 1;

const SCORE_KEY = 'pip-cloud-climb-scores-v1';
const SCORES_CLEARED_KEY = 'pip-cloud-climb-scores-cleared-v1';
const SESSION_PILOT_KEY = 'pip-cloud-climb-pilot-session-v1';
const LEGACY_PILOT_KEY = 'pip-cloud-climb-pilot-v1';
const pressedKeys = new Set<string>();
let width = 0;
let height = 0;
let mode: GameMode = 'ready';
let pilotName = '';
let leaderboardEntries: ScoreEntry[] = [];
let leaderboardStatus: 'loading' | 'ready' | 'error' = 'loading';
let leaderboardLoadSequence = 0;
let climbSession = 0;
let activeScoreRunToken: Promise<string | null> | null = null;
let direction = 0;
let score = 0;
let personalBestScore = 0;
let overallBestScore = 0;
let overallBestName = '';
let altitude = 0;
let lastFrame = 0;
let weatherKind: WeatherKind = 'clear';
let environmentTimeMinutes = 12 * 60;
let targetEnvironmentTimeMinutes = environmentTimeMinutes;
let sunriseMinutes = 6 * 60;
let targetSunriseMinutes = sunriseMinutes;
let sunsetMinutes = 18 * 60;
let targetSunsetMinutes = sunsetMinutes;
let solarOverrideBlend = 0;
let targetSolarOverrideBlend = 0;
let solarOverrideDaylight = 0;
let targetSolarOverrideDaylight = 0;
let locationWeatherLoaded = false;
let weatherSourceUrl: string | null = null;
let localWeatherObservation: LocalWeatherObservation | null = null;
let weatherRequestState: 'idle' | 'locating' | 'forecast' | 'active' | 'fallback' = 'idle';
let weatherLoadSequence = 0;
let weatherRequestController: AbortController | null = null;
let weatherCloudCover = 0;
let targetWeatherCloudCover = 0;
let weatherWeightsFrom = createWeatherWeights('clear');
let weatherWeightsTo = createWeatherWeights('clear');
let weatherTransitionProgress = 1;
let platforms: Platform[] = [];
let backgroundElements: BackgroundElement[] = [];
let ambientElements: AmbientElement[] = [];
const previewScenery = new Map<number, StageScenery>();
let twinklingStars: TwinklingStar[] = [];
let weatherClouds: WeatherCloud[] = [];
let fogBanks: FogBank[] = [];
let debrisHazard: DebrisHazard | null = null;
let nextDebrisAt = Number.POSITIVE_INFINITY;
let boostPickups: BoostPickup[] = [];
let standingPlatform: Platform | null = null;
let stuckElapsed = 0;
let rescueServedPlatform: Platform | null = null;
let rescueState: {
	platform: Platform;
	sideOffset: number;
	fishOffsetY: number;
	x: number;
	phase: 'lowering' | 'retracting';
	progress: number;
} | null = null;
let armRescue: {
	platform: Platform;
	phase: 'lowering' | 'carrying' | 'placing' | 'retracting';
	progress: number;
	caughtX: number;
	caughtY: number;
	targetX: number;
	targetY: number;
} | null = null;
let player = { x: 0, y: 0, vx: 0, vy: 0, radius: 17 };
let knockbackTime = 0;
let elapsedTime = 0;
let nextPlaneAt = 0;
let nextDistantPlaneAt = 0;
let moonX = 0;
let boostPlatformsUntilNext = 0;
let boostActive = false;
let summitParticles: SummitParticle[] = [];
let summitFish: SummitFish[] = [];
let summitHeartParticles: SummitHeartParticle[] = [];
let backgroundStageIndex = 0;
let coneOffset = 0;
let coneVelocity = 0;
let coneDetached = false;

const COURSE_PREVIEW_LAYERS = Math.ceil(COURSE_MAX_ALTITUDE / 100) + 2;
const BOOST_DECELERATION = 560;
let boostDeceleration = BOOST_DECELERATION;
const GROUND_BOUNCE_HEIGHT = 42;
const GROUND_SURFACE = 34;
const MOUNTAIN_PARALLAX = 0.065;
const SUN_PARALLAX = 0.025;
const GRASS_PARALLAX = 0.045;
const PLANE_MIN_ALTITUDE = 4000;
const PLANE_MAX_ALTITUDE = 8000;
const PLANE_MAX_PATH_ANGLE = Math.PI / 18;
const CONTRAIL_LIFETIME = 2.2;
const STARFIELD_START_ALTITUDE = 8500;
const STARFIELD_FULL_ALTITUDE = 18000;
const STARFIELD_PARALLAX = 0.001;
const CONSTELLATION_START_ALTITUDE = 10000;
const CONSTELLATION_FULL_ALTITUDE = 18000;
const STAGE_RAW_HEIGHT = COURSE_MAX_ALTITUDE / COURSE_STAGES.length;
const WEATHER_CLOUD_START_ALTITUDE = 2000;
const PLANET_PARALLAX = 0.08;
const CONSTELLATION_SPACING = 40000;
const CONSTELLATION_PARALLAX = 0.01;
const PLANET_ROUTE_AVOIDANCE_MAX_RADIUS = 100;
const PLANET_ROUTE_AVOIDANCE_MARGIN = 180;
const PLATFORM_ROUTE_ALTITUDE_STEP = 110;
const KUIPER_PARALLAX = 0.018;
const OORT_PARALLAX = 0.012;
const MOON_ALTITUDE = getCourseStageMidpointAltitude(1);
const CONSTELLATION_PATTERNS: ConstellationPattern[] = [
	{
		points: [
			{ x: 0.22, y: 0.13 }, { x: 0.77, y: 0.18 }, { x: 0.13, y: 0.78 }, { x: 0.83, y: 0.82 },
			{ x: 0.37, y: 0.43 }, { x: 0.5, y: 0.46 }, { x: 0.63, y: 0.43 }, { x: 0.51, y: 0.63 },
		],
		links: [[0, 1], [0, 4], [1, 6], [4, 5], [5, 6], [4, 7], [7, 3], [6, 3], [2, 4], [2, 3]],
	},
	{
		points: [
			{ x: 0.77, y: 0.24 }, { x: 0.78, y: 0.58 }, { x: 0.49, y: 0.64 }, { x: 0.47, y: 0.3 },
			{ x: 0.26, y: 0.24 }, { x: 0.13, y: 0.43 }, { x: 0.04, y: 0.7 },
		],
		links: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
	},
	{
		points: [
			{ x: 0.04, y: 0.32 }, { x: 0.27, y: 0.72 }, { x: 0.49, y: 0.38 },
			{ x: 0.73, y: 0.7 }, { x: 0.96, y: 0.24 },
		],
		links: [[0, 1], [1, 2], [2, 3], [3, 4]],
	},
	{
		points: [
			{ x: 0.5, y: 0.04 }, { x: 0.5, y: 0.48 }, { x: 0.5, y: 0.96 },
			{ x: 0.09, y: 0.5 }, { x: 0.91, y: 0.46 },
		],
		links: [[0, 1], [1, 2], [3, 1], [1, 4]],
	},
	{
		points: [
			{ x: 0.88, y: 0.08 }, { x: 0.57, y: 0.46 }, { x: 0.29, y: 0.38 },
			{ x: 0.18, y: 0.68 }, { x: 0.48, y: 0.83 },
		],
		links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
	},
	{
		points: [
			{ x: 0.08, y: 0.16 }, { x: 0.28, y: 0.28 }, { x: 0.45, y: 0.34 }, { x: 0.56, y: 0.48 },
			{ x: 0.7, y: 0.57 }, { x: 0.83, y: 0.7 }, { x: 0.72, y: 0.84 }, { x: 0.91, y: 0.94 },
		],
		links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
	},
];
const CONSTELLATION_LAYOUT = [
	{ pattern: 0, x: 0.22, y: 0.28, worldAltitude: CONSTELLATION_SPACING * 0.5 },
	{ pattern: 1, x: 0.78, y: 0.53, worldAltitude: CONSTELLATION_SPACING * 1.5 },
	{ pattern: 2, x: 0.38, y: 0.78, worldAltitude: CONSTELLATION_SPACING * 2.5 },
];
const PLANET_SCENERY = [
	{ altitude: getCourseStageMidpointAltitude(2), x: 0.2, radius: 80, appearance: 'mars' as const },
	{ altitude: getCourseStageMidpointAltitude(3), x: 0.77, radius: 118, appearance: 'jupiter' as const },
	{ altitude: getCourseStageMidpointAltitude(4), x: 0.22, radius: 112, appearance: 'saturn' as const },
	{ altitude: getCourseStageMidpointAltitude(5), x: 0.78, radius: 96, appearance: 'uranus' as const },
	{ altitude: getCourseStageMidpointAltitude(6), x: 0.2, radius: 106, appearance: 'neptune' as const },
	{ altitude: getCourseStageMidpointAltitude(7), x: 0.78, radius: 76, appearance: 'pluto' as const },
];

function loadGameSprite(path: string): HTMLImageElement {
	const image = new Image();
	image.onload = () => drawScene();
	image.onerror = () => console.error(`Could not load game sprite: ${path}`);
	image.src = path;
	return image;
}

const penguinSprites = {
	up: loadGameSprite('/game/pip-jump.png'),
	down: loadGameSprite('/game/pip-down.png'),
	cone: loadGameSprite('/game/cone.png'),
	fish: loadGameSprite('/game/fish.png'),
};
const summitIceberg = loadGameSprite('/game/summit-iceberg.svg');
const mountainLandscape = loadGameSprite('/game/mountain-landscape.webp');
const astronautSprite = loadGameSprite('/game/astronaut.png');
const airlinerSprite = loadGameSprite('/game/airliner.png');

function noteStorageProblem(error: unknown): void {
	console.warn('Browser storage is unavailable; this tab may not remember your callsign.', error);
	storageNote.textContent = 'Browser storage is unavailable; this tab may not remember your callsign.';
	storageNote.hidden = false;
}

function getSessionPilotName(): string | null {
	try {
		return window.sessionStorage.getItem(SESSION_PILOT_KEY);
	} catch (error) {
		console.warn('The callsign could not be restored for this browser session.', error);
		return null;
	}
}

function setSessionPilotName(name: string): boolean {
	try {
		window.sessionStorage.setItem(SESSION_PILOT_KEY, name);
		return true;
	} catch (error) {
		console.warn('The callsign could not be saved for this browser session.', error);
		return false;
	}
}

function clearLegacyPilotName(): void {
	try {
		window.localStorage.removeItem(LEGACY_PILOT_KEY);
	} catch (error) {
		noteStorageProblem(error);
	}
}

function clearPreviouslySavedScores(): void {
	try {
		if (window.localStorage.getItem(SCORES_CLEARED_KEY)) return;
		window.localStorage.removeItem(SCORE_KEY);
		window.localStorage.setItem(SCORES_CLEARED_KEY, 'true');
	} catch (error) {
		noteStorageProblem(error);
	}
}

function updatePilotFormAvailability(): void {
	const nameLocked = mode === 'playing';
	pilotInput.disabled = nameLocked;
	pilotSaveButton.disabled = nameLocked;
	pilotNameLabel.textContent = nameLocked ? 'Playing as' : 'Your name';
}

function savePilotName(value: string): boolean {
	if (mode === 'playing') {
		gameMessage.textContent = 'Finish this climb before changing your name.';
		return false;
	}
	const nextName = value.trim().replace(/\s+/g, ' ').slice(0, 24);
	if (!nextName) {
		gameMessage.textContent = 'Choose a name first!';
		pilotInput.focus();
		return false;
	}
	pilotName = nextName;
	pilotInput.value = pilotName;
	personalBestScore = leaderboardEntries.find((entry) => entry.name === pilotName)?.score ?? 0;
	const persisted = setSessionPilotName(pilotName);
	updateAltitudeRecordMarkers();
	gameMessage.textContent = persisted
		? `Ready, ${pilotName}. This tab will remember your name until it closes.`
		: `Ready, ${pilotName}. Your name will last for this page only.`;
	void refreshLeaderboard(pilotName);
	return true;
}

function updateAltitudeRecordMarkers(): void {
	const personalBest = Math.max(0, Math.min(COURSE_MAX_METERS, personalBestScore));
	const leaderboardMax = Math.max(0, Math.min(COURSE_MAX_METERS, overallBestScore));
	const updateMarker = (
		marker: HTMLElement,
		label: HTMLElement,
		markerScore: number,
		prefix: string,
		description: string,
	): void => {
		marker.hidden = markerScore === 0;
		if (markerScore === 0) return;
		label.textContent = `${prefix} ${markerScore.toLocaleString()}m`;
		marker.style.bottom = `calc(${markerScore / COURSE_MAX_METERS * 100}% - 1px)`;
		marker.setAttribute('aria-label', `${description}: ${markerScore.toLocaleString()} meters`);
	};
	updateMarker(
		personalBestMarker,
		personalBestMarkerLabel,
		personalBest,
		'PB',
		'Personal best',
	);
	updateMarker(
		leaderboardMaxMarker,
		leaderboardMaxMarkerLabel,
		leaderboardMax,
		'TOP',
		'Leaderboard maximum',
	);

	const labelsOverlap = personalBest > 0 &&
		leaderboardMax > 0 &&
		Math.abs(personalBest - leaderboardMax) < 700;
	personalBestMarker.classList.toggle('altitude-record-marker--upper-label', labelsOverlap);
	leaderboardMaxMarker.classList.toggle('altitude-record-marker--lower-label', labelsOverlap);
}

function renderLeaderboard(): void {
	const scores = rankLeaderboardEntries(leaderboardEntries);
	overallBestScore = scores[0]?.score ?? 0;
	overallBestName = scores[0]?.name ?? '';
	updateAltitudeRecordMarkers();
	leaderboardList.replaceChildren();

	if (scores.length === 0) {
		const empty = document.createElement('li');
		empty.className = 'empty-leaderboard';
		const star = document.createElement('span');
		star.className = 'empty-star';
		star.setAttribute('aria-hidden', 'true');
		star.textContent = '✦';
		const copy = document.createElement('span');
		copy.textContent = leaderboardStatus === 'loading'
			? 'Loading the shared leaderboard…'
			: leaderboardStatus === 'error'
				? 'The shared leaderboard is temporarily unavailable.'
				: 'Your first climb could go here.';
		empty.append(star, copy);
		leaderboardList.append(empty);
		return;
	}

	if (leaderboardStatus === 'error') {
		const warning = document.createElement('li');
		warning.className = 'empty-leaderboard';
		warning.setAttribute('role', 'status');
		warning.textContent = 'Could not refresh the shared leaderboard.';
		leaderboardList.append(warning);
	}

	for (const [index, entry] of scores.entries()) {
		const row = document.createElement('li');
		const isSummitAchiever = entry.summit === true && entry.score === COURSE_MAX_METERS;
		if (isSummitAchiever) row.classList.add('is-summit-achiever');
		const rank = document.createElement('span');
		rank.className = 'leader-rank';
		rank.textContent = `${index + 1}`;
		const nameGroup = document.createElement('span');
		nameGroup.className = 'leader-name-group';
		const name = document.createElement('span');
		name.className = 'leader-name';
		name.textContent = entry.name;
		name.title = entry.name;
		nameGroup.append(name);
		if (isSummitAchiever) {
			const crown = document.createElement('span');
			crown.className = 'leader-crown';
			crown.setAttribute('role', 'img');
			crown.setAttribute('aria-label', '10,000 metre summit achiever');
			crown.textContent = '👑';
			nameGroup.append(crown);
		}
		const points = document.createElement('span');
		points.className = 'leader-score';
		const scoreValue = document.createElement('span');
		scoreValue.className = 'leader-score-value';
		scoreValue.textContent = `${entry.score.toLocaleString()}`;
		const scoreUnit = document.createElement('span');
		scoreUnit.className = 'leader-score-unit';
		scoreUnit.textContent = 'm';
		points.append(scoreValue, scoreUnit);
		row.append(rank, nameGroup, points);
		leaderboardList.append(row);
	}
	updateLeaderboardNamePreviews();
}

async function refreshLeaderboard(name = pilotName): Promise<void> {
	const sequence = ++leaderboardLoadSequence;
	if (leaderboardEntries.length === 0) leaderboardStatus = 'loading';
	renderLeaderboard();
	try {
		const snapshot = await fetchLeaderboard(name || undefined);
		if (sequence !== leaderboardLoadSequence) return;
		leaderboardEntries = rankLeaderboardEntries(snapshot.entries);
		if (name === pilotName) personalBestScore = snapshot.personalBest?.score ?? 0;
		leaderboardStatus = 'ready';
	} catch (error) {
		if (sequence !== leaderboardLoadSequence) return;
		console.error('The shared leaderboard could not be loaded.', error);
		leaderboardStatus = 'error';
	}
	renderLeaderboard();
}

function updateLeaderboardNamePreviews(): void {
	for (const name of leaderboardList.querySelectorAll<HTMLElement>('.leader-name')) {
		const overflow = Math.max(0, name.scrollWidth - name.clientWidth);
		if (overflow > 1) {
			name.classList.add('leader-name--long');
			name.style.setProperty('--leader-name-overflow', `${overflow}px`);
			name.tabIndex = 0;
		} else {
			name.classList.remove('leader-name--long');
			name.style.removeProperty('--leader-name-overflow');
			name.tabIndex = -1;
		}
	}
}

async function saveScore(
	name: string,
	submittedScore: number,
	runToken: Promise<string | null> | null,
): Promise<boolean> {
	if (!name || submittedScore === 0 || runToken === null) return false;
	leaderboardLoadSequence += 1;
	try {
		const token = await runToken;
		if (!token) return false;
		const entry = await postLeaderboardScore(name, submittedScore, token);
		leaderboardEntries = rankLeaderboardEntries([
			...leaderboardEntries.filter((candidate) => candidate.name !== entry.name),
			entry,
		]);
		if (name === pilotName) personalBestScore = entry.score;
		leaderboardStatus = 'ready';
		renderLeaderboard();
		return true;
	} catch (error) {
		console.error('The score could not be submitted to the shared leaderboard.', error);
		leaderboardStatus = 'error';
		renderLeaderboard();
		return false;
	}
}

function isDaytime(): boolean {
	return daylightFactor() >= 0.5;
}

function daylightFactor(): number {
	return getDaylightFactor(
		environmentTimeMinutes,
		sunriseMinutes,
		sunsetMinutes,
		solarOverrideBlend,
		solarOverrideDaylight,
	);
}

function updateEnvironment(): void {
	shell.dataset.sky = isDaytime() ? 'day' : 'night';
	shell.dataset.weather = weatherKind;
	updateLocalConditions();
	if (width > 0 && height > 0) drawScene();
}

function setWeatherKind(kind: WeatherKind, immediate = false): void {
	const currentWeights = getWeatherWeights();
	const alreadyShowingKind = weatherKind === kind &&
		Math.abs((currentWeights.get(kind) ?? 0) - 1) < 0.001;
	if (immediate) {
		weatherWeightsFrom = weatherWeightsTo = createWeatherWeights(kind);
		activeWeatherWeights = createWeatherWeights(kind);
		weatherTransitionProgress = 1;
	} else if (!alreadyShowingKind) {
		weatherWeightsFrom = new Map(currentWeights);
		weatherWeightsTo = createWeatherWeights(kind);
		weatherTransitionProgress = 0;
		updateWeatherWeights();
	}
	weatherKind = kind;
	shell.dataset.weather = kind;
	updateLocalConditions();
	if (!locationWeatherLoaded) {
		targetWeatherCloudCover = {
			clear: 0,
			cloud: 94,
			fog: 100,
			drizzle: 88,
			'freezing-drizzle': 90,
			rain: 92,
			'freezing-rain': 94,
			snow: 86,
			'snow-grains': 82,
			'rain-showers': 84,
			'snow-showers': 84,
			thunderstorm: 98,
			hail: 98,
		}[kind];
	}
	if (width > 0 && height > 0) drawScene();
}

function getWeatherWeights(): Map<WeatherKind, number> {
	return activeWeatherWeights;
}

function updateWeatherWeights(): void {
	activeWeatherWeights = blendWeatherWeights(
		weatherWeightsFrom,
		weatherWeightsTo,
		weatherTransitionProgress,
	);
}

function advanceClockValue(current: number, target: number, blend: number): number {
	const difference = shortestTimeDelta(current, target);
	return Math.abs(difference) < 0.15
		? target
		: (current + difference * blend + 1440) % 1440;
}

function advanceEnvironmentTransitions(delta: number): void {
	const timeBlend = 1 - Math.exp(-delta / 1.35);
	const timeDelta = shortestTimeDelta(environmentTimeMinutes, targetEnvironmentTimeMinutes);
	environmentTimeMinutes =
		Math.abs(timeDelta) < 0.15
			? targetEnvironmentTimeMinutes
			: (environmentTimeMinutes + timeDelta * timeBlend + 1440) % 1440;
	sunriseMinutes = advanceClockValue(sunriseMinutes, targetSunriseMinutes, timeBlend);
	sunsetMinutes = advanceClockValue(sunsetMinutes, targetSunsetMinutes, timeBlend);
	solarOverrideBlend += (targetSolarOverrideBlend - solarOverrideBlend) * timeBlend;
	solarOverrideDaylight += (targetSolarOverrideDaylight - solarOverrideDaylight) * timeBlend;
	weatherCloudCover += (targetWeatherCloudCover - weatherCloudCover) *
		(1 - Math.exp(-delta / 0.72));
	weatherTransitionProgress = Math.min(1, weatherTransitionProgress + delta / 1.35);
	updateWeatherWeights();
	shell.dataset.sky = isDaytime() ? 'day' : 'night';
	shell.dataset.weather = weatherKind;
}

function weatherWeight(kind: WeatherKind): number {
	return activeWeatherWeights.get(kind) ?? 0;
}

function combinedWeatherWeight(kinds: WeatherKind[]): number {
	return Math.min(1, kinds.reduce((total, kind) => total + weatherWeight(kind), 0));
}

function weatherLabelForKind(kind: WeatherKind): string {
	const labels: Record<WeatherKind, string> = {
		clear: 'Clear',
		cloud: 'Cloudy',
		fog: 'Fog',
		drizzle: 'Drizzle',
		'freezing-drizzle': 'Freezing drizzle',
		rain: 'Rain',
		'freezing-rain': 'Freezing rain',
		snow: 'Snow',
		'snow-grains': 'Snow grains',
		'rain-showers': 'Rain showers',
		'snow-showers': 'Snow showers',
		thunderstorm: 'Thunderstorm',
		hail: 'Storm + hail',
	};
	return labels[kind];
}

function updateLocalConditions(): void {
	const weather = weatherLabelForKind(weatherKind);
	const now = new Date();
	const time = formatClockTime(now.getHours() * 60 + now.getMinutes());
	const conditions = weatherRequestState === 'locating'
		? 'Finding location…'
		: weatherRequestState === 'forecast'
			? 'Getting weather…'
			: weatherRequestState === 'active' && localWeatherObservation
				? `${weather} · ${time}`
				: weatherRequestState === 'fallback'
					? `Clear · ${time}`
					: `${weather} · ${time}`;
	localConditionsValue.textContent = conditions;
	localConditions.title = weatherRequestState === 'active' && localWeatherObservation
		? `Live local weather from Open-Meteo: ${localWeatherObservation.label}, ` +
			`${Math.round(localWeatherObservation.temperatureCelsius)}°C, ` +
			`${Math.round(localWeatherObservation.cloudCoverPercent)}% cloud cover. ` +
			`Clock shows device time: ${time}.`
		: weatherRequestState === 'fallback'
			? `Local weather unavailable. Using clear skies and device time: ${time}.`
			: conditions;
	localConditions.hidden = false;
	weatherSourceLink.hidden = !weatherConsent.checked || weatherSourceUrl === null;
	weatherAttribution.hidden = !weatherConsent.checked || weatherSourceUrl === null;
	if (weatherSourceUrl !== null) weatherSourceLink.href = weatherSourceUrl;
}

function setLocalFallback(): void {
	localWeatherObservation = null;
	weatherRequestState = 'idle';
	weatherStatus.textContent = '';
	setDeviceTimeFallback(true);
	setWeatherKind('clear', true);
}

function setDeviceTimeFallback(immediate = false): void {
	const now = new Date();
	targetEnvironmentTimeMinutes = now.getHours() * 60 + now.getMinutes();
	targetSunriseMinutes = 6 * 60;
	targetSunsetMinutes = 18 * 60;
	targetSolarOverrideBlend = 0;
	targetWeatherCloudCover = 0;
	if (immediate) {
		environmentTimeMinutes = targetEnvironmentTimeMinutes;
		sunriseMinutes = targetSunriseMinutes;
		sunsetMinutes = targetSunsetMinutes;
		solarOverrideBlend = 0;
		solarOverrideDaylight = targetSolarOverrideDaylight = 0;
		weatherCloudCover = targetWeatherCloudCover;
	}
	locationWeatherLoaded = false;
	updateEnvironment();
}

function weatherFailureMessage(error: unknown): string {
	if (!(error instanceof LocalWeatherError)) {
		console.error('Unexpected local weather failure.', error);
		return 'Weather lookup failed unexpectedly. Using clear skies; please try again.';
	}

	switch (error.reason) {
		case 'insecure-context':
			return 'Weather needs HTTPS or localhost. Using clear skies.';
		case 'location-unavailable':
			return 'Location unavailable. Check device location services.';
		case 'permission-denied':
			return 'Location blocked. Allow it for this site, then retry.';
		case 'location-timeout':
			return 'Location lookup timed out. Check location services and retry.';
		case 'network':
			return 'Open-Meteo could not be reached. Check your connection and retry.';
		case 'service':
			console.warn('Open-Meteo could not provide a forecast.', error);
			return 'Open-Meteo failed for this location. Please retry later.';
		case 'invalid-response':
			console.warn('Open-Meteo returned invalid weather data.', error);
			return 'Open-Meteo returned invalid weather. Please retry later.';
		case 'cancelled':
			return 'Weather lookup was cancelled.';
	}
}

async function loadLocalWeather(immediate: boolean, requestSequence: number): Promise<boolean> {
	const controller = new AbortController();
	weatherRequestController = controller;
	try {
		const observation = await requestLocalWeather({
			signal: controller.signal,
			onStageChange: (stage: WeatherLoadStage) => {
				if (requestSequence !== weatherLoadSequence || !weatherConsent.checked) return;
				weatherRequestState = stage === 'location' ? 'locating' : 'forecast';
				weatherStatus.textContent = stage === 'location'
					? 'Finding your location…'
					: 'Contacting Open-Meteo…';
				updateLocalConditions();
			},
		});
		if (requestSequence !== weatherLoadSequence || !weatherConsent.checked) return false;

		localWeatherObservation = observation;
		locationWeatherLoaded = true;
		weatherRequestState = 'active';
		weatherSourceUrl = observation.sourceUrl;
		const parsedSunrise = observation.sunrise ? parseClockTime(observation.sunrise) : null;
		const parsedSunset = observation.sunset ? parseClockTime(observation.sunset) : null;
		targetSunriseMinutes = parsedSunrise ?? 6 * 60;
		targetSunsetMinutes = parsedSunset ?? 18 * 60;
		const polarDay = parsedSunrise !== null &&
			parsedSunset !== null &&
			parsedSunrise === parsedSunset;
		targetSolarOverrideBlend = polarDay ? 1 : 0;
		targetSolarOverrideDaylight = observation.isDay ? 1 : 0;
		targetEnvironmentTimeMinutes =
			parseClockTime(observation.observedAt.split('T')[1] ?? '') ??
			new Date().getHours() * 60 + new Date().getMinutes();
		targetWeatherCloudCover = observation.cloudCoverPercent;
		weatherStatus.textContent = '';
		setWeatherKind(observation.kind, immediate);
		if (immediate) {
			environmentTimeMinutes = targetEnvironmentTimeMinutes;
			sunriseMinutes = targetSunriseMinutes;
			sunsetMinutes = targetSunsetMinutes;
			solarOverrideBlend = targetSolarOverrideBlend;
			solarOverrideDaylight = targetSolarOverrideDaylight;
			weatherCloudCover = targetWeatherCloudCover;
		}
		updateEnvironment();
		return true;
	} catch (error) {
		if (requestSequence !== weatherLoadSequence || !weatherConsent.checked) return false;
		if (error instanceof LocalWeatherError && error.reason === 'cancelled') return false;

		weatherSourceUrl = null;
		localWeatherObservation = null;
		locationWeatherLoaded = false;
		weatherRequestState = 'fallback';
		setDeviceTimeFallback(immediate);
		setWeatherKind('clear', immediate);
		weatherStatus.textContent = weatherFailureMessage(error);
		localConditions.title = weatherStatus.textContent;
		updateLocalConditions();
		return false;
	} finally {
		if (weatherRequestController === controller) weatherRequestController = null;
	}
}

function drawCloud(x: number, y: number, scale: number, alpha: number, color = '#ffffff'): void {
	context.save();
	context.globalAlpha *= alpha;
	context.fillStyle = color;
	context.beginPath();
	context.ellipse(x, y, 31 * scale, 10 * scale, 0, 0, Math.PI * 2);
	context.ellipse(x - 16 * scale, y - 5 * scale, 16 * scale, 14 * scale, 0, 0, Math.PI * 2);
	context.ellipse(x + 4 * scale, y - 10 * scale, 20 * scale, 19 * scale, 0, 0, Math.PI * 2);
	context.ellipse(x + 22 * scale, y - 3 * scale, 14 * scale, 12 * scale, 0, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function weatherRandom(index: number, channel: number): number {
	const value = Math.sin(index * 127.1 + channel * 311.7) * 43758.5453123;
	return value - Math.floor(value);
}

function initializeWeatherScenery(): void {
	if (weatherClouds.length === 0) {
		weatherClouds = Array.from({ length: 156 }, (_, index) => ({
			x: weatherRandom(index, 1) * width,
			worldAltitude: WEATHER_CLOUD_START_ALTITUDE +
				weatherRandom(index, 2) * (20500 - WEATHER_CLOUD_START_ALTITUDE),
			scale: 0.85 + weatherRandom(index, 3) * 1.85,
			phase: weatherRandom(index, 4) * Math.PI * 2,
			drift: 2 + weatherRandom(index, 5) * 8,
			opacity: 0.55 + weatherRandom(index, 6) * 0.4,
		}));
	}
	if (fogBanks.length === 0) {
		fogBanks = Array.from({ length: 52 }, (_, index) => ({
			x: weatherRandom(index + 200, 1) * width,
			worldAltitude: weatherRandom(index + 200, 2) * 3000,
			radius: width * (0.2 + weatherRandom(index + 200, 3) * 0.28),
			phase: weatherRandom(index + 200, 4) * Math.PI * 2,
			drift: 0.8 + weatherRandom(index + 200, 5) * 3,
			opacity: 0.72 + weatherRandom(index + 200, 6) * 0.28,
		}));
	}
}

function drawSaturnRingSection(radius: number, front: boolean): void {
	const outerX = radius * 2.25;
	const outerY = radius * 0.58;
	const alpha = context.globalAlpha;
	context.save();
	context.rotate(-0.18);
	context.beginPath();
	context.rect(
		-outerX - 1,
		front ? 0 : -outerY - 1,
		outerX * 2 + 2,
		outerY + 1,
	);
	context.clip();

	const bands = [
		{ inner: 1.08, outer: 1.3, color: '#9b896a', opacity: 0.48 },
		{ inner: 1.32, outer: 1.49, color: '#d2c09a', opacity: 0.7 },
		{ inner: 1.5, outer: 1.72, color: '#f0e2c0', opacity: 0.92 },
		{ inner: 1.84, outer: 2.04, color: '#e1d2b1', opacity: 0.78 },
		{ inner: 2.06, outer: 2.17, color: '#c9b894', opacity: 0.7 },
		{ inner: 2.19, outer: 2.24, color: '#a89779', opacity: 0.38 },
	];
	for (const band of bands) {
		context.globalAlpha = alpha * band.opacity;
		context.fillStyle = band.color;
		context.beginPath();
		context.ellipse(0, 0, radius * band.outer, outerY * band.outer / 2.25, 0, 0, Math.PI * 2);
		context.ellipse(0, 0, radius * band.inner, outerY * band.inner / 2.25, 0, 0, Math.PI * 2, true);
		context.fill('evenodd');
	}

	context.globalAlpha = alpha * 0.45;
	context.strokeStyle = '#f6e9c9';
	context.lineWidth = Math.max(0.7, radius * 0.012);
	for (const ringlet of [1.34, 1.39, 1.44, 1.54, 1.6, 1.66, 1.69, 1.87, 1.91, 1.95, 2.08, 2.12, 2.2]) {
		context.beginPath();
		context.ellipse(0, 0, radius * ringlet, outerY * ringlet / 2.25, 0, 0, Math.PI * 2);
		context.stroke();
	}
	context.restore();
}

function drawAtmosphereBands(
	appearance: 'jupiter' | 'uranus' | 'neptune',
	radius: number,
): void {
	const palettes = {
		jupiter: ['#b8795c', '#ead7b4', '#a8624e', '#f0e4ca', '#c38d69', '#ddc09a'],
		uranus: ['#78b8c2', '#a5d4d4', '#88c5cb', '#b7dfda'],
		neptune: ['#16418c', '#2868bf', '#1b4b9e', '#3f7bd0', '#123778', '#75a8e5'],
	} as const;
	const count = appearance === 'jupiter' ? 16 : appearance === 'neptune' ? 12 : 8;
	const bandHeightScale = appearance === 'jupiter' ? 0.035 : 0.025;
	for (let band = 0; band < count; band += 1) {
		const seed = band + appearance.length * 100;
		const bandY = -radius + (band + 0.5) * radius * 2 / count;
		const height = radius * (
			bandHeightScale + constellationRandom(seed, 1) * bandHeightScale * 0.75
		);
		const waviness = radius * (0.012 + constellationRandom(seed, 2) * 0.026);
		context.globalAlpha = appearance === 'jupiter'
			? 0.28 + constellationRandom(seed, 3) * 0.22
			: appearance === 'neptune'
				? 0.2 + constellationRandom(seed, 3) * 0.2
				: 0.12 + constellationRandom(seed, 3) * 0.12;
		context.fillStyle = palettes[appearance][band % palettes[appearance].length];
		context.beginPath();
		context.moveTo(-radius, bandY - height);
		context.bezierCurveTo(
			-radius * 0.55,
			bandY - height + waviness,
			radius * 0.24,
			bandY - height - waviness,
			radius,
			bandY - height * 0.6,
		);
		context.lineTo(radius, bandY + height * 0.55);
		context.bezierCurveTo(
			radius * 0.42,
			bandY + height + waviness,
			-radius * 0.46,
			bandY + height - waviness,
			-radius,
			bandY + height * 0.7,
		);
		context.closePath();
		context.fill();
	}
	context.globalAlpha = 1;
}

function drawUranusRingSection(radius: number, front: boolean): void {
	context.save();
	context.rotate(0.92);
	for (const [ring, color, alpha] of [
		[1.38, '#7d888b', 0.42],
		[1.52, '#b9c7c2', 0.34],
		[1.7, '#687b83', 0.5],
		[1.83, '#a6b4b3', 0.28],
	] as const) {
		context.globalAlpha = alpha;
		context.strokeStyle = color;
		context.lineWidth = Math.max(0.55, radius * 0.009);
		context.beginPath();
		context.ellipse(
			0,
			radius * 0.08,
			radius * ring,
			radius * 0.28,
			0,
			front ? 0 : Math.PI,
			front ? Math.PI : Math.PI * 2,
		);
		context.stroke();
	}
	context.restore();
}

function drawMarsSurface(radius: number): void {
	context.fillStyle = 'rgba(125, 58, 44, 0.26)';
	context.beginPath();
	context.moveTo(-radius * 0.84, -radius * 0.1);
	context.bezierCurveTo(-radius * 0.64, -radius * 0.42, -radius * 0.28, -radius * 0.31, -radius * 0.12, -radius * 0.08);
	context.bezierCurveTo(radius * 0.1, radius * 0.08, radius * 0.32, -radius * 0.02, radius * 0.55, -radius * 0.18);
	context.lineTo(radius * 0.76, radius * 0.03);
	context.bezierCurveTo(radius * 0.48, radius * 0.31, radius * 0.2, radius * 0.22, -radius * 0.08, radius * 0.4);
	context.lineTo(-radius * 0.58, radius * 0.33);
	context.closePath();
	context.fill();

	context.strokeStyle = 'rgba(87, 43, 39, 0.58)';
	context.lineWidth = Math.max(0.8, radius * 0.035);
	context.beginPath();
	context.moveTo(-radius * 0.72, radius * 0.12);
	context.bezierCurveTo(-radius * 0.42, radius * 0.02, -radius * 0.18, radius * 0.16, radius * 0.05, radius * 0.08);
	context.bezierCurveTo(radius * 0.3, -radius * 0.02, radius * 0.48, radius * 0.04, radius * 0.73, -radius * 0.1);
	context.stroke();

	for (let crater = 0; crater < 8; crater += 1) {
		const x = (constellationRandom(crater + 31, 2) - 0.5) * radius * 1.35;
		const y = (constellationRandom(crater + 31, 3) - 0.5) * radius * 1.28;
		const craterRadius = radius * (0.035 + constellationRandom(crater + 31, 4) * 0.055);
		context.fillStyle = 'rgba(107, 53, 45, 0.34)';
		context.beginPath();
		context.ellipse(x, y, craterRadius, craterRadius * 0.58, crater, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = 'rgba(255, 195, 145, 0.32)';
		context.lineWidth = Math.max(0.5, craterRadius * 0.12);
		context.stroke();
	}

	const cap = context.createLinearGradient(0, -radius, 0, -radius * 0.64);
	cap.addColorStop(0, '#fff0da');
	cap.addColorStop(0.7, '#f4d9b8');
	cap.addColorStop(1, 'rgba(244, 217, 184, 0.08)');
	context.fillStyle = cap;
	context.beginPath();
	context.ellipse(-radius * 0.04, -radius * 0.84, radius * 0.42, radius * 0.105, -0.04, 0, Math.PI * 2);
	context.fill();
}

function drawPlutoSurface(radius: number): void {
	const icePlain = context.createLinearGradient(-radius * 0.55, -radius * 0.62, radius * 0.16, radius * 0.2);
	icePlain.addColorStop(0, 'rgba(244, 229, 205, 0.72)');
	icePlain.addColorStop(0.55, 'rgba(226, 207, 181, 0.55)');
	icePlain.addColorStop(1, 'rgba(197, 163, 139, 0.12)');
	context.fillStyle = icePlain;
	context.beginPath();
	context.moveTo(-radius * 0.72, -radius * 0.18);
	context.bezierCurveTo(-radius * 0.68, -radius * 0.5, -radius * 0.42, -radius * 0.66, -radius * 0.12, -radius * 0.58);
	context.bezierCurveTo(radius * 0.08, -radius * 0.52, radius * 0.18, -radius * 0.36, radius * 0.12, -radius * 0.12);
	context.bezierCurveTo(radius * 0.08, radius * 0.1, -radius * 0.18, radius * 0.18, -radius * 0.38, radius * 0.1);
	context.bezierCurveTo(-radius * 0.58, radius * 0.04, -radius * 0.78, radius * 0.06, -radius * 0.72, -radius * 0.18);
	context.closePath();
	context.fill();

	context.fillStyle = 'rgba(93, 61, 59, 0.32)';
	context.beginPath();
	context.moveTo(-radius * 0.86, radius * 0.34);
	context.bezierCurveTo(-radius * 0.58, radius * 0.17, -radius * 0.38, radius * 0.37, -radius * 0.08, radius * 0.31);
	context.bezierCurveTo(radius * 0.2, radius * 0.24, radius * 0.4, radius * 0.46, radius * 0.72, radius * 0.28);
	context.lineTo(radius * 0.88, radius * 0.54);
	context.bezierCurveTo(radius * 0.48, radius * 0.72, radius * 0.12, radius * 0.58, -radius * 0.22, radius * 0.72);
	context.lineTo(-radius * 0.75, radius * 0.62);
	context.closePath();
	context.fill();

	for (let patch = 0; patch < 8; patch += 1) {
		const x = (constellationRandom(patch + 61, 2) - 0.5) * radius * 1.42;
		const y = (constellationRandom(patch + 61, 3) - 0.5) * radius * 1.36;
		const patchRadius = radius * (0.035 + constellationRandom(patch + 61, 4) * 0.09);
		context.fillStyle = patch % 2 === 0
			? 'rgba(89, 58, 56, 0.28)'
			: 'rgba(239, 218, 193, 0.26)';
		context.beginPath();
		context.ellipse(x, y, patchRadius * 1.3, patchRadius * 0.65, patch * 0.47, 0, Math.PI * 2);
		context.fill();
	}

	for (let crater = 0; crater < 9; crater += 1) {
		const x = (constellationRandom(crater + 81, 2) - 0.5) * radius * 1.42;
		const y = (constellationRandom(crater + 81, 3) - 0.5) * radius * 1.38;
		const craterRadius = radius * (0.025 + constellationRandom(crater + 81, 4) * 0.055);
		context.fillStyle = 'rgba(92, 65, 61, 0.24)';
		context.beginPath();
		context.ellipse(x, y, craterRadius, craterRadius * 0.58, crater * 0.31, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = 'rgba(239, 218, 193, 0.22)';
		context.lineWidth = Math.max(0.45, craterRadius * 0.13);
		context.stroke();
	}
}

function drawLunarSurface(radius: number): void {
	const maria = [
		[-0.32, -0.08, 0.34, 0.23],
		[0.28, 0.24, 0.29, 0.2],
		[0.04, -0.4, 0.2, 0.12],
	] as const;
	for (const [x, y, widthScale, heightScale] of maria) {
		context.fillStyle = 'rgba(92, 94, 99, 0.24)';
		context.beginPath();
		context.ellipse(
			radius * x,
			radius * y,
			radius * widthScale,
			radius * heightScale,
			-0.18,
			0,
			Math.PI * 2,
		);
		context.fill();
	}
	for (let crater = 0; crater < 15; crater += 1) {
		const x = (constellationRandom(crater + 121, 2) - 0.5) * radius * 1.55;
		const y = (constellationRandom(crater + 121, 3) - 0.5) * radius * 1.55;
		const craterRadius = radius * (0.025 + constellationRandom(crater + 121, 4) * 0.075);
		context.fillStyle = 'rgba(81, 83, 88, 0.25)';
		context.beginPath();
		context.arc(x, y, craterRadius, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = 'rgba(246, 243, 229, 0.28)';
		context.lineWidth = Math.max(0.55, craterRadius * 0.18);
		context.stroke();
	}
}

function drawPlanetDisk(
	x: number,
	y: number,
	radius: number,
	appearance: PlanetAppearance,
	rotation = 0,
): void {
	const palettes: Record<PlanetAppearance, [string, string, string]> = {
		earth: ['#17639a', '#2d8caa', '#12395e'],
		moon: ['#d6d4ca', '#aaa99f', '#696b70'],
		mars: ['#c96b43', '#e19458', '#763d3b'],
		jupiter: ['#d5b58a', '#eddbb7', '#9c684e'],
		saturn: ['#e2cf9d', '#f4e7c0', '#a88d63'],
		uranus: ['#8ccbd0', '#bee4df', '#568c9b'],
		neptune: ['#17469d', '#3677d0', '#0c276b'],
		pluto: ['#a76d5c', '#d8b19a', '#644958'],
	};
	const [base, light, shade] = palettes[appearance];
	context.save();
	context.translate(x, y);
	context.rotate(rotation * 0.035);
	if (appearance === 'saturn') {
		drawSaturnRingSection(radius, false);
	} else if (appearance === 'uranus') {
		drawUranusRingSection(radius, false);
	}

	const sphere = context.createRadialGradient(
		-radius * 0.38,
		-radius * 0.43,
		radius * 0.06,
		-radius * 0.08,
		-radius * 0.04,
		radius * 1.35,
	);
	sphere.addColorStop(0, light);
	sphere.addColorStop(0.58, base);
	sphere.addColorStop(1, shade);
	context.fillStyle = sphere;
	context.beginPath();
	context.arc(0, 0, radius, 0, Math.PI * 2);
	context.fill();

	context.save();
	context.beginPath();
	context.arc(0, 0, radius, 0, Math.PI * 2);
	context.clip();
	if (appearance === 'jupiter' || appearance === 'uranus' || appearance === 'neptune') {
		drawAtmosphereBands(appearance, radius);
		if (appearance === 'jupiter') {
			const storm = context.createRadialGradient(
				radius * 0.32,
				radius * 0.24,
				radius * 0.025,
				radius * 0.32,
				radius * 0.24,
				radius * 0.34,
			);
			storm.addColorStop(0, '#e6a17a');
			storm.addColorStop(0.56, '#c96f51');
			storm.addColorStop(1, 'rgba(151, 73, 59, 0.08)');
			context.fillStyle = storm;
			context.beginPath();
			context.ellipse(radius * 0.32, radius * 0.24, radius * 0.34, radius * 0.16, -0.12, 0, Math.PI * 2);
			context.fill();
			context.strokeStyle = 'rgba(245, 207, 169, 0.58)';
			context.lineWidth = Math.max(0.6, radius * 0.012);
			for (let curl = 0; curl < 3; curl += 1) {
				context.beginPath();
				context.ellipse(
					radius * 0.32,
					radius * 0.24,
					radius * (0.13 + curl * 0.075),
					radius * (0.045 + curl * 0.02),
					-0.12,
					Math.PI * 1.08,
					Math.PI * 1.9,
				);
				context.stroke();
			}
		} else if (appearance === 'neptune') {
			context.fillStyle = 'rgba(7, 25, 75, 0.74)';
			context.beginPath();
			context.ellipse(-radius * 0.28, radius * 0.13, radius * 0.23, radius * 0.11, -0.18, 0, Math.PI * 2);
			context.fill();
			for (let cloud = 0; cloud < 3; cloud += 1) {
				context.fillStyle = `rgba(207, 232, 255, ${0.48 - cloud * 0.1})`;
				context.beginPath();
				context.ellipse(
					radius * (0.24 + cloud * 0.16),
					radius * (-0.38 + cloud * 0.24),
					radius * (0.16 - cloud * 0.02),
					radius * 0.035,
					-0.12,
					0,
					Math.PI * 2,
				);
				context.fill();
			}
		}
	} else if (appearance === 'saturn') {
		for (let band = 0; band < 9; band += 1) {
			const bandY = -radius + (band + 0.5) * radius * 2 / 9;
			const bandHeight = radius * 0.2;
			const colors = ['#c1aa7c', '#f0e3bd', '#d1bb8e', '#f5e9ca', '#b89f73', '#e4d0a5'];
			context.globalAlpha = 0.47;
			context.fillStyle = colors[band % colors.length];
			context.beginPath();
			context.moveTo(-radius, bandY);
			context.bezierCurveTo(
				-radius * 0.35, bandY - bandHeight,
				radius * 0.3, bandY + bandHeight,
				radius, bandY - bandHeight * 0.15,
			);
			context.lineTo(radius, bandY + bandHeight);
			context.bezierCurveTo(
				radius * 0.25, bandY + bandHeight * 1.5,
				-radius * 0.35, bandY - bandHeight * 0.4,
				-radius, bandY + bandHeight * 0.35,
			);
			context.closePath();
			context.fill();
		}
		context.globalAlpha = 1;
	} else if (appearance === 'earth') {
		context.fillStyle = '#61935c';
		context.beginPath();
		context.moveTo(-radius * 0.85, -radius * 0.18);
		context.lineTo(-radius * 0.57, -radius * 0.58);
		context.lineTo(-radius * 0.2, -radius * 0.45);
		context.lineTo(-radius * 0.05, -radius * 0.16);
		context.lineTo(-radius * 0.33, radius * 0.02);
		context.lineTo(-radius * 0.44, radius * 0.36);
		context.lineTo(-radius * 0.72, radius * 0.26);
		context.closePath();
		context.fill();
		context.fillStyle = '#9a8b5a';
		context.beginPath();
		context.moveTo(radius * 0.1, -radius * 0.45);
		context.lineTo(radius * 0.52, -radius * 0.34);
		context.lineTo(radius * 0.76, -radius * 0.05);
		context.lineTo(radius * 0.54, radius * 0.14);
		context.lineTo(radius * 0.43, radius * 0.55);
		context.lineTo(radius * 0.13, radius * 0.36);
		context.lineTo(radius * 0.25, radius * 0.02);
		context.closePath();
		context.fill();
		context.fillStyle = 'rgba(255, 255, 255, 0.7)';
		for (let cloud = 0; cloud < 4; cloud += 1) {
			context.beginPath();
			context.ellipse(
				Math.sin(cloud * 7.2) * radius * 0.56,
				Math.cos(cloud * 4.7) * radius * 0.44,
				radius * 0.28,
				radius * 0.055,
				-0.18,
				0,
				Math.PI * 2,
			);
			context.fill();
		}
	} else if (appearance === 'mars') {
		drawMarsSurface(radius);
	} else if (appearance === 'pluto') {
		drawPlutoSurface(radius);
	} else if (appearance === 'moon') {
		drawLunarSurface(radius);
	}
	context.restore();

	const terminator = context.createRadialGradient(
		radius * 0.42,
		radius * 0.22,
		radius * 0.15,
		radius * 0.35,
		radius * 0.22,
		radius * 1.1,
	);
	terminator.addColorStop(0, 'rgba(4, 12, 27, 0)');
	terminator.addColorStop(1, 'rgba(4, 12, 27, 0.7)');
	context.fillStyle = terminator;
	context.beginPath();
	context.arc(0, 0, radius, 0, Math.PI * 2);
	context.fill();
	if (appearance === 'saturn') {
		drawSaturnRingSection(radius, true);
	} else if (appearance === 'uranus') {
		drawUranusRingSection(radius, true);
	}
	context.restore();
}

function drawAsteroid(element: BackgroundElement): void {
	const radius = 4 + element.size * 5;
	const points = 9;
	context.save();
	context.translate(element.x, element.y);
	context.rotate(elapsedTime * 0.18 + element.phase);
	context.fillStyle = '#9a9bb4';
	context.strokeStyle = 'rgba(221, 216, 239, 0.65)';
	context.lineWidth = 1;
	context.beginPath();
	for (let point = 0; point < points; point += 1) {
		const angle = (point / points) * Math.PI * 2;
		const irregularRadius = radius * (0.72 + ((point * 37 + Math.floor(element.phase * 100)) % 31) / 100);
		const x = Math.cos(angle) * irregularRadius;
		const y = Math.sin(angle) * irregularRadius * 0.78;
		if (point === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = 'rgba(58, 59, 87, 0.55)';
	context.beginPath();
	context.arc(-radius * 0.25, -radius * 0.1, radius * 0.18, 0, Math.PI * 2);
	context.arc(radius * 0.35, radius * 0.2, radius * 0.12, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawTwinklingStars(sceneAltitude: number): void {
	const earthLayer = sceneAltitude < STAGE_RAW_HEIGHT;
	const fade = earthLayer ? 1 - daylightFactor() : Math.max(
		0,
		Math.min(
			1,
			(sceneAltitude - STARFIELD_START_ALTITUDE) /
				(STARFIELD_FULL_ALTITUDE - STARFIELD_START_ALTITUDE),
		),
	);
	if (fade <= 0) return;
	for (const star of twinklingStars) {
		const starY = star.y + sceneAltitude * STARFIELD_PARALLAX;
		const alpha = fade * (0.18 + (Math.sin(elapsedTime * Math.PI + star.phase) + 1) * 0.4);
		context.save();
		context.globalAlpha = alpha;
		context.fillStyle = '#f4f7ff';
		context.beginPath();
		context.arc(star.x, starY, star.size, 0, Math.PI * 2);
		context.fill();
		context.globalAlpha *= 0.72;
		context.strokeStyle = '#f4f7ff';
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(star.x - star.size * 2.2, starY);
		context.lineTo(star.x + star.size * 2.2, starY);
		context.moveTo(star.x, starY - star.size * 2.2);
		context.lineTo(star.x, starY + star.size * 2.2);
		context.stroke();
		context.restore();
	}
}

function drawConstellations(sceneAltitude: number): void {
	const fade = smoothStep(
		(sceneAltitude - CONSTELLATION_START_ALTITUDE) /
			(CONSTELLATION_FULL_ALTITUDE - CONSTELLATION_START_ALTITUDE),
	);
	if (fade <= 0) return;

	const constellationWidth = Math.min(width * 0.4, 118);
	const constellationHeight = Math.min(height * 0.12, 64);

	context.save();
	for (const layout of CONSTELLATION_LAYOUT) {
		const pattern = CONSTELLATION_PATTERNS[layout.pattern];
		const centerX = width * layout.x;
		const centerY = height * layout.y +
			(sceneAltitude - layout.worldAltitude) * CONSTELLATION_PARALLAX;
		if (centerY < -constellationHeight || centerY > height + constellationHeight) continue;
		const points = pattern.points.map((point) => ({
			x: centerX + (point.x - 0.5) * constellationWidth,
			y: centerY + (point.y - 0.5) * constellationHeight,
		}));

		context.globalAlpha = fade * 0.22;
		context.strokeStyle = '#9bcaff';
		context.lineWidth = 0.8;
		context.beginPath();
		for (const [start, end] of pattern.links) {
			context.moveTo(points[start].x, points[start].y);
			context.lineTo(points[end].x, points[end].y);
		}
		context.stroke();

		for (let starIndex = 0; starIndex < points.length; starIndex += 1) {
			const point = points[starIndex];
			const twinkle = 0.55 +
				Math.abs(Math.sin(elapsedTime * 1.6 + layout.pattern * 1.9 + starIndex)) * 0.28;
			const radius = 1 + constellationRandom(layout.pattern, starIndex + 1) * 1.2;
			context.globalAlpha = fade * twinkle * 0.78;
			context.fillStyle = starIndex === layout.pattern % points.length ? '#ffffff' : '#cfe5ff';
			context.shadowColor = '#b6d7ff';
			context.shadowBlur = starIndex === layout.pattern % points.length ? 5 : 2;
			context.beginPath();
			context.arc(point.x, point.y, radius, 0, Math.PI * 2);
			context.fill();
		}
	}
	context.restore();
}

function constellationRandom(index: number, salt: number): number {
	const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
	return value - Math.floor(value);
}

function drawAmbientElement(element: AmbientElement): void {
	context.save();
	context.translate(element.x, element.y);
	context.rotate(element.rotation);
	if (element.type === 'bubble') {
		context.globalAlpha = 0.54;
		context.fillStyle = ['#8ae6e9', '#d4a5fa', '#ffd48e'][Math.floor(element.phase) % 3];
		context.beginPath();
		context.arc(0, 0, 4 * element.size, 0, Math.PI * 2);
		context.fill();
		context.globalAlpha = 0.85;
		context.fillStyle = '#ffffff';
		context.beginPath();
		context.arc(-1.3 * element.size, -1.4 * element.size, 1.1 * element.size, 0, Math.PI * 2);
		context.fill();
	} else if (element.type === 'cometStreak') {
		const tail = 96 * element.size + 42;
		const direction = Math.sign(element.vx);
		const tailX = -direction * tail;
		const coldComet = (element.worldAltitude ?? 0) >= 80000;
		const dustColor = coldComet ? '195, 229, 255' : '255, 232, 194';
		const ionColor = coldComet ? '151, 215, 255' : '142, 224, 255';
		const dustTail = context.createLinearGradient(0, 0, tailX, 0);
		dustTail.addColorStop(0, `rgba(${dustColor}, 0.72)`);
		dustTail.addColorStop(0.38, `rgba(${dustColor}, 0.27)`);
		dustTail.addColorStop(1, `rgba(${dustColor}, 0)`);
		context.fillStyle = dustTail;
		context.beginPath();
		context.moveTo(0, -2 * element.size);
		context.quadraticCurveTo(
			tailX * 0.3,
			-13 * element.size,
			tailX * 0.72,
			-6 * element.size,
		);
		context.quadraticCurveTo(tailX * 0.93, -2 * element.size, tailX, 2 * element.size);
		context.quadraticCurveTo(
			tailX * 0.65,
			8 * element.size,
			tailX * 0.28,
			11 * element.size,
		);
		context.quadraticCurveTo(4 * element.size, 7 * element.size, 0, -2 * element.size);
		context.fill();
		const ionTail = context.createLinearGradient(0, 0, tailX * 1.45, 0);
		ionTail.addColorStop(0, `rgba(${ionColor}, 0.92)`);
		ionTail.addColorStop(0.36, `rgba(${ionColor}, 0.32)`);
		ionTail.addColorStop(1, `rgba(${ionColor}, 0)`);
		context.strokeStyle = ionTail;
		context.lineWidth = 2 * element.size;
		context.beginPath();
		context.moveTo(0, -1 * element.size);
		context.quadraticCurveTo(
			tailX * 0.62,
			-6 * element.size,
			tailX * 1.45,
			-3 * element.size,
		);
		context.stroke();
		const coma = context.createRadialGradient(0, 0, 0, 0, 0, 17 * element.size);
		coma.addColorStop(0, 'rgba(242, 255, 255, 1)');
		coma.addColorStop(0.34, `rgba(${ionColor}, 0.63)`);
		coma.addColorStop(1, `rgba(${ionColor}, 0)`);
		context.fillStyle = coma;
		context.beginPath();
		context.arc(0, 0, 17 * element.size, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = coldComet ? '#e9f6ff' : '#fff4dc';
		context.beginPath();
		context.arc(0, 0, 3 * element.size, 0, Math.PI * 2);
		context.fill();
	} else {
		const frozen = element.type === 'frozenAsteroid';
		context.fillStyle = frozen ? '#91dce7' : '#c7a978';
		context.strokeStyle = frozen ? '#d8fbff' : '#f3dfa9';
		context.lineWidth = 1;
		context.beginPath();
		for (let point = 0; point < 8; point += 1) {
			const angle = point * Math.PI / 4;
			const radius = (point % 2 === 0 ? 8 : 6) * element.size;
			const x = Math.cos(angle) * radius;
			const y = Math.sin(angle) * radius * 0.8;
			if (point === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.closePath();
		context.fill();
		context.stroke();
		context.fillStyle = frozen ? 'rgba(239, 255, 255, 0.7)' : 'rgba(92, 71, 54, 0.48)';
		context.beginPath();
		context.arc(-2 * element.size, -1 * element.size, 1.6 * element.size, 0, Math.PI * 2);
		context.arc(3 * element.size, 2 * element.size, 1.2 * element.size, 0, Math.PI * 2);
		context.fill();
		if (element.type === 'ringDebris') {
			context.fillStyle = '#fff5be';
			context.fillRect(8 * element.size, -5 * element.size, 2, 2);
			context.fillRect(-9 * element.size, 4 * element.size, 1.5, 1.5);
		}
	}
	context.restore();
}

function createAmbientElement(type: AmbientType, worldAltitude: number): AmbientElement {
	const fromLeft = Math.random() < 0.5;
	const size = 0.65 + Math.random() * 0.75;
	if (type === 'bubble') {
		const x = Math.random() * width;
		const y = height * (0.2 + Math.random() * 0.65);
		return {
			type, x, y, baseY: y, vx: 0, vy: -(5 + Math.random() * 7), size,
			phase: Math.random() * 3, rotation: 0, originX: x, age: 0,
			color: '#8ae6e9', labelColor: '#ffffff', bobAmplitude: 0, bobFrequency: 0,
			worldAltitude,
		};
	}
	if (type === 'cometStreak') {
		const vx = (fromLeft ? 1 : -1) * (80 + Math.random() * 90);
		const x = width * (0.12 + Math.random() * 0.76);
		return {
			type, x, y: Math.random() * height * 0.48,
			baseY: 0, vx, vy: 0, size, phase: 0, rotation: 0, originX: 0, age: 0,
			color: '#ffffff', labelColor: '#ffffff', bobAmplitude: 0, bobFrequency: 0,
			worldAltitude,
		};
	}
	const driftSpeed = type === 'ringDebris' ? 12 + Math.random() * 15 : 7 + Math.random() * 12;
	const vx = (fromLeft ? 1 : -1) * driftSpeed;
	return {
		type,
		x: width * (0.08 + Math.random() * 0.84),
		y: height * (0.08 + Math.random() * 0.78),
		baseY: 0,
		vx,
		vy: type === 'ringDebris' ? driftSpeed * 0.55 : 0,
		size,
		phase: Math.random() * Math.PI * 2,
		rotation: Math.random() * Math.PI * 2,
		originX: 0,
		age: 0,
		color: '#91dce7',
		labelColor: '#ffffff',
		bobAmplitude: 0,
		bobFrequency: 0,
		worldAltitude,
	};
}

function mixColor(start: string, end: string, amount: number): string {
	const parse = (color: string) => {
		const value = color.replace('#', '');
		return [
			Number.parseInt(value.slice(0, 2), 16),
			Number.parseInt(value.slice(2, 4), 16),
			Number.parseInt(value.slice(4, 6), 16),
		];
	};
	const from = parse(start);
	const to = parse(end);
	const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * amount);
	return `#${[0, 1, 2]
		.map((index) => channel(index).toString(16).padStart(2, '0'))
		.join('')}`;
}

function smoothStep(value: number): number {
	const amount = Math.max(0, Math.min(1, value));
	return amount * amount * (3 - 2 * amount);
}

function createBackgroundElement(
	type: BackgroundElement['type'],
	y: number,
	worldAltitude = altitude,
): BackgroundElement {
	const isPlane = type === 'plane' || type === 'distantPlane';
	const planeDirection: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
	const planeAngle = isPlane
		? (Math.random() * 2 - 1) * PLANE_MAX_PATH_ANGLE
		: (Math.random() - 0.5) * (Math.PI / 6);
	const angle = isPlane ? planeAngle : Math.random() * Math.PI * 2;
	const planeVerticalTravel = isPlane
		? Math.tan(planeAngle) * planeDirection * (width + 140)
		: 0;
	const planeSpawnMargin = 24;
	const minPlaneY = planeSpawnMargin + Math.max(0, -planeVerticalTravel);
	const maxPlaneY = height - planeSpawnMargin - Math.max(0, planeVerticalTravel);
	const planeY = minPlaneY <= maxPlaneY
		? minPlaneY + Math.random() * (maxPlaneY - minPlaneY)
		: height / 2 - planeVerticalTravel / 2;
	const speed =
		type === 'comet'
			? 42 + Math.random() * 38
				: type === 'plane'
					? 165 + Math.random() * 50
					: type === 'distantPlane'
						? 185 + Math.random() * 50
					: type === 'cloud'
						? 2 + Math.random() * 4
						: type === 'bird'
							? 8 + Math.random() * 12
					: type === 'asteroid'
						? 5 + Math.random() * 10
							: 5 + Math.random() * 14;
	const planeSize = 0.9 + Math.random() * 0.15;
	const direction: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
	return {
		type,
		x: isPlane
			? (planeDirection === 1 ? -70 : width + 70)
			: Math.random() * width,
		y: isPlane ? planeY : y,
		size:
			type === 'station'
				? 0.9 + Math.random() * 0.35
				: type === 'comet'
					? 0.8 + Math.random() * 0.8
					: type === 'plane'
						? planeSize
						: type === 'distantPlane'
							? 0.28 + Math.random() * 0.1
						: type === 'bird'
							? 0.55 + Math.random() * 0.38
							: type === 'cloud'
									? 0.56 + Math.random() * 0.42
								: 0.55 + Math.random() * 0.8,
		speed,
		parallax: type === 'star'
			? STARFIELD_PARALLAX
			: type === 'cloud'
				? 0.32
				: type === 'bird'
					? 0.56
					: type === 'distantPlane'
						? 0.42
						: 0.78,
		phase: Math.random() * Math.PI * 2,
		vx: isPlane
			? planeDirection * speed
			: type === 'cloud'
				? (Math.random() - 0.5) * speed
				: type === 'bird'
					? direction * speed
					: Math.cos(angle) * speed,
		vy: isPlane
			? planeDirection * Math.tan(planeAngle) * speed
			: type === 'cloud'
				? (Math.random() - 0.5) * 0.8
				: type === 'bird'
					? Math.sin(angle) * speed * 0.15
					: Math.sin(angle) * speed * 0.28,
		contrail: [],
		region: getCourseStageIndex(worldAltitude),
		worldAltitude,
	};
}

function chooseStageObject(sceneAltitude = altitude): BackgroundElement['type'] {
	const stage = getCourseStageIndex(sceneAltitude);
	const mainObject = COURSE_STAGES[stage].flyingObject as BackgroundElement['type'];
	if (stage > 0 && Math.random() < 0.008) return 'alienMothership';
	if (stage > 0 && Math.random() < 0.025) return 'alienScout';
	const localObjects: BackgroundElement['type'][][] = [
		['cloud', 'bird', 'bird', 'cloud', 'bird'],
		['lunarProbe', 'satellite', 'asteroid', 'satellite'],
		['rover', 'marsHelicopter', 'satellite', 'satellite', 'satellite', 'satellite', 'satellite', 'comet'],
		['jupiterProbe', 'asteroid', 'asteroid', 'asteroid', 'satellite', 'satellite', 'satellite', 'comet'],
		['cassiniProbe', 'satellite', 'asteroid', 'satellite', 'asteroid', 'satellite', 'asteroid', 'comet'],
		['uranusProbe', 'asteroid', 'satellite', 'asteroid', 'satellite', 'asteroid', 'satellite', 'comet'],
		['neptuneProbe', 'asteroid', 'satellite', 'asteroid', 'satellite', 'asteroid', 'satellite', 'comet'],
		['arrokoth', 'newHorizonsProbe', 'asteroid', 'asteroid', 'asteroid', 'satellite', 'satellite', 'comet'],
		['voyagerProbe', 'oortComet', 'asteroid', 'asteroid', 'asteroid', 'asteroid', 'satellite', 'asteroid'],
		['voyagerProbe', 'interstellarObject', 'interstellarObject', 'voyagerProbe', 'asteroid', 'satellite', 'asteroid', 'comet'],
	];
	const regionalObjects = localObjects[stage];
	const selectedObject = regionalObjects[Math.floor(Math.random() * regionalObjects.length)] ?? mainObject;
	if (
		(selectedObject === 'comet' || selectedObject === 'oortComet') &&
		Math.random() < 0.5
	) {
		return mainObject;
	}
	return selectedObject;
}

function seedBackground(): void {
	previewScenery.clear();
	backgroundStageIndex = 0;
	seedStageScenery(0);
	twinklingStars = Array.from({ length: 18 }, () => ({
		x: Math.random() * width,
		y: Math.random() * height,
		size: 0.7 + Math.random() * 1.1,
		phase: Math.random() * Math.PI * 2,
	}));
	debrisHazard = null;
	nextDebrisAt = elapsedTime + 5 + Math.random() * 3;
	nextPlaneAt = elapsedTime + 2 + Math.random() * 3;
	nextDistantPlaneAt = elapsedTime + 12 + Math.random() * 12;
}

function seedStageScenery(stageIndex: number): void {
	const stageStart = stageIndex * STAGE_RAW_HEIGHT;
	const backgroundCount = stageIndex === 0 ? 24 : 20;
	backgroundElements = Array.from({ length: backgroundCount }, (_, index) => {
		const spacing = STAGE_RAW_HEIGHT / backgroundCount;
		let worldAltitude = stageStart + (index + 0.5) * spacing +
			(Math.random() - 0.5) * spacing * 0.35;
		const objectType = chooseStageObject(worldAltitude);
		if (objectType === 'cloud') {
			worldAltitude = Math.max(worldAltitude, WEATHER_CLOUD_START_ALTITUDE);
		}
		const row = index % 5;
		const y = objectType === 'cloud'
			? -Math.max(70, height * 0.12)
			: height * (0.16 + row * 0.15 + Math.random() * 0.06);
		return createBackgroundElement(objectType, y, worldAltitude);
	});

	const ambientCounts: Partial<Record<AmbientType, number>> =
		stageIndex === 3 ? { bubble: 8 }
			: stageIndex === 4 ? { bubble: 5, ringDebris: 12 }
				: stageIndex === 5 || stageIndex === 6 ? { frozenAsteroid: 10 }
					: stageIndex >= 7 ? { cometStreak: 1 }
						: {};
	ambientElements = [];
	for (const [type, count] of Object.entries(ambientCounts) as Array<[AmbientType, number]>) {
		for (let index = 0; index < count; index += 1) {
			const spacing = STAGE_RAW_HEIGHT / count;
			const worldAltitude = stageStart + (index + 0.5) * spacing +
				(Math.random() - 0.5) * spacing * 0.3;
			ambientElements.push(createAmbientElement(type, worldAltitude));
		}
	}
	if (mode !== 'playing') {
		previewScenery.set(stageIndex, {
			background: backgroundElements,
			ambient: ambientElements,
		});
	}
}

function activateStageScenery(stageIndex: number): void {
	const savedScenery = mode === 'playing' ? undefined : previewScenery.get(stageIndex);
	if (savedScenery) {
		backgroundElements = savedScenery.background;
		ambientElements = savedScenery.ambient;
		return;
	}
	seedStageScenery(stageIndex);
}

function drawBird(element: BackgroundElement): void {
	const flap = Math.sin(elapsedTime * 9 + element.phase) * 3 * element.size;
	context.save();
	context.translate(element.x, element.y);
	context.strokeStyle = '#355864';
	context.lineWidth = 2.6 * element.size;
	context.lineCap = 'round';
	context.shadowColor = 'rgba(30, 61, 72, 0.38)';
	context.shadowBlur = 2 * element.size;
	context.beginPath();
	context.moveTo(-13 * element.size, flap + 1);
	context.quadraticCurveTo(-6 * element.size, -8 * element.size, 0, flap);
	context.quadraticCurveTo(6 * element.size, -8 * element.size, 13 * element.size, flap + 1);
	context.stroke();
	context.fillStyle = '#355864';
	context.beginPath();
	context.arc(0, flap, 1.8 * element.size, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawPlane(element: BackgroundElement): void {
	const planeWidth = 128 * element.size;
	const planeHeight = planeWidth * (airlinerSprite.naturalHeight / airlinerSprite.naturalWidth);
	const planeScale = element.type === 'distantPlane' ? 0.55 : 1;
	const contrailAngle = Math.atan2(element.vy, element.vx);
	for (const point of element.contrail) {
		const opacity = 0.4 * (1 - point.age / CONTRAIL_LIFETIME);
		context.save();
		context.globalAlpha *= opacity;
		context.strokeStyle = '#eff8ff';
		context.lineWidth = 1.2 * planeScale * (1 - point.age / CONTRAIL_LIFETIME);
		context.beginPath();
		context.moveTo(point.x, point.y);
		context.lineTo(
			point.x - Math.cos(contrailAngle) * 5,
			point.y - Math.sin(contrailAngle) * 5,
		);
		context.stroke();
		context.restore();
	}
	if (!airlinerSprite.complete || airlinerSprite.naturalWidth === 0) return;
	context.save();
	context.translate(element.x, element.y);
	context.rotate(Math.atan2(element.vy * Math.sign(element.vx), Math.abs(element.vx)));
	context.scale(element.vx > 0 ? -1 : 1, 1);
	context.imageSmoothingEnabled = true;
	context.drawImage(airlinerSprite, -planeWidth / 2, -planeHeight / 2, planeWidth, planeHeight);
	context.restore();
}

function drawBackgroundElement(
	element: BackgroundElement,
	sceneAltitude: number,
	stageIndex: number,
): void {
	if (element.region !== undefined && element.region !== stageIndex) return;
	if (element.type === 'cloud' && sceneAltitude < WEATHER_CLOUD_START_ALTITUDE) return;
	if (
		element.type === 'cloud' &&
		sceneAltitude < (element.worldAltitude ?? WEATHER_CLOUD_START_ALTITUDE)
	) {
		return;
	}
	const altitudeShift = sceneAltitude - (element.worldAltitude ?? sceneAltitude);
	const visualY = element.y + altitudeShift * element.parallax;
	const margin = Math.max(
		70,
		element.size * 60,
		element.type === 'comet' || element.type === 'oortComet' ? element.size * 230 : 0,
	);
	const visibleContrail = element.contrail.some((point) => {
		const trailY = point.y + altitudeShift * element.parallax;
		return trailY >= -4 && trailY <= height + 4;
	});
	if (
		!visibleContrail &&
		(
			element.x < -margin ||
			element.x > width + margin ||
			visualY < -margin ||
			visualY > height + margin
		)
	) {
		return;
	}
	const visualElement = {
		...element,
		y: visualY,
		contrail: element.contrail.map((point) => ({
			...point,
			y: point.y + altitudeShift * element.parallax,
		})),
	};
	context.save();
	if (element.type === 'distantPlane') context.globalAlpha *= 0.68;
	if (element.type === 'cloud') {
		const daylight = daylightFactor();
		const cloudColor = mixColor('#303d59', '#ffffff', 0.22 + daylight * 0.78);
		const darkWeather = combinedWeatherWeight([
			'rain', 'freezing-rain', 'rain-showers', 'thunderstorm', 'hail',
		]);
		drawCloud(
			visualElement.x,
			visualElement.y,
			visualElement.size,
			0.62,
			mixColor(cloudColor, '#66717f', darkWeather * 0.76),
		);
	}
	else if (element.type === 'bird') drawBird(visualElement);
	else if (element.type === 'plane' || element.type === 'distantPlane') drawPlane(visualElement);
	else if (element.type === 'star') drawStar(visualElement);
	else if (element.type === 'comet' || element.type === 'oortComet') drawComet(visualElement);
	else if (element.type === 'station') drawSpaceStation(visualElement);
	else if (element.type === 'satellite') drawSatellite(visualElement);
	else if (element.type === 'asteroid') drawAsteroid(visualElement);
	else drawStageObject(visualElement);
	context.restore();
}

function getPlaneTailPosition(element: BackgroundElement): { x: number; y: number } {
	const direction = Math.sign(element.vx) || 1;
	const angle = Math.atan2(element.vy * direction, Math.abs(element.vx));
	const tailOffset = 64 * element.size;
	return {
		x: element.x - direction * Math.cos(angle) * tailOffset,
		y: element.y - direction * Math.sin(angle) * tailOffset,
	};
}

function getPlaneCockpitPosition(
	element: BackgroundElement,
	sceneAltitude = altitude,
): { x: number; y: number } {
	const planeWidth = 128 * element.size;
	const spriteAspect = airlinerSprite.naturalWidth > 0
		? airlinerSprite.naturalHeight / airlinerSprite.naturalWidth
		: 0.25;
	const facing = Math.sign(element.vx) || 1;
	const angle = Math.atan2(element.vy * facing, Math.abs(element.vx));
	const localX = facing * planeWidth * 0.46;
	const localY = planeWidth * spriteAspect * 0.12;
	const visualY = element.y +
		(sceneAltitude - (element.worldAltitude ?? sceneAltitude)) * element.parallax;
	return {
		x: element.x + localX * Math.cos(angle) - localY * Math.sin(angle),
		y: visualY + localX * Math.sin(angle) + localY * Math.cos(angle),
	};
}

function drawStageObject(element: BackgroundElement): void {
	const size = element.size;
	const pulse = 0.75 + Math.sin(elapsedTime * 2 + element.phase) * 0.12;
	context.save();
	context.translate(element.x, element.y + Math.sin(elapsedTime * 0.8 + element.phase) * 3);
	context.rotate(Math.sin(elapsedTime * 0.25 + element.phase) * 0.08);
	if (element.type === 'jellyfish') {
		context.fillStyle = 'rgba(155, 242, 239, 0.82)';
		context.shadowColor = '#a2fff3';
		context.shadowBlur = 12 * size;
		context.beginPath();
		context.arc(0, 0, 10 * size, Math.PI, 0);
		context.quadraticCurveTo(10 * size, 11 * size, 0, 8 * size);
		context.quadraticCurveTo(-10 * size, 11 * size, -10 * size, 0);
		context.fill();
		context.strokeStyle = 'rgba(192, 255, 247, 0.78)';
		context.lineWidth = 1.5 * size;
		for (let tentacle = -1; tentacle <= 1; tentacle += 1) {
			context.beginPath();
			context.moveTo(tentacle * 5 * size, 7 * size);
			context.quadraticCurveTo(tentacle * 9 * size, 16 * size, tentacle * 5 * size, 24 * size);
			context.stroke();
		}
	} else if (element.type === 'crystal') {
		context.shadowColor = '#e6adff';
		context.shadowBlur = 13 * size;
		context.fillStyle = '#c99bfa';
		context.strokeStyle = '#f5e9ff';
		context.lineWidth = 1.2;
		context.beginPath();
		context.moveTo(0, -14 * size);
		context.lineTo(8 * size, -3 * size);
		context.lineTo(5 * size, 12 * size);
		context.lineTo(-5 * size, 12 * size);
		context.lineTo(-8 * size, -3 * size);
		context.closePath();
		context.fill();
		context.stroke();
		context.strokeStyle = 'rgba(255,255,255,0.8)';
		context.beginPath();
		context.moveTo(0, -11 * size);
		context.lineTo(1 * size, 9 * size);
		context.stroke();
	} else if (element.type === 'aurora') {
		context.globalAlpha *= pulse;
		context.strokeStyle = '#8dffd0';
		context.shadowColor = '#55f7d1';
		context.shadowBlur = 12 * size;
		context.lineWidth = 3 * size;
		context.beginPath();
		context.moveTo(-18 * size, 6 * size);
		context.bezierCurveTo(-10 * size, -12 * size, 4 * size, 15 * size, 18 * size, -7 * size);
		context.stroke();
		context.strokeStyle = '#d8fff3';
		context.lineWidth = 1 * size;
		context.stroke();
	} else if (element.type === 'solarFlare') {
		context.fillStyle = '#ffca70';
		context.shadowColor = '#ff744e';
		context.shadowBlur = 14 * size;
		context.beginPath();
		context.arc(0, 0, 8 * size, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = '#ff9564';
		context.lineWidth = 2 * size;
		for (let ray = 0; ray < 8; ray += 1) {
			const angle = ray * Math.PI / 4 + elapsedTime * 0.3;
			context.beginPath();
			context.moveTo(Math.cos(angle) * 11 * size, Math.sin(angle) * 11 * size);
			context.lineTo(Math.cos(angle) * (18 + pulse * 4) * size, Math.sin(angle) * (18 + pulse * 4) * size);
			context.stroke();
		}
	} else if (element.type === 'marsHelicopter') {
		context.strokeStyle = '#e8bd83';
		context.lineWidth = 1.4 * size;
		context.beginPath();
		context.moveTo(-3 * size, -7 * size);
		context.lineTo(3 * size, -7 * size);
		context.moveTo(-10 * size, -9 * size);
		context.lineTo(10 * size, -9 * size);
		context.moveTo(0, -7 * size);
		context.lineTo(0, -3 * size);
		context.stroke();
		context.fillStyle = '#df8854';
		context.beginPath();
		context.roundRect(-5 * size, -3 * size, 10 * size, 7 * size, 2 * size);
		context.fill();
		context.strokeStyle = '#d8c49e';
		context.beginPath();
		context.moveTo(-3 * size, 4 * size);
		context.lineTo(-6 * size, 9 * size);
		context.moveTo(3 * size, 4 * size);
		context.lineTo(6 * size, 9 * size);
		context.moveTo(-5 * size, 6 * size);
		context.lineTo(5 * size, 6 * size);
		context.moveTo(5 * size, 0);
		context.lineTo(11 * size, 3 * size);
		context.stroke();
	} else if (element.type === 'arrokoth') {
		context.fillStyle = '#b88b72';
		context.strokeStyle = '#e1b59a';
		context.lineWidth = 1 * size;
		context.beginPath();
		context.ellipse(-5 * size, 0, 7 * size, 5 * size, -0.2, 0, Math.PI * 2);
		context.ellipse(5 * size, 0, 6 * size, 4.5 * size, 0.2, 0, Math.PI * 2);
		context.fill();
		context.stroke();
		context.strokeStyle = 'rgba(71, 48, 49, 0.7)';
		context.beginPath();
		context.moveTo(0, -3 * size);
		context.lineTo(1 * size, 3 * size);
		context.stroke();
	} else if (element.type === 'oortComet' || element.type === 'interstellarObject') {
		const cometColor = element.type === 'oortComet' ? '#c7edff' : '#ffd7a1';
		context.rotate(-0.35);
		const tailGradient = context.createLinearGradient(0, 0, -32 * size, 0);
		tailGradient.addColorStop(0, `${cometColor}cc`);
		tailGradient.addColorStop(1, `${cometColor}00`);
		context.strokeStyle = tailGradient;
		context.lineWidth = (element.type === 'oortComet' ? 2 : 3) * size;
		context.beginPath();
		context.moveTo(-2 * size, 0);
		context.lineTo(-32 * size, 0);
		context.stroke();
		context.fillStyle = cometColor;
		context.shadowColor = cometColor;
		context.shadowBlur = 8 * size;
		context.beginPath();
		context.arc(0, 0, 3.5 * size, 0, Math.PI * 2);
		context.fill();
	} else if (element.type === 'alienScout') {
		context.shadowColor = '#6cf7ef';
		context.shadowBlur = 12 * size;
		const hull = context.createLinearGradient(0, -9 * size, 0, 9 * size);
		hull.addColorStop(0, '#d9ffff');
		hull.addColorStop(0.36, '#57d9dc');
		hull.addColorStop(1, '#344d87');
		context.fillStyle = hull;
		context.strokeStyle = '#c2ffff';
		context.lineWidth = 1 * size;
		context.beginPath();
		context.moveTo(-21 * size, 1 * size);
		context.quadraticCurveTo(-9 * size, -7 * size, -3 * size, -8 * size);
		context.quadraticCurveTo(5 * size, -13 * size, 12 * size, -5 * size);
		context.lineTo(20 * size, 0);
		context.lineTo(10 * size, 7 * size);
		context.quadraticCurveTo(0, 10 * size, -10 * size, 6 * size);
		context.closePath();
		context.fill();
		context.stroke();
		context.fillStyle = '#27345f';
		context.beginPath();
		context.moveTo(-8 * size, 4 * size);
		context.lineTo(-16 * size, 12 * size);
		context.lineTo(-4 * size, 8 * size);
		context.moveTo(7 * size, 4 * size);
		context.lineTo(15 * size, 11 * size);
		context.lineTo(4 * size, 8 * size);
		context.fill();
		context.fillStyle = '#f4ffff';
		context.shadowColor = '#c5ffff';
		context.shadowBlur = 7 * size;
		context.beginPath();
		context.ellipse(3 * size, -3 * size, 4.5 * size, 2.6 * size, -0.15, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = '#86fff0';
		context.beginPath();
		context.arc(-13 * size, 2 * size, 1.3 * size, 0, Math.PI * 2);
		context.arc(13 * size, 2 * size, 1.3 * size, 0, Math.PI * 2);
		context.fill();
	} else if (element.type === 'alienMothership') {
		const shipSize = size * 1.55;
		context.globalAlpha *= 0.86 + pulse * 0.14;
		context.shadowColor = '#b88cff';
		context.shadowBlur = 18 * shipSize;
		const hull = context.createLinearGradient(0, -13 * shipSize, 0, 14 * shipSize);
		hull.addColorStop(0, '#eadbff');
		hull.addColorStop(0.32, '#8f75d7');
		hull.addColorStop(1, '#30395f');
		context.fillStyle = hull;
		context.strokeStyle = '#ded3ff';
		context.lineWidth = 1.2 * size;
		context.beginPath();
		context.moveTo(-31 * shipSize, 1 * shipSize);
		context.quadraticCurveTo(-22 * shipSize, -5 * shipSize, -10 * shipSize, -7 * shipSize);
		context.quadraticCurveTo(-5 * shipSize, -15 * shipSize, 7 * shipSize, -12 * shipSize);
		context.quadraticCurveTo(20 * shipSize, -8 * shipSize, 31 * shipSize, 1 * shipSize);
		context.quadraticCurveTo(22 * shipSize, 8 * shipSize, 9 * shipSize, 10 * shipSize);
		context.lineTo(-10 * shipSize, 9 * shipSize);
		context.quadraticCurveTo(-24 * shipSize, 7 * shipSize, -31 * shipSize, 1 * shipSize);
		context.closePath();
		context.fill();
		context.stroke();
		context.fillStyle = 'rgba(28, 37, 72, 0.86)';
		context.beginPath();
		context.ellipse(0, -5 * shipSize, 10 * shipSize, 4.2 * shipSize, 0, Math.PI, Math.PI * 2);
		context.fill();
		context.fillStyle = '#fff0c7';
		const shipAlpha = context.globalAlpha;
		for (let window = -2; window <= 2; window += 1) {
			context.globalAlpha = shipAlpha * 0.95;
			context.beginPath();
			context.arc(window * 8 * shipSize, 2 * shipSize, 1.25 * shipSize, 0, Math.PI * 2);
			context.fill();
		}
		context.globalAlpha = shipAlpha;
		context.fillStyle = '#9cf7ff';
		context.shadowColor = '#64eaff';
		context.shadowBlur = 10 * shipSize;
		context.beginPath();
		context.ellipse(-8 * shipSize, 11 * shipSize, 3 * shipSize, 5 * shipSize, 0, 0, Math.PI * 2);
		context.ellipse(8 * shipSize, 11 * shipSize, 3 * shipSize, 5 * shipSize, 0, 0, Math.PI * 2);
		context.fill();
	} else {
		const palette = element.type === 'rover'
			? { body: '#d88b5c', trim: '#f4d092', wing: '#6e9ebc' }
			: element.type === 'lunarProbe'
					? { body: '#d8e5ec', trim: '#8aa5be', wing: '#6f8eb6' }
					: element.type === 'jupiterProbe'
						? { body: '#f3b36f', trim: '#fff0ca', wing: '#b8754f' }
						: element.type === 'uranusProbe'
							? { body: '#8de0dc', trim: '#e4fffa', wing: '#539bb0' }
							: element.type === 'neptuneProbe'
								? { body: '#92a9ff', trim: '#e2e8ff', wing: '#546ec3' }
								: element.type === 'voyagerProbe'
									? { body: '#f4d88b', trim: '#fff8d9', wing: '#bd9c52' }
					: { body: '#c5d4e7', trim: '#eff7ff', wing: '#839bdb' };
		context.strokeStyle = palette.trim;
		context.fillStyle = palette.wing;
		context.lineWidth = 1.2 * size;
		context.beginPath();
		context.ellipse(0, 0, 15 * size, 5 * size, 0, 0, Math.PI * 2);
		context.stroke();
		context.fillRect(-19 * size, -5 * size, 9 * size, 10 * size);
		context.fillRect(10 * size, -5 * size, 9 * size, 10 * size);
		context.fillStyle = palette.body;
		context.beginPath();
		context.roundRect(-7 * size, -5 * size, 14 * size, 10 * size, 3 * size);
		context.fill();
		context.fillStyle = palette.trim;
		context.beginPath();
		context.arc(0, -1 * size, 2 * size, 0, Math.PI * 2);
		context.fill();
		if (element.type === 'cassiniProbe') {
			context.strokeStyle = '#f2dfad';
			context.lineWidth = 1.2 * size;
			context.beginPath();
			context.ellipse(0, 0, 21 * size, 7 * size, -0.32, 0, Math.PI * 2);
			context.stroke();
			context.fillStyle = '#cf9c58';
			context.beginPath();
			context.moveTo(-3 * size, 4 * size);
			context.lineTo(0, 9 * size);
			context.lineTo(3 * size, 4 * size);
			context.fill();
		} else if (element.type === 'newHorizonsProbe') {
			context.strokeStyle = '#fff1c7';
			context.lineWidth = 1.1 * size;
			context.beginPath();
			context.moveTo(6 * size, 0);
			context.lineTo(17 * size, -6 * size);
			context.stroke();
			context.fillStyle = '#ffe9b2';
			context.beginPath();
			context.arc(18 * size, -6 * size, 3 * size, 0, Math.PI * 2);
			context.fill();
		}
		if (element.type === 'rover') {
			context.fillStyle = '#39394c';
			context.beginPath();
			context.arc(-5 * size, 6 * size, 2.5 * size, 0, Math.PI * 2);
			context.arc(5 * size, 6 * size, 2.5 * size, 0, Math.PI * 2);
			context.fill();
		}
	}
	context.restore();
}

function drawStar(element: BackgroundElement): void {
	const twinkle = 0.45 + Math.abs(Math.sin(elapsedTime * 2 + element.phase)) * 0.55;
	context.save();
	context.globalAlpha *= twinkle;
	context.fillStyle = '#f4f5ff';
	context.beginPath();
	context.arc(element.x, element.y, 1.1 * element.size, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawComet(element: BackgroundElement): void {
	const size = element.size;
	const tail = 115 * size + 45;
	const ionTail = tail * 1.42;
	const icyComet = element.type === 'oortComet';
	const dustColor = icyComet ? '196, 229, 255' : '255, 222, 174';
	const ionColor = icyComet ? '148, 216, 255' : '129, 216, 255';
	context.save();
	context.translate(element.x, element.y);
	const angle = Math.atan2(element.vy, element.vx);
	context.rotate(angle);
	const dustTail = context.createLinearGradient(0, 0, -tail, 0);
	dustTail.addColorStop(0, `rgba(${dustColor}, 0.62)`);
	dustTail.addColorStop(0.24, `rgba(${dustColor}, 0.3)`);
	dustTail.addColorStop(1, `rgba(${dustColor}, 0)`);
	context.fillStyle = dustTail;
	context.beginPath();
	context.moveTo(-2 * size, -2 * size);
	context.quadraticCurveTo(-tail * 0.28, -17 * size, -tail * 0.68, -8 * size);
	context.quadraticCurveTo(-tail * 0.91, -3 * size, -tail, 2 * size);
	context.quadraticCurveTo(-tail * 0.7, 7 * size, -tail * 0.27, 12 * size);
	context.quadraticCurveTo(-8 * size, 8 * size, -2 * size, 3 * size);
	context.closePath();
	context.fill();

	const ionGradient = context.createLinearGradient(0, 0, -ionTail, 0);
	ionGradient.addColorStop(0, `rgba(${ionColor}, 0.86)`);
	ionGradient.addColorStop(0.32, `rgba(${ionColor}, 0.34)`);
	ionGradient.addColorStop(1, `rgba(${ionColor}, 0)`);
	context.strokeStyle = ionGradient;
	context.lineWidth = 3.2 * size;
	context.beginPath();
	context.moveTo(-3 * size, -1 * size);
	context.quadraticCurveTo(-ionTail * 0.5, -5 * size, -ionTail, -2 * size);
	context.stroke();

	context.strokeStyle = `rgba(255, 248, 225, 0.78)`;
	context.lineWidth = 1.15 * size;
	for (let filament = 0; filament < 3; filament += 1) {
		const offset = (filament - 1) * 3.3 * size;
		context.beginPath();
		context.moveTo(-2 * size, offset);
		context.quadraticCurveTo(
			-tail * 0.46,
			offset + Math.sin(elapsedTime * 1.7 + element.phase + filament) * 5 * size,
			-tail * (0.78 + filament * 0.07),
			offset * 1.35,
		);
		context.stroke();
	}

	const coma = context.createRadialGradient(0, 0, 1 * size, 0, 0, 28 * size);
	coma.addColorStop(0, 'rgba(255, 255, 246, 0.94)');
	coma.addColorStop(0.18, `rgba(${ionColor}, 0.72)`);
	coma.addColorStop(0.58, `rgba(${ionColor}, 0.22)`);
	coma.addColorStop(1, `rgba(${ionColor}, 0)`);
	context.fillStyle = coma;
	context.beginPath();
	context.arc(0, 0, 28 * size, 0, Math.PI * 2);
	context.fill();

	context.shadowBlur = 0;
	context.fillStyle = icyComet ? '#607285' : '#725c4a';
	context.strokeStyle = icyComet ? '#e6f7ff' : '#fff0cf';
	context.lineWidth = 1.2 * size;
	context.beginPath();
	for (let vertex = 0; vertex < 8; vertex += 1) {
		const vertexAngle = vertex * Math.PI / 4;
		const radius = (vertex % 2 === 0 ? 5.3 : 4) * size;
		const x = Math.cos(vertexAngle) * radius;
		const y = Math.sin(vertexAngle) * radius * 0.82;
		if (vertex === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.closePath();
	context.fill();
	context.stroke();

	context.fillStyle = icyComet ? 'rgba(225, 247, 255, 0.8)' : 'rgba(255, 244, 218, 0.82)';
	for (let fleck = 0; fleck < 9; fleck += 1) {
		const distance = 12 + ((fleck * 17 + elapsedTime * 8) % Math.max(ionTail * 0.72, 1));
		const spread = Math.sin(fleck * 19 + element.phase + elapsedTime * 0.35) * 11 * size;
		context.globalAlpha = 0.25 + ((fleck * 7) % 5) * 0.1;
		context.beginPath();
		context.arc(-distance, spread, (0.45 + (fleck % 3) * 0.35) * size, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

function drawGroundGrass(sceneAltitude: number): void {
	const grassTop = height - GROUND_SURFACE + sceneAltitude * GRASS_PARALLAX;
	if (grassTop > height) return;
	context.save();
	context.fillStyle = '#88a980';
	context.beginPath();
	context.moveTo(0, grassTop + 8);
	context.bezierCurveTo(width * 0.2, grassTop - 5, width * 0.36, grassTop + 10, width * 0.53, grassTop + 2);
	context.bezierCurveTo(width * 0.75, grassTop - 8, width * 0.9, grassTop + 4, width, grassTop + 1);
	context.lineTo(width, height);
	context.lineTo(0, height);
	context.closePath();
	context.fill();

	context.fillStyle = 'rgba(69, 103, 74, 0.22)';
	context.beginPath();
	context.ellipse(width * 0.52, height + 3, width * 0.7, 22, 0, 0, Math.PI * 2);
	context.fill();

	const flowerColors = ['#f6d976', '#f39b8f', '#faf6e8', '#b59bd5', '#e88770', '#f1a950'];
	for (let blade = 0; blade < 64; blade += 1) {
		const x = (blade * 31 + 8) % Math.max(width, 1);
		const y = grassTop + 7 + Math.sin(blade * 1.73) * 3;
		context.strokeStyle = blade % 2 === 0 ? '#6f956e' : '#a2b97e';
		context.lineWidth = blade % 5 === 0 ? 1.5 : 1;
		context.beginPath();
		context.moveTo(x, y + 8);
		context.quadraticCurveTo(x - 2, y + 4, x + Math.sin(blade) * 3, y);
		context.stroke();
	}

	for (let flower = 0; flower < 14; flower += 1) {
		const flowerX = ((flower * 61 + 23) % Math.max(width - 8, 1)) + 4;
		const flowerY = grassTop - 1 + Math.sin(flower * 1.7) * 5;
		const size = 2.6 + (flower % 3) * 0.65;
		context.strokeStyle = '#658c65';
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(flowerX, flowerY + 2);
		context.lineTo(flowerX + Math.sin(flower) * 2, grassTop + 11);
		context.stroke();
		context.fillStyle = flowerColors[flower % flowerColors.length];
		for (let petal = 0; petal < 5; petal += 1) {
			const angle = (petal / 5) * Math.PI * 2;
			context.beginPath();
			context.arc(
				flowerX + Math.cos(angle) * size,
				flowerY + Math.sin(angle) * size,
				size * 0.62,
				0,
				Math.PI * 2,
			);
			context.fill();
		}
		context.fillStyle = '#e9b95d';
		context.beginPath();
		context.arc(flowerX, flowerY, size * 0.48, 0, Math.PI * 2);
		context.fill();
	}

	for (let tuft = 0; tuft < 9; tuft += 1) {
		const x = ((tuft * 89 + 42) % Math.max(width, 1));
		const y = grassTop + 3 + Math.sin(tuft * 2.3) * 4;
		context.strokeStyle = tuft % 2 === 0 ? '#607f61' : '#b2c486';
		context.lineWidth = 1.6;
		context.beginPath();
		context.moveTo(x, y + 9);
		context.quadraticCurveTo(x - 7, y + 3, x - 5, y - 1);
		context.moveTo(x, y + 9);
		context.quadraticCurveTo(x, y + 1, x + 1, y - 4);
		context.moveTo(x, y + 9);
		context.quadraticCurveTo(x + 7, y + 3, x + 6, y);
		context.stroke();
	}

	for (let stone = 0; stone < 7; stone += 1) {
		const x = ((stone * 103 + 17) % Math.max(width, 1));
		const y = grassTop + 9 + (stone % 3) * 3;
		context.fillStyle = stone % 2 === 0 ? '#b7c6ad' : '#d1d1b8';
		context.beginPath();
		context.ellipse(x, y, 3 + (stone % 3), 1.8, -0.12, 0, Math.PI * 2);
		context.fill();
	}
	const darkness = 1 - daylightFactor();
	if (darkness > 0.01) {
		context.fillStyle = `rgba(8, 15, 37, ${0.48 * darkness})`;
		context.fillRect(0, grassTop, width, height - grassTop);
	}
	context.restore();
}

function drawSatellite(element: BackgroundElement): void {
	context.save();
	context.translate(element.x, element.y);
	context.rotate(Math.sin(elapsedTime * 0.3 + element.phase) * 0.12);
	context.fillStyle = '#d8e5ec';
	context.strokeStyle = '#718ca7';
	context.lineWidth = 1;
	context.fillRect(-10 * element.size, -4 * element.size, 20 * element.size, 8 * element.size);
	context.strokeRect(-10 * element.size, -4 * element.size, 20 * element.size, 8 * element.size);
	context.fillStyle = '#7296c2';
	context.fillRect(-25 * element.size, -7 * element.size, 12 * element.size, 14 * element.size);
	context.fillRect(13 * element.size, -7 * element.size, 12 * element.size, 14 * element.size);
	context.strokeStyle = 'rgba(210, 225, 255, 0.65)';
	context.beginPath();
	context.moveTo(0, -5 * element.size);
	context.lineTo(4 * element.size, -12 * element.size);
	context.stroke();
	context.restore();
}

function drawSpaceStation(element: BackgroundElement): void {
	context.save();
	context.translate(element.x, element.y);
	context.rotate(Math.sin(elapsedTime * 0.18 + element.phase) * 0.035);
	const scale = element.size;
	context.strokeStyle = '#d3e0e8';
	context.lineWidth = 4 * scale;
	context.lineCap = 'round';
	context.beginPath();
	context.moveTo(-13 * scale, 0);
	context.lineTo(13 * scale, 0);
	context.moveTo(0, -8 * scale);
	context.lineTo(0, 8 * scale);
	context.stroke();
	context.fillStyle = '#c9d8e0';
	context.fillRect(-8 * scale, -5 * scale, 16 * scale, 10 * scale);
	context.fillStyle = '#708db8';
	context.fillRect(-35 * scale, -6 * scale, 22 * scale, 12 * scale);
	context.fillRect(13 * scale, -6 * scale, 22 * scale, 12 * scale);
	context.strokeStyle = 'rgba(206, 226, 255, 0.65)';
	context.lineWidth = 0.7;
	for (let cell = 0; cell < 4; cell += 1) {
		const panelX = -32 * scale + cell * 6 * scale;
		context.beginPath();
		context.moveTo(panelX, -6 * scale);
		context.lineTo(panelX, 6 * scale);
		context.stroke();
	}
	context.restore();
}

function drawMoon(sceneAltitude: number): void {
	const moonY = height * 0.39 + (sceneAltitude - MOON_ALTITUDE) * PLANET_PARALLAX;
	const radius = Math.min(158, width * 0.36);
	if (moonY < -radius - 20 || moonY > height + radius + 20) return;

	context.save();
	context.shadowColor = 'rgba(226, 228, 255, 0.35)';
	context.shadowBlur = radius * 0.43;
	drawPlanetDisk(moonX, moonY, radius, 'moon');
	if (astronautSprite.complete && astronautSprite.naturalWidth > 0) {
		const astronautHeight = Math.max(18, Math.min(28, radius * 0.17));
		const astronautWidth = astronautHeight * (astronautSprite.naturalWidth / astronautSprite.naturalHeight);
		context.imageSmoothingEnabled = false;
		context.drawImage(
			astronautSprite,
			moonX - radius * 0.22,
			moonY - radius - astronautHeight + 3,
			astronautWidth,
			astronautHeight,
		);
	}
	context.restore();
}

function drawSun(earthOpacity: number, sceneAltitude: number): void {
	const daylight = daylightFactor();
	if (earthOpacity <= 0.001 || daylight <= 0.01) return;

	const fogWeight =
		weatherWeight('fog') * (1 - smoothStep((sceneAltitude - 2000) / 1000));
	const sunVisibility = Math.max(0.3, 1 - weatherCloudCover / 100 * 0.48 - fogWeight * 0.34);
	const dayLength = ((sunsetMinutes - sunriseMinutes + 1440) % 1440);
	const elapsedSinceSunrise = ((environmentTimeMinutes - sunriseMinutes + 1440) % 1440);
	let dayProgress = 0.5;
	if (dayLength > 0) {
		if (elapsedSinceSunrise <= dayLength) {
			dayProgress = elapsedSinceSunrise / dayLength;
		} else {
			const timeAfterSunset = elapsedSinceSunrise - dayLength;
			const timeUntilSunrise = 1440 - elapsedSinceSunrise;
			dayProgress = timeAfterSunset <= timeUntilSunrise
				? 1 + Math.min(1, timeAfterSunset / dayLength)
				: -Math.min(1, timeUntilSunrise / dayLength);
		}
	}
	const sunElevation = dayLength > 0
		? Math.sin(dayProgress * Math.PI)
		: 0.78;
	const radius = Math.max(22, Math.min(31, width * 0.035));
	const horizon = height * 0.64 + sceneAltitude * SUN_PARALLAX;
	const sunX = width * 0.74;
	const sunY = horizon + radius - sunElevation * (height * 0.48 + radius);
	const visibility = daylight * sunVisibility;
	if (sunY < -radius * 2 || sunY > height + radius * 2) return;

	context.save();
	context.globalAlpha *= earthOpacity;
	const glow = context.createRadialGradient(sunX, sunY, 2, sunX, sunY, width * 0.46);
	glow.addColorStop(0, `rgba(255, 170, 104, ${0.34 * visibility})`);
	glow.addColorStop(0.35, `rgba(255, 170, 104, ${0.12 * visibility})`);
	glow.addColorStop(1, 'rgba(255, 170, 104, 0)');
	context.fillStyle = glow;
	context.fillRect(0, 0, width, height);
	context.shadowColor = `rgba(255, 166, 90, ${0.8 * visibility})`;
	context.shadowBlur = 26 * visibility;
	context.fillStyle = `rgba(255, 196, 119, ${visibility})`;
	context.beginPath();
	context.arc(sunX, sunY, radius, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawEarthWeather(earthOpacity: number, sceneAltitude: number): void {
	if (earthOpacity <= 0.001) return;
	context.save();
	context.globalAlpha *= earthOpacity;
	const earthAlpha = context.globalAlpha;

	const snowWeight = combinedWeatherWeight(['snow', 'snow-grains', 'snow-showers']);
	const fogWeight = weatherWeight('fog');
	const fogAltitudeFade = 1 - smoothStep((sceneAltitude - 2000) / 1000);
	const visibleFogWeight = fogWeight * fogAltitudeFade;
	const stormWeight = combinedWeatherWeight(['thunderstorm', 'hail']);
	const daylight = daylightFactor();

	const daylightCloudColor = mixColor('#34415c', '#ffffff', 0.22 + daylight * 0.78);
	const stormCloudWeight = combinedWeatherWeight(['rain', 'freezing-rain', 'thunderstorm', 'hail']);
	let cloudColor = mixColor(daylightCloudColor, '#687582', stormCloudWeight * 0.76);
	cloudColor = mixColor(cloudColor, '#cddce5', snowWeight * 0.3);
	cloudColor = mixColor(cloudColor, '#e5eef0', visibleFogWeight * 0.2);
	const cloudCover = sceneAltitude >= WEATHER_CLOUD_START_ALTITUDE
		? Math.min(1, weatherCloudCover / 100)
		: 0;
	for (const [index, cloud] of weatherClouds.entries()) {
		if (sceneAltitude < cloud.worldAltitude) continue;
		const x = ((cloud.x + elapsedTime * cloud.drift + width) % (width + 180)) - 90;
		const y = -75 * cloud.scale +
			(sceneAltitude - cloud.worldAltitude) * 0.34 +
			Math.sin(elapsedTime * 0.16 + cloud.phase) * 10;
		if (y < -75 * cloud.scale || y > height + 75 * cloud.scale) continue;
		const alpha = cloudCover * cloud.opacity * (0.73 + (index % 4) * 0.06);
		if (alpha > 0.015) drawCloud(x, y, cloud.scale, alpha, cloudColor);
	}

	for (const fogBank of fogBanks) {
		const x = ((fogBank.x + elapsedTime * fogBank.drift + width) % (width + 240)) - 120;
		const y = height * 0.55 +
			(sceneAltitude - fogBank.worldAltitude) * 0.34 +
			Math.sin(elapsedTime * 0.09 + fogBank.phase) * 14;
		const radius = fogBank.radius * (0.86 + Math.sin(elapsedTime * 0.12 + fogBank.phase) * 0.12);
		if (
			visibleFogWeight < 0.002 ||
			y < -radius ||
			y > height + radius
		) continue;
		const fog = context.createRadialGradient(x, y, radius * 0.04, x, y, radius);
		fog.addColorStop(0, `rgba(230, 242, 245, ${0.38 * fogBank.opacity})`);
		fog.addColorStop(0.42, `rgba(230, 242, 245, ${0.24 * fogBank.opacity})`);
		fog.addColorStop(1, 'rgba(220, 233, 237, 0)');
		context.save();
		context.globalAlpha *= visibleFogWeight;
		context.fillStyle = fog;
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
		context.restore();
	}

	const precipitation: Array<{
		kind: WeatherKind;
		count: number;
		length: number;
		speed: number;
		color: string;
		lineWidth: number;
		seed: number;
	}> = [
		{ kind: 'drizzle', count: 42, length: 7, speed: 82, color: 'rgba(240, 248, 255, 0.42)', lineWidth: 0.8, seed: 0 },
		{ kind: 'freezing-drizzle', count: 42, length: 7, speed: 80, color: 'rgba(210, 237, 255, 0.58)', lineWidth: 0.8, seed: 100 },
		{ kind: 'rain', count: 88, length: 14, speed: 145, color: 'rgba(240, 248, 255, 0.52)', lineWidth: 1.2, seed: 200 },
		{ kind: 'freezing-rain', count: 88, length: 14, speed: 140, color: 'rgba(210, 237, 255, 0.62)', lineWidth: 1.2, seed: 300 },
		{ kind: 'rain-showers', count: 88, length: 15, speed: 165, color: 'rgba(240, 248, 255, 0.58)', lineWidth: 1.2, seed: 400 },
		{ kind: 'thunderstorm', count: 96, length: 16, speed: 180, color: 'rgba(229, 239, 255, 0.62)', lineWidth: 1.3, seed: 500 },
		{ kind: 'hail', count: 60, length: 12, speed: 165, color: 'rgba(225, 244, 255, 0.68)', lineWidth: 1.3, seed: 600 },
	];
	for (const effect of precipitation) {
		const opacity = weatherWeight(effect.kind);
		if (opacity < 0.001) continue;
		context.save();
		context.strokeStyle = effect.color;
		context.lineCap = 'round';
		for (let index = 0; index < effect.count; index += 1) {
			const seed = index + effect.seed;
			const speed = effect.speed * (0.7 + weatherRandom(seed, 1) * 0.65);
			const length = effect.length * (0.55 + weatherRandom(seed, 2) * 1.1);
			const wind = (0.15 + weatherRandom(seed, 3) * 0.42) * (weatherRandom(seed, 4) < 0.32 ? -1 : 1);
			const x = ((weatherRandom(seed, 5) * width + elapsedTime * speed * wind) % width + width) % width;
			const y = (weatherRandom(seed, 6) * (height + length * 2) + elapsedTime * speed) %
				(height + length * 2) - length;
			context.globalAlpha = earthAlpha * opacity * (0.45 + weatherRandom(seed, 7) * 0.55);
			context.lineWidth = effect.lineWidth * (0.6 + weatherRandom(seed, 8) * 0.8);
			context.beginPath();
			context.moveTo(x - length * wind, y - length);
			context.lineTo(x, y);
			context.stroke();
		}
		context.restore();
	}

	for (const effect of [
		{ kind: 'snow' as const, count: 48, speed: 38, radius: 2 },
		{ kind: 'snow-grains' as const, count: 34, speed: 22, radius: 1.1 },
		{ kind: 'snow-showers' as const, count: 48, speed: 48, radius: 2.2 },
	]) {
		const opacity = weatherWeight(effect.kind);
		if (opacity < 0.001) continue;
		context.save();
		context.globalAlpha *= opacity;
		context.fillStyle = 'rgba(255, 255, 255, 0.86)';
		for (let index = 0; index < effect.count; index += 1) {
			const x = (index * 73 + 17 + Math.sin(elapsedTime + index) * 9) % Math.max(width, 1);
			const y = (index * 59 + 20 + elapsedTime * effect.speed) % Math.max(height, 1);
			context.beginPath();
			context.arc(x, y, effect.radius + (effect.kind === 'snow' ? index % 3 * 0.35 : 0), 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
	}

	const hailWeight = weatherWeight('hail');
	if (hailWeight > 0.001) {
		context.save();
		context.globalAlpha *= hailWeight;
		context.fillStyle = 'rgba(238, 248, 255, 0.9)';
		for (let index = 0; index < 19; index += 1) {
			const x = (index * 97 + 23) % Math.max(width, 1);
			const y = (index * 67 + 13 + elapsedTime * 115) % Math.max(height, 1);
			context.beginPath();
			context.arc(x, y, 2 + index % 3, 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
	}

	const flashPhase = elapsedTime % 8.5;
	const flashPulse = (center: number, halfWidth: number) =>
		1 - smoothStep(Math.abs(flashPhase - center) / halfWidth);
	const lightning = Math.max(flashPulse(0.18, 0.09), flashPulse(0.34, 0.07));
	if (stormWeight > 0.001 && lightning > 0) {
		context.fillStyle = `rgba(226, 236, 255, ${0.48 * stormWeight * lightning})`;
		context.fillRect(0, 0, width, height);
	}
	context.restore();
}

function drawBackground(sceneAltitude: number): void {
	const stageIndex = getCourseStageIndex(sceneAltitude);
	const stage = COURSE_STAGES[stageIndex];
	let skyBlend = getCourseStageBlend(sceneAltitude);
	if (stageIndex === 0 && sceneAltitude >= STAGE_RAW_HEIGHT * 0.42) {
		skyBlend = {
			from: 0,
			to: 1,
			amount: 0.5 * smoothStep(
				(sceneAltitude - STAGE_RAW_HEIGHT * 0.42) / (STAGE_RAW_HEIGHT * 0.58),
			),
		};
	}
	const daylight = daylightFactor();
	const twilightDistance = Math.min(
		Math.abs(shortestTimeDelta(sunriseMinutes, environmentTimeMinutes)),
		Math.abs(shortestTimeDelta(sunsetMinutes, environmentTimeMinutes)),
	);
	const twilight = 1 - Math.min(twilightDistance / 110, 1);
	const rainWeight = combinedWeatherWeight([
		'drizzle', 'freezing-drizzle', 'rain', 'freezing-rain', 'rain-showers', 'thunderstorm', 'hail',
	]);
	const snowWeight = combinedWeatherWeight(['snow', 'snow-grains', 'snow-showers']);
	const earthSkyColor = (color: string, top: boolean): string => {
		const nightColor = top ? '#101a36' : '#182744';
		const overcastColor = top ? '#69788d' : '#68788c';
		let adjusted = mixColor(nightColor, color, daylight);
		adjusted = mixColor(adjusted, overcastColor, weatherCloudCover / 100 * 0.28 + rainWeight * 0.08);
		adjusted = mixColor(adjusted, '#e4eef2', snowWeight * 0.12);
		return mixColor(adjusted, top ? '#d38b91' : '#f1ad8a', twilight * (top ? 0.48 : 0.56));
	};
	const stageSkyColor = (stageIndex: number, top: boolean): string => {
		const color = top ? COURSE_STAGES[stageIndex].skyTop : COURSE_STAGES[stageIndex].skyBottom;
		return stageIndex === 0 ? earthSkyColor(color, top) : color;
	};
	const atmosphereTop = mixColor(
		stageSkyColor(skyBlend.from, true),
		stageSkyColor(skyBlend.to, true),
		skyBlend.amount,
	);
	const atmosphereBottom = mixColor(
		stageSkyColor(skyBlend.from, false),
		stageSkyColor(skyBlend.to, false),
		skyBlend.amount,
	);
	const earthVisibility = (skyBlend.from === 0 ? 1 - skyBlend.amount : 0) +
		(skyBlend.to === 0 ? skyBlend.amount : 0);
	const gradient = context.createLinearGradient(0, 0, 0, height);
	const skyTop = atmosphereTop;
	const skyBottom = atmosphereBottom;
	gradient.addColorStop(0, skyTop);
	gradient.addColorStop(1, skyBottom);
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);

	drawRegionalBackdrop(sceneAltitude);
	drawSpaceGlow(sceneAltitude);
	drawMilkyWay(sceneAltitude);
	if (stageIndex !== 0 || daylight < 1) drawTwinklingStars(sceneAltitude);
	drawConstellations(sceneAltitude);
	for (const element of backgroundElements) {
		if (element.type === 'distantPlane' || element.type === 'star') {
			drawBackgroundElement(element, sceneAltitude, stageIndex);
		}
	}
	drawStageWorld(sceneAltitude);
	drawMoon(sceneAltitude);
	drawSun(earthVisibility, sceneAltitude);
	if (mountainLandscape.complete && mountainLandscape.naturalWidth > 0) {
		const landscapeWidth = width * 1.08;
		const landscapeHeight = landscapeWidth * (mountainLandscape.naturalHeight / mountainLandscape.naturalWidth);
		const landscapeY = -height * 0.02 + sceneAltitude * MOUNTAIN_PARALLAX;
		if (landscapeY < height && landscapeY + landscapeHeight > 0) {
			context.save();
			context.globalAlpha = 1;
			context.filter = 'none';
			context.drawImage(
				mountainLandscape,
				(width - landscapeWidth) / 2,
				landscapeY,
				landscapeWidth,
				landscapeHeight,
			);
			context.restore();
		}
	}
	drawEarthWeather(earthVisibility, sceneAltitude);

	for (const element of ambientElements) {
		const altitudeShift = sceneAltitude - (element.worldAltitude ?? sceneAltitude);
		const visualY = element.y + altitudeShift * 0.55;
		const margin = 60 * element.size + 10;
		if (
			element.x < -margin ||
			element.x > width + margin ||
			visualY < -margin ||
			visualY > height + margin
		) {
			continue;
		}
		drawAmbientElement({ ...element, y: visualY });
	}

	for (const element of backgroundElements) {
		if (element.type !== 'distantPlane' && element.type !== 'star') {
			drawBackgroundElement(element, sceneAltitude, stageIndex);
		}
	}

	drawGroundGrass(sceneAltitude);
	const displayedAltitude = mode === 'playing' || mode === 'won' ? altitude : 0;
	const displayedMeters = mode === 'won'
		? COURSE_MAX_METERS
		: mode === 'playing'
			? climbScoreAtAltitude(displayedAltitude)
			: Math.max(0, Math.min(COURSE_MAX_METERS, Math.floor(displayedAltitude / 10)));
	altitudeMeterFill.style.height = `${displayedMeters / COURSE_MAX_METERS * 100}%`;
	altitudeMeterFill.style.backgroundColor = stage.islandAccent;
	altitudeMeter.setAttribute('aria-valuenow', `${displayedMeters}`);
	altitudeMeter.setAttribute('aria-valuetext', `${displayedMeters.toLocaleString()} meters`);
	currentZone.textContent = stage.name;
}

function drawRegionalBackdrop(sceneAltitude: number): void {
	const blend = getCourseStageBlend(sceneAltitude);
	drawRegionalBackdropLayer(blend.from, 1 - blend.amount, sceneAltitude);
	if (blend.to !== blend.from) {
		drawRegionalBackdropLayer(blend.to, blend.amount, sceneAltitude);
	}
}

function drawRegionalBackdropLayer(
	stageIndex: number,
	opacity: number,
	sceneAltitude: number,
): void {
	context.save();
	context.globalAlpha *= opacity;
	const layerAlpha = context.globalAlpha;
	if (stageIndex === 1) {
		drawNebulaCloud(width * 0.78, height * 0.25, width * 0.58, '88, 130, 211', 0.13);
	} else if (stageIndex === 2) {
		drawNebulaCloud(width * 0.28, height * 0.42, width * 0.72, '174, 74, 61', 0.16);
		drawNebulaCloud(width * 0.82, height * 0.76, width * 0.45, '194, 103, 74', 0.1);
	} else if (stageIndex === 3) {
		drawNebulaCloud(width * 0.68, height * 0.32, width * 0.7, '203, 143, 104', 0.14);
		drawNebulaCloud(width * 0.12, height * 0.78, width * 0.5, '97, 72, 139', 0.1);
	} else if (stageIndex === 4) {
		drawNebulaCloud(width * 0.2, height * 0.26, width * 0.56, '217, 190, 139', 0.1);
	} else if (stageIndex === 5) {
		drawNebulaCloud(width * 0.58, height * 0.45, width * 0.68, '77, 169, 187', 0.1);
		for (let curtain = 0; curtain < 4; curtain += 1) {
			const x = width * (0.12 + curtain * 0.25);
			context.strokeStyle = curtain % 2 === 0 ? 'rgba(151, 255, 228, 0.16)' : 'rgba(149, 208, 255, 0.13)';
			context.lineWidth = width * 0.035;
			context.beginPath();
			context.moveTo(x, 0);
			context.bezierCurveTo(x - 35, height * 0.28, x + 45, height * 0.62, x + 8, height);
			context.stroke();
		}
	} else if (stageIndex === 6) {
		drawNebulaCloud(width * 0.74, height * 0.35, width * 0.72, '46, 91, 190', 0.17);
		drawNebulaCloud(width * 0.18, height * 0.8, width * 0.54, '69, 121, 217', 0.1);
	} else if (stageIndex === 7) {
		const beltHaze = context.createLinearGradient(0, height * 0.22, 0, height * 0.78);
		beltHaze.addColorStop(0, 'rgba(71, 82, 102, 0)');
		beltHaze.addColorStop(0.3, 'rgba(83, 89, 104, 0.08)');
		beltHaze.addColorStop(0.52, 'rgba(111, 102, 100, 0.22)');
		beltHaze.addColorStop(0.72, 'rgba(67, 76, 93, 0.1)');
		beltHaze.addColorStop(1, 'rgba(44, 54, 73, 0)');
		context.fillStyle = beltHaze;
		context.fillRect(0, 0, width, height);
		for (let body = 0; body < 150; body += 1) {
			const x = constellationRandom(body + 300, 1) * width;
			const centeredSpread = (constellationRandom(body + 300, 2) + constellationRandom(body + 300, 3) - 1) * 0.34;
			const y = height * (0.5 + centeredSpread);
			const size = 0.35 + constellationRandom(body + 300, 4) * 1.75;
			context.globalAlpha = layerAlpha * (0.34 + constellationRandom(body + 300, 5) * 0.38);
			context.fillStyle = body % 4 === 0 ? '#c4b9a7' : '#aeb8c6';
			context.beginPath();
			context.arc(x, y, size, 0, Math.PI * 2);
			context.fill();
		}
		context.globalAlpha = layerAlpha;
		for (let body = 0; body < 10; body += 1) {
			const x = width * (0.08 + constellationRandom(body + 500, 1) * 0.84);
			const y = height * (0.34 + constellationRandom(body + 500, 2) * 0.32);
			const radius = body < 2
				? width * (0.055 + constellationRandom(body + 500, 3) * 0.035)
				: body < 6
					? 7 + constellationRandom(body + 500, 3) * 7
					: 3 + constellationRandom(body + 500, 3) * 4;
			drawTexturedPlanetesimal(x, y, radius, body + 500, 'kuiper', sceneAltitude);
		}
	} else if (stageIndex === 8) {
		context.fillStyle = 'rgba(1, 3, 9, 0.52)';
		context.fillRect(0, 0, width, height);
		for (let star = 0; star < 64; star += 1) {
			const x = constellationRandom(star + 800, 1) * width;
			const y = constellationRandom(star + 800, 2) * height +
				sceneAltitude * STARFIELD_PARALLAX;
			const size = 0.3 + constellationRandom(star + 800, 3) * 0.75;
			context.globalAlpha = layerAlpha * (0.18 + constellationRandom(star + 800, 4) * 0.38);
			context.fillStyle = star % 5 === 0 ? '#dce6f1' : '#aebacc';
			context.beginPath();
			context.arc(x, y, size, 0, Math.PI * 2);
			context.fill();
		}
		context.globalAlpha = layerAlpha;
		const sunX = width * 0.18;
		const sunY = height * 0.28;
		context.shadowColor = '#f6eedb';
		context.shadowBlur = 9;
		context.strokeStyle = 'rgba(246, 238, 219, 0.42)';
		context.lineWidth = 0.8;
		context.beginPath();
		context.moveTo(sunX - 7, sunY);
		context.lineTo(sunX + 7, sunY);
		context.moveTo(sunX, sunY - 7);
		context.lineTo(sunX, sunY + 7);
		context.stroke();
		context.fillStyle = '#fffdf2';
		context.beginPath();
		context.arc(sunX, sunY, 1.7, 0, Math.PI * 2);
		context.fill();
		context.shadowBlur = 0;
		for (let body = 0; body < 7; body += 1) {
			const x = width * (0.08 + constellationRandom(body + 900, 1) * 0.84);
			const y = height * (0.12 + constellationRandom(body + 900, 2) * 0.76);
			const radius = body < 2
				? 12 + constellationRandom(body + 900, 3) * 8
				: 4 + constellationRandom(body + 900, 3) * 8;
			drawTexturedPlanetesimal(x, y, radius, body + 900, 'oort', sceneAltitude);
		}
		context.globalAlpha = layerAlpha;
	} else if (stageIndex === 9) {
		drawInterstellarBackdrop(sceneAltitude);
	}
	context.restore();
}

function drawNebulaCloud(
	x: number,
	y: number,
	radius: number,
	color: string,
	opacity: number,
	targetContext: CanvasRenderingContext2D = context,
): void {
	targetContext.save();
	const glow = targetContext.createRadialGradient(x, y, 0, x, y, radius);
	glow.addColorStop(0, `rgba(${color}, ${opacity})`);
	glow.addColorStop(0.5, `rgba(${color}, ${opacity * 0.34})`);
	glow.addColorStop(1, `rgba(${color}, 0)`);
	targetContext.fillStyle = glow;
	targetContext.fillRect(0, 0, width, height);
	targetContext.restore();
}

function createInterstellarCloudGuide(
	startFraction: number,
	endFraction: number,
	seed: number,
): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	const phase = constellationRandom(seed, 1) * Math.PI * 2;
	const segmentCount = 48;
	const cloudForms = Array.from({ length: 8 }, (_, index) => ({
		center: 0.04 + constellationRandom(seed + index, 3) * 0.92,
		spread: 0.025 + constellationRandom(seed + index, 4) * 0.105,
		depth: (constellationRandom(seed + index, 5) - 0.5) * 0.12,
	}));

	for (let index = 0; index <= segmentCount; index += 1) {
		const across = index / segmentCount;
		const broadWave = Math.sin(across * Math.PI * 2 * 1.35 + phase) * 0.075;
		const fineWave = Math.sin(across * Math.PI * 2 * 4.2 + phase * 1.8) * 0.035;
		const brokenEdge = (constellationRandom(seed + index, 2) - 0.5) * 0.045;
		const sculptedForms = cloudForms.reduce(
			(total, form) =>
				total + form.depth * Math.exp(-Math.pow((across - form.center) / form.spread, 2)),
			0,
		);
		const fraction = Math.max(
			0.05,
			Math.min(
				0.98,
				startFraction + (endFraction - startFraction) * across +
					broadWave + fineWave + brokenEdge + sculptedForms,
			),
		);
		points.push({ x: width * across, y: height * fraction });
	}

	return points;
}

function getInterstellarCloudGuideY(points: Array<{ x: number; y: number }>, x: number): number {
	const pointIndex = Math.max(0, Math.min(points.length - 1, (x / width) * (points.length - 1)));
	const startIndex = Math.floor(pointIndex);
	const endIndex = Math.min(points.length - 1, startIndex + 1);
	const fraction = pointIndex - startIndex;
	return points[startIndex].y + (points[endIndex].y - points[startIndex].y) * fraction;
}

function drawInterstellarCloudLayer(
	targetContext: CanvasRenderingContext2D,
	points: Array<{ x: number; y: number }>,
	seed: number,
	palette: {
		plumes: string[];
	},
	textureStrength: number,
): void {
	const layerAlpha = targetContext.globalAlpha;
	targetContext.save();

	for (let plume = 0; plume < 96; plume += 1) {
		const plumeSeed = seed + plume * 7;
		const x = constellationRandom(plumeSeed, 3) * width;
		const guideY = getInterstellarCloudGuideY(points, x);
		const y = guideY + (constellationRandom(plumeSeed, 4) - 0.5) * height * 0.38;
		const radius = width * (0.025 + constellationRandom(plumeSeed, 5) * 0.13);
		const radiusY = height * (0.025 + constellationRandom(plumeSeed, 6) * 0.13);
		const color = palette.plumes[plume % palette.plumes.length];
		const rotation = (constellationRandom(plumeSeed, 7) - 0.5) * Math.PI;
		targetContext.save();
		targetContext.translate(x, y);
		targetContext.rotate(rotation);
		targetContext.scale(radius, radiusY);
		const glow = targetContext.createRadialGradient(0, 0, 0, 0, 0, 1);
		glow.addColorStop(0, `rgba(${color}, 0.48)`);
		glow.addColorStop(0.42, `rgba(${color}, 0.19)`);
		glow.addColorStop(1, `rgba(${color}, 0)`);
		targetContext.globalAlpha = layerAlpha * textureStrength * 0.8;
		targetContext.fillStyle = glow;
		targetContext.beginPath();
		targetContext.arc(0, 0, 1, 0, Math.PI * 2);
		targetContext.fill();
		targetContext.restore();
	}

	targetContext.restore();
}

function drawInterstellarDustLanes(
	targetContext: CanvasRenderingContext2D,
	seed: number,
	layerAlpha: number,
): void {
	targetContext.save();
	targetContext.lineCap = 'round';

	for (let lane = 0; lane < 23; lane += 1) {
		const laneSeed = seed + lane * 11;
		const startX = constellationRandom(laneSeed, 1) * width;
		const startY = height * (0.28 + constellationRandom(laneSeed, 2) * 0.67);
		const direction = constellationRandom(laneSeed, 3) < 0.5 ? -1 : 1;
		const span = width * (0.06 + constellationRandom(laneSeed, 4) * 0.28);
		const endX = startX + direction * span;
		const endY = startY + (constellationRandom(laneSeed, 5) - 0.5) * height * 0.24;
		const bendA = (constellationRandom(laneSeed, 6) - 0.5) * height * 0.15;
		const bendB = (constellationRandom(laneSeed, 7) - 0.5) * height * 0.15;

		targetContext.globalAlpha = layerAlpha * (0.035 + constellationRandom(laneSeed, 8) * 0.105);
		targetContext.strokeStyle = lane % 4 === 0 ? '#090919' : '#170d2a';
		targetContext.lineWidth = width * (0.001 + constellationRandom(laneSeed, 9) * 0.004);
		targetContext.beginPath();
		targetContext.moveTo(startX, startY);
		targetContext.bezierCurveTo(
			startX + direction * span * 0.3,
			startY + bendA,
			startX + direction * span * 0.68,
			endY + bendB,
			endX,
			endY,
		);
		targetContext.stroke();
	}
	targetContext.restore();
}

function drawInterstellarFilaments(
	targetContext: CanvasRenderingContext2D,
	seed: number,
	layerAlpha: number,
): void {
	const colors = ['157, 202, 255', '207, 153, 255', '122, 128, 255', '244, 183, 255'];
	targetContext.save();
	targetContext.lineCap = 'round';

	for (let filament = 0; filament < 140; filament += 1) {
		const filamentSeed = seed + filament * 13;
		const x = constellationRandom(filamentSeed, 1) * width;
		const y = height * (0.22 + constellationRandom(filamentSeed, 2) * 0.74);
		const length = width * (0.012 + constellationRandom(filamentSeed, 3) * 0.1);
		const direction = constellationRandom(filamentSeed, 4) < 0.5 ? -1 : 1;
		const sweep = direction * length * (0.38 + constellationRandom(filamentSeed, 9) * 0.9);
		const fall = (constellationRandom(filamentSeed, 8) - 0.5) * height * 0.24;

		targetContext.globalAlpha = layerAlpha * (0.04 + constellationRandom(filamentSeed, 5) * 0.16);
		targetContext.strokeStyle = `rgba(${colors[filament % colors.length]}, 1)`;
		targetContext.lineWidth = 0.25 + constellationRandom(filamentSeed, 6) * 0.7;
		targetContext.beginPath();
		targetContext.moveTo(x, y);
		targetContext.bezierCurveTo(
			x + sweep * 0.18,
			y + fall * 0.12,
			x + length * 0.42 + sweep,
			y + fall * 0.58,
			x + sweep,
			y + fall,
		);
		targetContext.stroke();
	}
	targetContext.restore();
}

function drawInterstellarDustGrains(
	targetContext: CanvasRenderingContext2D,
	seed: number,
	layerAlpha: number,
): void {
	const colors = ['#d5e6ff', '#bca9ff', '#f5c4ff', '#8c9bff', '#77d8ff'];
	targetContext.save();
	for (let grain = 0; grain < 560; grain += 1) {
		const grainSeed = seed + grain * 17;
		const alongArm = constellationRandom(grainSeed, 1);
		const x = alongArm * width;
		const armCenterY = height * (0.77 - alongArm * 0.45 + Math.sin(alongArm * Math.PI * 2) * 0.04);
		const y = grain % 5 === 0
			? height * constellationRandom(grainSeed, 2)
			: armCenterY + (constellationRandom(grainSeed, 2) - 0.5) * height * 0.42;
		const size = 0.25 + Math.pow(constellationRandom(grainSeed, 3), 2.1) * 2.1;
		targetContext.globalAlpha = layerAlpha * (0.07 + constellationRandom(grainSeed, 4) * 0.3);
		targetContext.fillStyle = colors[grain % colors.length];
		if (grain % 7 === 0) {
			targetContext.fillRect(x, y, size * 1.5, Math.max(0.35, size * 0.32));
		} else {
			targetContext.beginPath();
			targetContext.arc(x, y, size, 0, Math.PI * 2);
			targetContext.fill();
		}
	}
	targetContext.restore();
}

function drawInterstellarNebulaHighlights(
	targetContext: CanvasRenderingContext2D,
	seed: number,
	layerAlpha: number,
): void {
	targetContext.save();
	const bokehColors = ['112, 95, 255', '172, 102, 255', '238, 130, 255', '114, 186, 255', '246, 229, 255'];
	for (let shape = 0; shape < 96; shape += 1) {
		const shapeSeed = seed + shape * 19;
		const edge = constellationRandom(shapeSeed, 1) < 0.72;
		let x = constellationRandom(shapeSeed, 2) * width;
		let y = constellationRandom(shapeSeed, 3) * height;
		if (edge) {
			switch (Math.floor(constellationRandom(shapeSeed, 4) * 4)) {
				case 0:
					x = constellationRandom(shapeSeed, 5) * width;
					y = constellationRandom(shapeSeed, 6) * height * 0.16;
					break;
				case 1:
					x = constellationRandom(shapeSeed, 5) * width;
					y = height * (0.84 + constellationRandom(shapeSeed, 6) * 0.16);
					break;
				case 2:
					x = constellationRandom(shapeSeed, 5) * width * 0.12;
					y = constellationRandom(shapeSeed, 6) * height;
					break;
				default:
					x = width * (0.88 + constellationRandom(shapeSeed, 5) * 0.12);
					y = constellationRandom(shapeSeed, 6) * height;
			}
		}
		const radius = Math.min(width, height) * (0.003 + Math.pow(constellationRandom(shapeSeed, 7), 2.4) * 0.02);
		const color = bokehColors[shape % bokehColors.length];
		targetContext.globalAlpha = layerAlpha * (0.2 + constellationRandom(shapeSeed, 8) * 0.48);
		if (shape % 4 === 0) {
			targetContext.shadowColor = `rgba(${color}, 0.9)`;
			targetContext.shadowBlur = radius * 1.8;
		} else {
			targetContext.shadowBlur = 0;
		}
		targetContext.fillStyle = `rgba(${color}, 1)`;
		targetContext.beginPath();
		for (let vertex = 0; vertex < 6; vertex += 1) {
			const angle = Math.PI / 3 * vertex + Math.PI / 6;
			const vertexX = x + Math.cos(angle) * radius;
			const vertexY = y + Math.sin(angle) * radius;
			if (vertex === 0) targetContext.moveTo(vertexX, vertexY);
			else targetContext.lineTo(vertexX, vertexY);
		}
		targetContext.closePath();
		targetContext.fill();
	}
	targetContext.shadowBlur = 0;

	const clusters = [
		{ x: 0.22, y: 0.31, color: '108, 154, 255' },
		{ x: 0.43, y: 0.68, color: '110, 202, 255' },
		{ x: 0.68, y: 0.29, color: '220, 139, 255' },
		{ x: 0.79, y: 0.66, color: '193, 148, 255' },
		{ x: 0.49, y: 0.43, color: '145, 117, 255' },
	];
	for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
		const cluster = clusters[clusterIndex];
		const clusterSeed = seed + clusterIndex * 101;
		const centerX = width * (cluster.x + (constellationRandom(clusterSeed, 1) - 0.5) * 0.08);
		const centerY = height * (cluster.y + (constellationRandom(clusterSeed, 2) - 0.5) * 0.08);
		const radius = width * (0.09 + constellationRandom(clusterSeed, 3) * 0.055);
		const glow = targetContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
		glow.addColorStop(0, `rgba(${cluster.color}, 0.72)`);
		glow.addColorStop(0.22, `rgba(${cluster.color}, 0.36)`);
		glow.addColorStop(1, `rgba(${cluster.color}, 0)`);
		targetContext.globalAlpha = layerAlpha * 0.94;
		targetContext.fillStyle = glow;
		targetContext.beginPath();
		targetContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
		targetContext.fill();

		for (let star = 0; star < 110; star += 1) {
			const starSeed = clusterSeed + star * 13;
			const angle = constellationRandom(starSeed, 3) * Math.PI * 2;
			const distance = Math.pow(constellationRandom(starSeed, 4), 1.4) * radius;
			const starX = centerX + Math.cos(angle) * distance;
			const starY = centerY + Math.sin(angle) * distance * (height / width);
			const starSize = 0.2 + Math.pow(constellationRandom(starSeed, 5), 2.4) * 2;
			targetContext.globalAlpha = layerAlpha * (0.38 + constellationRandom(starSeed, 6) * 0.6);
			targetContext.fillStyle = star % 8 === 0 ? '#ffffff' : '#d8eeff';
			targetContext.beginPath();
			targetContext.arc(starX, starY, starSize, 0, Math.PI * 2);
			targetContext.fill();
		}

		targetContext.globalAlpha = layerAlpha;
		targetContext.shadowColor = `rgba(${cluster.color}, 1)`;
		targetContext.shadowBlur = 16;
		targetContext.fillStyle = '#ffffff';
		targetContext.beginPath();
		targetContext.arc(centerX, centerY, 1.6, 0, Math.PI * 2);
		targetContext.fill();
	}
	targetContext.restore();
}

function drawInterstellarStarfield(
	targetContext: CanvasRenderingContext2D,
	sceneAltitude: number,
	foreground: boolean,
	animate: boolean,
): void {
	const layerAlpha = targetContext.globalAlpha;
	const count = foreground ? 72 : 420;
	const altitudeShift = sceneAltitude * STARFIELD_PARALLAX;
	targetContext.save();
	for (let star = 0; star < count; star += 1) {
		const seed = star + (foreground ? 2100 : 1000);
		const x = constellationRandom(seed, 1) * width;
		const yFraction = foreground
			? constellationRandom(seed, 2)
			: Math.pow(constellationRandom(seed, 2), 1.15) * 0.9;
		const y = yFraction * height + altitudeShift;
		const size = foreground
			? 0.3 + constellationRandom(seed, 3) * 0.75
			: 0.22 + constellationRandom(seed, 3) * 0.82;
		const color = star % 19 === 0 ? '#f4ddff' : star % 7 === 0 ? '#8ccaff' : '#e9efff';
		const cloudDimmer = foreground && yFraction > 0.36 ? 0.34 : 1;
		const twinkle = animate
			? 0.68 + Math.abs(Math.sin(elapsedTime * 0.42 + constellationRandom(seed, 4) * 6.28)) * 0.32
			: 1;
		const alpha = (foreground ? 0.45 : yFraction < 0.52 ? 0.72 : 0.42) * cloudDimmer * twinkle;

		targetContext.globalAlpha = layerAlpha * alpha;
		targetContext.fillStyle = color;
		targetContext.beginPath();
		targetContext.arc(x, y, size, 0, Math.PI * 2);
		targetContext.fill();

		if (star % (foreground ? 31 : 43) === 0) {
			const spike = foreground ? 4 + size * 3 : 6 + size * 5;
			targetContext.save();
			targetContext.shadowColor = color;
			targetContext.shadowBlur = spike * 0.7;
			targetContext.globalAlpha *= 0.72;
			targetContext.lineWidth = 0.55;
			targetContext.strokeStyle = color;
			targetContext.beginPath();
			targetContext.moveTo(x - spike, y);
			targetContext.lineTo(x + spike, y);
			targetContext.moveTo(x, y - spike * 1.8);
			targetContext.lineTo(x, y + spike * 1.8);
			targetContext.moveTo(x - spike * 0.55, y - spike * 0.7);
			targetContext.lineTo(x + spike * 0.55, y + spike * 0.7);
			targetContext.stroke();
			targetContext.restore();
		}
	}
	targetContext.restore();
}

function renderInterstellarBaseTexture(targetContext: CanvasRenderingContext2D): void {
	const background = targetContext.createLinearGradient(0, 0, 0, height);
	background.addColorStop(0, '#04020e');
	background.addColorStop(0.34, '#0a051c');
	background.addColorStop(0.66, '#110620');
	background.addColorStop(1, '#05020e');
	targetContext.fillStyle = background;
	targetContext.fillRect(0, 0, width, height);
	drawNebulaCloud(width * 0.42, height * 0.43, width * 0.82, '67, 65, 221', 0.22, targetContext);
	drawNebulaCloud(width * 0.7, height * 0.58, width * 0.7, '170, 47, 196', 0.16, targetContext);
	drawNebulaCloud(width * 0.31, height * 0.74, width * 0.64, '45, 133, 255', 0.13, targetContext);
	const nebulaCore = targetContext.createRadialGradient(
		width * 0.52,
		height * 0.5,
		0,
		width * 0.52,
		height * 0.5,
		width * 0.58,
	);
	nebulaCore.addColorStop(0, 'rgba(126, 127, 255, 0.2)');
	nebulaCore.addColorStop(0.25, 'rgba(152, 73, 234, 0.19)');
	nebulaCore.addColorStop(0.56, 'rgba(204, 52, 184, 0.11)');
	nebulaCore.addColorStop(1, 'rgba(53, 62, 171, 0)');
	targetContext.globalAlpha = 0.75;
	targetContext.fillStyle = nebulaCore;
	targetContext.fillRect(0, 0, width, height);
	targetContext.globalAlpha = 1;
	drawInterstellarStarfield(
		targetContext,
		getCourseStageMidpointAltitude(9),
		false,
		false,
	);
}

function ensureInterstellarBaseTexture(): HTMLCanvasElement {
	const textureWidth = Math.max(1, Math.round(width * canvasPixelRatio));
	const textureHeight = Math.max(1, Math.round(height * canvasPixelRatio));
	if (
		interstellarBaseTexture?.width === textureWidth &&
		interstellarBaseTexture.height === textureHeight
	) {
		return interstellarBaseTexture;
	}

	const texture = document.createElement('canvas');
	texture.width = textureWidth;
	texture.height = textureHeight;
	const textureContext = texture.getContext('2d');
	if (!textureContext) throw new Error('The browser could not create the interstellar background cache.');
	textureContext.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
	renderInterstellarBaseTexture(textureContext);
	interstellarBaseTexture = texture;
	return texture;
}

function drawInterstellarBaseTexture(sceneAltitude: number): void {
	const texture = ensureInterstellarBaseTexture();
	const layerAlpha = context.globalAlpha;
	const offsetY =
		(sceneAltitude - getCourseStageMidpointAltitude(9)) * STARFIELD_PARALLAX;
	context.save();
	context.globalAlpha = layerAlpha;
	context.drawImage(texture, 0, offsetY, width, height);
	context.restore();
}

function ensureInterstellarForegroundStarTexture(): HTMLCanvasElement {
	const existing = interstellarForegroundStarTexture;
	const textureWidth = Math.max(1, Math.round(width * canvasPixelRatio));
	const textureHeight = Math.max(1, Math.round(height * canvasPixelRatio));
	if (existing?.width === textureWidth && existing.height === textureHeight) return existing;

	const texture = document.createElement('canvas');
	texture.width = textureWidth;
	texture.height = textureHeight;
	const textureContext = texture.getContext('2d');
	if (!textureContext) throw new Error('The browser could not create the interstellar star cache.');
	textureContext.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
	drawInterstellarStarfield(
		textureContext,
		getCourseStageMidpointAltitude(9),
		true,
		false,
	);

	interstellarForegroundStarTexture = texture;
	return texture;
}

function drawInterstellarForegroundStarTexture(sceneAltitude: number): void {
	const texture = ensureInterstellarForegroundStarTexture();
	const layerAlpha = context.globalAlpha;
	const offsetY =
		(sceneAltitude - getCourseStageMidpointAltitude(9)) * STARFIELD_PARALLAX;
	context.save();
	context.globalAlpha = layerAlpha;
	context.drawImage(texture, 0, offsetY, width, height);
	context.restore();
}

function drawInterstellarTwinkles(sceneAltitude: number, foreground: boolean): void {
	const layerAlpha = context.globalAlpha;
	const count = foreground ? 8 : 18;
	const seedOffset = foreground ? 8100 : 7100;
	const altitudeShift = sceneAltitude * STARFIELD_PARALLAX;
	context.save();
	for (let star = 0; star < count; star += 1) {
		const seed = seedOffset + star * 11;
		const x = constellationRandom(seed, 1) * width;
		const yFraction = foreground
			? constellationRandom(seed, 2)
			: Math.pow(constellationRandom(seed, 2), 1.15) * 0.9;
		const y = yFraction * height + altitudeShift;
		const size = 0.7 + constellationRandom(seed, 3) * 1.4;
		const phase = constellationRandom(seed, 4) * Math.PI * 2;
		const glow = 0.2 + Math.abs(Math.sin(elapsedTime * 0.7 + phase)) * 0.8;
		const color = star % 3 === 0 ? '#bca5ff' : '#e4f4ff';
		context.globalAlpha = layerAlpha * glow * (foreground ? 0.62 : 0.5);
		context.fillStyle = color;
		context.beginPath();
		context.arc(x, y, size, 0, Math.PI * 2);
		context.fill();

		if (star % 5 === 0) {
			context.globalAlpha *= 0.7;
			context.strokeStyle = color;
			context.lineWidth = 0.5;
			context.beginPath();
			context.moveTo(x - size * 2.4, y);
			context.lineTo(x + size * 2.4, y);
			context.moveTo(x, y - size * 2.4);
			context.lineTo(x, y + size * 2.4);
			context.stroke();
		}
	}
	context.restore();
}

function renderInterstellarNebulaTexture(targetContext: CanvasRenderingContext2D): void {
	const layerAlpha = targetContext.globalAlpha;
	targetContext.save();

	const distantCloudGuide = createInterstellarCloudGuide(0.8, 0.25, 1600);
	drawInterstellarCloudLayer(targetContext, distantCloudGuide, 1600, {
		plumes: ['50, 72, 208', '87, 61, 181', '112, 88, 218', '60, 119, 222'],
	}, 0.68);

	const mainCloudGuide = createInterstellarCloudGuide(0.79, 0.32, 2300);
	drawInterstellarCloudLayer(targetContext, mainCloudGuide, 2300, {
		plumes: ['75, 122, 255', '118, 87, 255', '173, 73, 229', '224, 97, 240', '91, 190, 255'],
	}, 1.05);

	const foregroundCloudGuide = createInterstellarCloudGuide(0.34, 0.76, 4800);
	drawInterstellarCloudLayer(targetContext, foregroundCloudGuide, 4800, {
		plumes: ['36, 56, 179', '100, 58, 181', '148, 55, 171', '47, 120, 220'],
	}, 0.5);

	drawInterstellarDustLanes(targetContext, 3100, layerAlpha);
	drawInterstellarFilaments(targetContext, 3700, layerAlpha);
	drawInterstellarDustGrains(targetContext, 4200, layerAlpha);
	drawInterstellarNebulaHighlights(targetContext, 4400, layerAlpha);
	const edgeFade = targetContext.createLinearGradient(0, 0, 0, height);
	edgeFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
	edgeFade.addColorStop(0.12, 'rgba(0, 0, 0, 1)');
	edgeFade.addColorStop(0.88, 'rgba(0, 0, 0, 1)');
	edgeFade.addColorStop(1, 'rgba(0, 0, 0, 0)');
	targetContext.globalCompositeOperation = 'destination-in';
	targetContext.globalAlpha = layerAlpha;
	targetContext.fillStyle = edgeFade;
	targetContext.fillRect(0, 0, width, height);
	targetContext.globalCompositeOperation = 'source-over';
	targetContext.restore();
}

function ensureInterstellarNebulaTexture(): HTMLCanvasElement {
	if (
		interstellarNebulaTexture &&
		interstellarNebulaTextureWidth === width &&
		interstellarNebulaTextureHeight === height &&
		interstellarNebulaTexturePixelRatio === canvasPixelRatio
	) {
		return interstellarNebulaTexture;
	}

	const texture = document.createElement('canvas');
	texture.width = Math.max(1, Math.round(width * canvasPixelRatio));
	texture.height = Math.max(1, Math.round(height * canvasPixelRatio));
	const textureContext = texture.getContext('2d');
	if (!textureContext) throw new Error('The browser could not create the interstellar scenery cache.');
	textureContext.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
	renderInterstellarNebulaTexture(textureContext);

	interstellarNebulaTexture = texture;
	interstellarNebulaTextureWidth = width;
	interstellarNebulaTextureHeight = height;
	interstellarNebulaTexturePixelRatio = canvasPixelRatio;
	return texture;
}

function drawInterstellarNebulaTexture(sceneAltitude: number): void {
	const texture = ensureInterstellarNebulaTexture();
	const layerAlpha = context.globalAlpha;
	const offsetX = Math.sin(elapsedTime * 0.022) * width * 0.009;
	const offsetY =
		(sceneAltitude - getCourseStageMidpointAltitude(9)) * 0.01 +
		Math.sin(elapsedTime * 0.028) * height * 0.003;
	context.save();
	context.globalAlpha = layerAlpha;
	context.drawImage(texture, offsetX, offsetY, width, height);
	context.restore();
}

function drawInterstellarBackdrop(sceneAltitude: number): void {
	drawInterstellarBaseTexture(sceneAltitude);
	drawInterstellarTwinkles(sceneAltitude, false);
	drawInterstellarNebulaTexture(sceneAltitude);
	drawInterstellarForegroundStarTexture(sceneAltitude);
	drawInterstellarTwinkles(sceneAltitude, true);
}

function drawTexturedPlanetesimal(
	x: number,
	y: number,
	radius: number,
	seed: number,
	region: 'kuiper' | 'oort',
	sceneAltitude: number,
): void {
	const surface = region === 'oort'
		? { light: '#7e8992', mid: '#46515d', dark: '#151d27', crater: '#0d141c' }
		: { light: '#c2b397', mid: '#716b63', dark: '#292e37', crater: '#20252c' };
	const phase = constellationRandom(seed, 2) * Math.PI * 2;
	const parallax = region === 'kuiper' ? KUIPER_PARALLAX : OORT_PARALLAX;
	const regionAltitude = getCourseStageMidpointAltitude(region === 'kuiper' ? 7 : 8);
	const driftX = Math.sin(elapsedTime * 0.075 + phase) * Math.min(14, Math.max(1.5, radius * 0.2));
	const oscillationY = Math.sin(elapsedTime * 0.16 + phase * 1.7) *
		Math.min(4, Math.max(0.8, radius * 0.07));
	const drawX = x + driftX;
	const drawY = y + (sceneAltitude - regionAltitude) * parallax + oscillationY;
	context.save();
	context.translate(drawX, drawY);
	context.rotate(
		constellationRandom(seed, 8) * Math.PI * 2 +
		Math.sin(elapsedTime * 0.11 + phase) * 0.025,
	);
	const shape = (): void => {
		context.beginPath();
		for (let point = 0; point < 11; point += 1) {
			const angle = point * Math.PI * 2 / 11;
			const roughness = 0.72 + constellationRandom(seed, point + 10) * 0.38;
			const px = Math.cos(angle) * radius * roughness;
			const py = Math.sin(angle) * radius * roughness * 0.78;
			if (point === 0) context.moveTo(px, py);
			else context.lineTo(px, py);
		}
		context.closePath();
	};
	const rock = context.createRadialGradient(
		-radius * 0.38,
		-radius * 0.42,
		radius * 0.06,
		0,
		0,
		radius * 1.3,
	);
	rock.addColorStop(0, surface.light);
	rock.addColorStop(0.42, surface.mid);
	rock.addColorStop(1, surface.dark);
	context.fillStyle = rock;
	context.strokeStyle = region === 'oort' ? 'rgba(168, 184, 198, 0.32)' : 'rgba(219, 202, 172, 0.55)';
	context.lineWidth = Math.max(0.5, radius * 0.045);
	shape();
	context.fill();
	context.stroke();
	shape();
	context.clip();
	for (let crater = 0; crater < 5; crater += 1) {
		const craterX = (constellationRandom(seed, crater + 30) - 0.5) * radius * 1.15;
		const craterY = (constellationRandom(seed, crater + 40) - 0.5) * radius * 0.8;
		const craterRadius = radius * (0.08 + constellationRandom(seed, crater + 50) * 0.12);
		context.fillStyle = surface.crater;
		context.beginPath();
		context.ellipse(craterX, craterY, craterRadius, craterRadius * 0.62, crater * 0.4, 0, Math.PI * 2);
		context.fill();
		context.strokeStyle = region === 'oort' ? 'rgba(163, 181, 194, 0.3)' : 'rgba(231, 217, 191, 0.55)';
		context.lineWidth = Math.max(0.4, radius * 0.025);
		context.beginPath();
		context.ellipse(craterX - craterRadius * 0.08, craterY - craterRadius * 0.06, craterRadius * 0.8, craterRadius * 0.48, crater * 0.4, Math.PI, Math.PI * 2);
		context.stroke();
	}
	for (let fleck = 0; fleck < 7; fleck += 1) {
		const fleckX = (constellationRandom(seed, fleck + 60) - 0.5) * radius * 1.2;
		const fleckY = (constellationRandom(seed, fleck + 70) - 0.5) * radius * 0.8;
		context.fillStyle = region === 'oort' ? 'rgba(199, 216, 229, 0.36)' : 'rgba(239, 226, 203, 0.48)';
		context.fillRect(fleckX, fleckY, Math.max(0.5, radius * 0.045), Math.max(0.5, radius * 0.045));
	}
	context.restore();

	if (region === 'oort') {
		const opacity = context.globalAlpha;
		context.save();
		for (let dust = 0; dust < 9; dust += 1) {
			const dustSeed = seed * 20 + dust;
			const angle = constellationRandom(dustSeed, 4) * Math.PI * 2;
			const distance = radius * (1.2 + constellationRandom(dustSeed, 5) * 1.4);
			const dustDrift = Math.sin(elapsedTime * 0.09 + phase + dust) * 1.6;
			context.globalAlpha = opacity * (0.22 + constellationRandom(dustSeed, 6) * 0.3);
			context.fillStyle = '#bcc7d2';
			context.fillRect(
				drawX + Math.cos(angle) * distance + dustDrift,
				drawY + Math.sin(angle) * distance,
				0.7,
				0.7,
			);
		}
		context.restore();
	}
}

function drawSpaceGlow(sceneAltitude: number): void {
	const moonWeight = getCourseStageWeight(sceneAltitude, 1);
	if (moonWeight <= 0) return;
	const glows = [
		{ x: width * 0.08, y: height * 0.18, radius: width * 0.62, color: '115, 145, 255' },
		{ x: width * 0.94, y: height * 0.64, radius: width * 0.72, color: '205, 103, 245' },
		{ x: width * 0.38, y: height * 1.05, radius: width * 0.58, color: '74, 211, 229' },
	];
	context.save();
	context.globalAlpha = moonWeight * 0.2;
	for (const glow of glows) {
		const gradient = context.createRadialGradient(
			glow.x,
			glow.y,
			0,
			glow.x,
			glow.y,
			glow.radius,
		);
		gradient.addColorStop(0, `rgba(${glow.color}, 0.28)`);
		gradient.addColorStop(0.45, `rgba(${glow.color}, 0.1)`);
		gradient.addColorStop(1, `rgba(${glow.color}, 0)`);
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);
	}
	context.restore();
}

function drawMilkyWay(sceneAltitude: number): void {
	const progress = Math.max(0, Math.min(1, (sceneAltitude - 70000) / 9000));
	if (progress <= 0) return;
	const oortWeight = getCourseStageWeight(sceneAltitude, 8);
	const interstellarWeight = getCourseStageWeight(sceneAltitude, 9);
	const opacity =
		(0.46 - oortWeight * 0.2) * (1 - interstellarWeight * 0.68) +
		interstellarWeight * 0.08;
	context.save();
	context.globalAlpha = progress * opacity;
	context.translate(width * 0.5, height * 0.5);
	context.rotate(-0.34);
	const band = context.createLinearGradient(0, -height * 0.2, 0, height * 0.2);
	band.addColorStop(0, 'rgba(180, 177, 255, 0)');
	band.addColorStop(0.25, 'rgba(196, 185, 255, 0.08)');
	band.addColorStop(0.48, 'rgba(225, 222, 255, 0.22)');
	band.addColorStop(0.58, 'rgba(176, 194, 255, 0.14)');
	band.addColorStop(1, 'rgba(143, 159, 235, 0)');
	context.fillStyle = band;
	context.fillRect(-width, -height * 0.28, width * 2, height * 0.56);
	const coreProgress = smoothStep((sceneAltitude - 90000) / 10000);
	if (coreProgress > 0) {
		context.globalAlpha = progress * coreProgress * opacity * 0.8;
		const core = context.createRadialGradient(0, 0, 0, 0, 0, width * 0.32);
		core.addColorStop(0, 'rgba(255, 244, 224, 0.72)');
		core.addColorStop(0.18, 'rgba(231, 217, 255, 0.36)');
		core.addColorStop(0.52, 'rgba(165, 174, 255, 0.12)');
		core.addColorStop(1, 'rgba(165, 174, 255, 0)');
		context.fillStyle = core;
		context.beginPath();
		context.ellipse(0, 0, width * 0.32, height * 0.13, 0, 0, Math.PI * 2);
		context.fill();
	}
	context.globalAlpha = progress * opacity;
	const dust = context.createLinearGradient(0, -height * 0.12, 0, height * 0.12);
	dust.addColorStop(0, 'rgba(31, 37, 77, 0)');
	dust.addColorStop(0.43, 'rgba(30, 36, 75, 0.12)');
	dust.addColorStop(0.55, 'rgba(30, 36, 75, 0.2)');
	dust.addColorStop(1, 'rgba(31, 37, 77, 0)');
	context.fillStyle = dust;
	context.fillRect(-width, -height * 0.16, width * 2, height * 0.32);
	for (let index = 0; index < 36; index += 1) {
		const x = ((index * 97) % Math.max(width * 2, 1)) - width;
		const y = Math.sin(index * 13.7) * height * 0.15;
		const radius = 0.7 + (index % 4) * 0.45;
		context.globalAlpha = progress * opacity * (0.15 + (index % 5) * 0.035);
		context.fillStyle = index % 3 === 0 ? '#ffdcb1' : '#f5f1ff';
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

function drawStageWorld(sceneAltitude: number): void {
	for (const world of PLANET_SCENERY) {
		const y = height * 0.42 + (sceneAltitude - world.altitude) * PLANET_PARALLAX;
		const radius = Math.min(world.radius, width * 0.3);
		if (y < -radius * 2 || y > height + radius * 2) continue;
		drawPlanetDisk(width * world.x, y, radius, world.appearance, elapsedTime * 0.12);
	}
}

function updateBackground(delta: number, sceneAltitude = altitude): void {
	elapsedTime += delta;
	const stageIndex = getCourseStageIndex(sceneAltitude);
	if (stageIndex !== backgroundStageIndex) {
		backgroundStageIndex = stageIndex;
		activateStageScenery(stageIndex);
		if (mode !== 'playing') {
			debrisHazard = null;
			nextDebrisAt = elapsedTime;
		}
	}
	if (mode !== 'playing' && stageIndex === 0) debrisHazard = null;
	if (
		stageIndex >= 1 &&
		stageIndex <= 9 &&
		!debrisHazard &&
		elapsedTime >= nextDebrisAt
	) {
		debrisHazard = createDebrisHazard(sceneAltitude);
		if (mode !== 'playing') nextDebrisAt = elapsedTime + 5 + Math.random() * 3;
	}
	if (
		stageIndex === 0 &&
		sceneAltitude >= PLANE_MIN_ALTITUDE &&
		sceneAltitude <= PLANE_MAX_ALTITUDE &&
		elapsedTime >= nextPlaneAt &&
		!backgroundElements.some((element) => element.type === 'plane')
	) {
		backgroundElements.push(
			createBackgroundElement('plane', -Math.max(48, height * 0.1), sceneAltitude),
		);
		nextPlaneAt = elapsedTime + 8 + Math.random() * 10;
	}
	if (
		stageIndex === 0 &&
		sceneAltitude >= PLANE_MIN_ALTITUDE &&
		sceneAltitude <= PLANE_MAX_ALTITUDE &&
		elapsedTime >= nextDistantPlaneAt &&
		!backgroundElements.some((element) => element.type === 'distantPlane')
	) {
		backgroundElements.push(
			createBackgroundElement('distantPlane', -Math.max(48, height * 0.1), sceneAltitude),
		);
		nextDistantPlaneAt = elapsedTime + 16 + Math.random() * 14;
	}
	for (let index = 0; index < backgroundElements.length; index += 1) {
		const element = backgroundElements[index];
		const isPlane = element.type === 'plane' || element.type === 'distantPlane';
		const altitudeShift = sceneAltitude - (element.worldAltitude ?? sceneAltitude);
		if (!isPlane && element.y + altitudeShift * element.parallax < -70) continue;
		for (const point of element.contrail) point.age += delta;
		element.contrail = element.contrail.filter(
			(point) =>
				point.age < CONTRAIL_LIFETIME &&
				(point.x >= -8 && point.x <= width + 8),
		);
		if (isPlane) {
			element.x += element.vx * delta;
			element.y += element.vy * delta;
			const tail = getPlaneTailPosition(element);
			element.contrail.push({
				x: tail.x,
				y: tail.y,
				age: 0,
			});
		} else {
			element.x += element.vx * delta;
			element.y += element.vy * delta;
		}
		if (isPlane) {
			const projectedY = element.y +
				(sceneAltitude - (element.worldAltitude ?? sceneAltitude)) * element.parallax;
			const planeMargin = Math.max(90 * element.size, 70);
			if (
				projectedY > height + planeMargin ||
				element.x < -planeMargin ||
				element.x > width + planeMargin
			) {
				backgroundElements.splice(index, 1);
				if (element.type === 'distantPlane') {
					nextDistantPlaneAt = elapsedTime + 16 + Math.random() * 14;
				} else {
					nextPlaneAt = elapsedTime + 8 + Math.random() * 10;
				}
				index -= 1;
				continue;
			}
		} else {
			const projectedY = element.y +
				(sceneAltitude - (element.worldAltitude ?? sceneAltitude)) * element.parallax;
			if (projectedY > height + 60) {
				backgroundElements.splice(index, 1);
				index -= 1;
				continue;
			}
			const margin = 48 * element.size;
			if (element.x < -margin) element.x = width + margin;
			else if (element.x > width + margin) element.x = -margin;
		}
	}
	for (let index = ambientElements.length - 1; index >= 0; index -= 1) {
		const element = ambientElements[index];
		const projectedBeforeMove = element.y +
			(sceneAltitude - (element.worldAltitude ?? sceneAltitude)) * 0.55;
		if (projectedBeforeMove < -70) continue;
		element.age += delta;
		element.x += element.vx * delta;
		element.rotation += delta * (element.type === 'frozenAsteroid' ? 0.22 : 0.05);
		element.y += element.vy * delta;
		if (element.type === 'bubble') {
			element.x = element.originX + Math.sin(element.age * 1.7 + element.phase) * 15;
		}
		const projectedY = element.y +
			(sceneAltitude - (element.worldAltitude ?? sceneAltitude)) * 0.55;
		if (
			element.x < -70 || element.x > width + 70 ||
			projectedY > height + 70
		) {
			ambientElements.splice(index, 1);
		}
	}
	if (debrisHazard) {
		debrisHazard.x += debrisHazard.vx * delta;
		debrisHazard.y += debrisHazard.vy * delta;
		debrisHazard.rotation += delta * 0.55;
		const projectedY = mode === 'playing'
			? debrisHazard.y
			: debrisHazard.y + sceneAltitude - debrisHazard.worldAltitude;
		if (
			debrisHazard.x < -debrisHazard.radius - 5 ||
			debrisHazard.x > width + debrisHazard.radius + 5 ||
			projectedY < -debrisHazard.radius - 5 ||
			projectedY > height + debrisHazard.radius + 5
		) {
			debrisHazard = null;
			nextDebrisAt = elapsedTime + 5 + Math.random() * 3;
		}
	}
}

function createDebrisHazard(worldAltitude = altitude): DebrisHazard {
	const edge = Math.floor(Math.random() * 4);
	const radius = 8 + Math.random() * 15;
	let x: number;
	let y: number;
	let angle: number;
	if (edge === 0) {
		x = -radius;
		y = Math.random() * height;
		angle = (Math.random() - 0.5) * Math.PI * 0.72;
	} else if (edge === 1) {
		x = width + radius;
		y = Math.random() * height;
		angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.72;
	} else if (edge === 2) {
		x = Math.random() * width;
		y = -radius;
		angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.72;
	} else {
		x = Math.random() * width;
		y = height + radius;
		angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.72;
	}
	const speed = 120 + Math.random() * 180;
	return {
		x,
		y,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		radius,
		rotation: Math.random() * Math.PI * 2,
		worldAltitude,
	};
}

function drawDebrisHazard(sceneAltitude = altitude): void {
	if (!debrisHazard) return;
	const { x, radius } = debrisHazard;
	const y = debrisHazard.y +
		(mode === 'playing' ? 0 : sceneAltitude - debrisHazard.worldAltitude);
	context.save();
	context.translate(x, y);
	context.rotate(debrisHazard.rotation);
	context.fillStyle = '#8f8c84';
	context.strokeStyle = '#d0c4ad';
	context.lineWidth = 1;
	context.beginPath();
	for (let vertex = 0; vertex < 9; vertex += 1) {
		const angle = vertex * Math.PI * 2 / 9;
		const size = radius * (vertex % 2 === 0 ? 1 : 0.73);
		const px = Math.cos(angle) * size;
		const py = Math.sin(angle) * size;
		if (vertex === 0) context.moveTo(px, py);
		else context.lineTo(px, py);
	}
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = 'rgba(60, 54, 48, 0.55)';
	context.beginPath();
	context.arc(-radius * 0.28, -radius * 0.1, radius * 0.18, 0, Math.PI * 2);
	context.arc(radius * 0.34, radius * 0.25, radius * 0.13, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawPlatform(platform: Platform): void {
	if (platform.summit) {
		drawSummitPlatform(platform);
		return;
	}
	const opacity = platform.nebula ? platform.opacity ?? 1 : 1;
	if (opacity <= 0.02) return;
	context.save();
	context.globalAlpha *= opacity;
	if (!platform.falling) {
		drawPlatformPiece(platform);
		context.restore();
		return;
	}

	for (const side of [-1, 1]) {
		context.save();
		const centerX = platform.x + platform.width / 2;
		context.beginPath();
		context.rect(
			side < 0 ? platform.x - 2 : centerX + 2,
			platform.y - 10,
			platform.width / 2,
			60,
		);
		context.clip();
		context.translate(side * platform.breakAmount * platform.width * 0.23, platform.breakAmount * 18);
		context.translate(centerX, platform.y);
		context.rotate(side * platform.breakAmount * 0.09);
		context.translate(-centerX, -platform.y);
		drawPlatformPiece(platform);
		context.restore();
	}
	context.restore();
}

function drawSummitPlatform(platform: Platform): void {
	context.save();
	if (summitIceberg.complete && summitIceberg.naturalWidth > 0) {
		const bounds = summitImageBounds(platform);
		context.drawImage(summitIceberg, bounds.x, bounds.y, bounds.width, bounds.height);
	}
	context.restore();
}

type SummitSnowflake = {
	x: number;
	y: number;
	speed: number;
	radius: number;
	opacity: number;
	drift: number;
	phase: number;
	hasTrail: boolean;
};

function createSummitSnowflakes(count: number): SummitSnowflake[] {
	let seed = 73129;
	const random = (): number => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 0x100000000;
	};
	const flakes: SummitSnowflake[] = [];

	while (flakes.length < count) {
		let x = random();
		let y = random();
		let spaced = false;
		for (let attempt = 0; attempt < 500; attempt += 1) {
			x = random();
			y = random();
			spaced = flakes.every((flake) => {
				const dx = (x - flake.x) * 750;
				const dy = (y - flake.y) * 1200;
				return dx * dx + dy * dy >= 42 * 42;
			});
			if (spaced) break;
		}

		flakes.push({
			x,
			y,
			speed: 45 + random() * 65,
			radius: 0.7 + random() * 1.3,
			opacity: 0.45 + random() * 0.5,
			drift: 3 + random() * 9,
			phase: random() * Math.PI * 2,
			hasTrail: random() < 0.28,
		});
	}

	return flakes;
}

const summitSnowflakes = createSummitSnowflakes(88);

function drawSummitSnow(platform: Platform): void {
	const snowHeight = Math.max(0, Math.min(height, platform.y));
	if (snowHeight <= 0 || platform.width <= 0) return;
	context.save();
	context.beginPath();
	context.rect(platform.x, 0, platform.width, snowHeight);
	context.clip();

	for (const flake of summitSnowflakes) {
		const x = platform.x + 5 + flake.x * (platform.width - 10) +
			Math.sin(elapsedTime * 0.7 + flake.phase) * flake.drift;
		const y = platform.y - 1200 + ((elapsedTime * flake.speed + flake.y * 1200) % 1200);
		context.globalAlpha = flake.opacity;
		context.fillStyle = '#ffffff';
		context.beginPath();
		context.arc(x, y, flake.radius, 0, Math.PI * 2);
		context.fill();
		if (flake.hasTrail) {
			context.globalAlpha *= 0.7;
			context.strokeStyle = '#f4fdff';
			context.lineWidth = 0.8;
			context.beginPath();
			context.moveTo(x, y + flake.radius);
			context.lineTo(x - 0.5, y + flake.radius + 3);
			context.stroke();
		}
	}
	context.restore();
}

function summitImageBounds(platform: Platform): { x: number; y: number; width: number; height: number } {
	const imageWidth = platform.width / (394 / 560);
	const imageHeight = imageWidth * 300 / 560;
	return {
		x: platform.x - imageWidth * (84 / 560),
		y: platform.y - imageHeight * (88 / 300),
		width: imageWidth,
		height: imageHeight,
	};
}

function drawSummitFish(): void {
	const fishSprite = penguinSprites.fish;
	if (!fishSprite.complete || fishSprite.naturalWidth === 0) return;
	const fishWidth = Math.min(24, Math.max(17, width * 0.035));
	const fishHeight = fishWidth * fishSprite.naturalHeight / fishSprite.naturalWidth;
	for (const fish of summitFish) {
		const x = fish.platform.x + fish.offsetX;
		const y = fish.platform.y + fish.offsetY +
			Math.sin(elapsedTime * 3 + fish.phase) * 1.5;
		context.save();
		context.shadowColor = 'rgba(255, 232, 147, 0.9)';
		context.shadowBlur = 5;
		context.drawImage(fishSprite, x - fishWidth / 2, y - fishHeight / 2, fishWidth, fishHeight);
		context.restore();
	}
}

function drawSummitHearts(): void {
	for (const heart of summitHeartParticles) {
		const progress = heart.age / heart.lifetime;
		const alpha = Math.max(0, 1 - progress);
		context.save();
		context.globalAlpha = alpha;
		context.translate(heart.x, heart.y);
		context.rotate(Math.sin(heart.age * 5) * 0.18);
		context.fillStyle = '#ff74aa';
		context.shadowColor = '#ff9fc3';
		context.shadowBlur = 5;
		context.beginPath();
		context.moveTo(0, heart.size * 0.35);
		context.bezierCurveTo(-heart.size * 1.25, -heart.size * 0.35, -heart.size * 0.5, -heart.size * 1.05, 0, -heart.size * 0.45);
		context.bezierCurveTo(heart.size * 0.5, -heart.size * 1.05, heart.size * 1.25, -heart.size * 0.35, 0, heart.size * 0.35);
		context.fill();
		context.restore();
	}
}

function drawSummitParticles(): void {
	for (const particle of summitParticles) {
		const progress = particle.age / particle.lifetime;
		const alpha = Math.max(0, 1 - progress);
		context.save();
		context.globalAlpha = alpha;
		context.translate(particle.x, particle.y);
		context.rotate(progress * 5);
		context.fillStyle = particle.color;
		context.shadowColor = particle.color;
		context.shadowBlur = 9;
		context.beginPath();
		context.moveTo(0, -particle.size);
		context.lineTo(particle.size * 0.32, -particle.size * 0.32);
		context.lineTo(particle.size, 0);
		context.lineTo(particle.size * 0.32, particle.size * 0.32);
		context.lineTo(0, particle.size);
		context.lineTo(-particle.size * 0.32, particle.size * 0.32);
		context.lineTo(-particle.size, 0);
		context.lineTo(-particle.size * 0.32, -particle.size * 0.32);
		context.closePath();
		context.fill();
		context.restore();
	}
}

function drawPlatformPiece(platform: Platform): void {
	const platformAltitude =
		height -
		GROUND_SURFACE -
		platform.y +
		(mode === 'playing' || mode === 'won' ? altitude : 0);
	const stageIndex = getCourseStageIndex(platformAltitude);
	const stage = COURSE_STAGES[stageIndex];
	const topColor = stageIndex === 0
		? mixColor(
				stage.islandTop,
				'#ffffff',
				combinedWeatherWeight(['snow', 'snow-grains', 'snow-showers']),
			)
		: stage.islandTop;
	const baseColor = stage.islandBase;
	const accentColor = stage.islandAccent;
	const heightBelow = platform.cracked ? 25 : 21;
	context.save();
	context.shadowColor = 'rgba(27, 85, 108, 0.2)';
	context.shadowBlur = 9;
	context.shadowOffsetY = 5;
	context.beginPath();
	context.moveTo(platform.x + 4, platform.y + 4);
	context.quadraticCurveTo(platform.x + platform.width * 0.18, platform.y - 3, platform.x + platform.width * 0.48, platform.y);
	context.quadraticCurveTo(platform.x + platform.width * 0.78, platform.y - 4, platform.x + platform.width - 3, platform.y + 3);
	context.lineTo(platform.x + platform.width - 8, platform.y + heightBelow);
	context.lineTo(platform.x + platform.width * 0.73, platform.y + heightBelow - 3);
	context.lineTo(platform.x + platform.width * 0.52, platform.y + heightBelow + 4);
	context.lineTo(platform.x + platform.width * 0.31, platform.y + heightBelow - 1);
	context.lineTo(platform.x + 7, platform.y + heightBelow + 2);
	context.closePath();
	context.fillStyle = platform.nebula ? mixColor(baseColor, '#b59df2', 0.35) : baseColor;
	context.fill();
	context.shadowColor = 'transparent';
	context.beginPath();
	context.moveTo(platform.x + 4, platform.y + 4);
	context.quadraticCurveTo(platform.x + platform.width * 0.18, platform.y - 3, platform.x + platform.width * 0.48, platform.y);
	context.quadraticCurveTo(platform.x + platform.width * 0.78, platform.y - 4, platform.x + platform.width - 3, platform.y + 3);
	context.quadraticCurveTo(platform.x + platform.width * 0.72, platform.y + 8, platform.x + platform.width * 0.48, platform.y + 6);
	context.quadraticCurveTo(platform.x + platform.width * 0.22, platform.y + 10, platform.x + 4, platform.y + 4);
	context.closePath();
	context.fillStyle = platform.nebula ? mixColor(topColor, '#f0e9ff', 0.28) : topColor;
	context.fill();
	context.fillStyle = accentColor;
	context.beginPath();
	if (stageIndex === 1 || stageIndex === 4) {
		context.globalAlpha = 0.42;
		context.ellipse(platform.x + platform.width * 0.3, platform.y + 4, platform.width * 0.12, 2.6, -0.2, 0, Math.PI * 2);
		context.ellipse(platform.x + platform.width * 0.7, platform.y + 3, platform.width * 0.09, 1.8, 0.2, 0, Math.PI * 2);
	} else if (stageIndex === 2 || stageIndex === 8) {
		context.globalAlpha = 0.52;
		context.moveTo(platform.x + platform.width * 0.18, platform.y + 7);
		context.lineTo(platform.x + platform.width * 0.3, platform.y + 3);
		context.lineTo(platform.x + platform.width * 0.42, platform.y + 7);
		context.moveTo(platform.x + platform.width * 0.58, platform.y + 6);
		context.lineTo(platform.x + platform.width * 0.72, platform.y + 2);
		context.lineTo(platform.x + platform.width * 0.86, platform.y + 6);
	} else if (stageIndex === 6 || stageIndex === 9) {
		context.globalAlpha = 0.75;
		context.moveTo(platform.x + platform.width * 0.22, platform.y + 8);
		context.lineTo(platform.x + platform.width * 0.3, platform.y - 2);
		context.lineTo(platform.x + platform.width * 0.38, platform.y + 8);
		context.moveTo(platform.x + platform.width * 0.62, platform.y + 8);
		context.lineTo(platform.x + platform.width * 0.7, platform.y);
		context.lineTo(platform.x + platform.width * 0.78, platform.y + 8);
	} else {
		context.globalAlpha = 0.3;
		context.ellipse(platform.x + platform.width * 0.28, platform.y + 4, platform.width * 0.11, 2, -0.2, 0, Math.PI * 2);
		context.ellipse(platform.x + platform.width * 0.72, platform.y + 3, platform.width * 0.08, 1.5, 0.2, 0, Math.PI * 2);
	}
	context.fill();
	if (platform.cracked && !platform.falling) {
		context.strokeStyle = stage.islandAccent;
		context.lineWidth = 2.5;
		context.lineJoin = 'round';
		context.beginPath();
		context.moveTo(platform.x + platform.width * 0.54, platform.y + 3);
		context.lineTo(platform.x + platform.width * 0.47, platform.y + 9);
		context.lineTo(platform.x + platform.width * 0.56, platform.y + 13);
		context.lineTo(platform.x + platform.width * 0.49, platform.y + 18);
		context.lineTo(platform.x + platform.width * 0.55, platform.y + heightBelow + 2);
		context.stroke();
	}
	if (platform.moving) {
		context.fillStyle = '#d4a764';
		context.beginPath();
		context.moveTo(platform.x + 10, platform.y + 4);
		context.lineTo(platform.x + 14, platform.y + 2);
		context.lineTo(platform.x + 14, platform.y + 7);
		context.closePath();
		context.moveTo(platform.x + platform.width - 10, platform.y + 4);
		context.lineTo(platform.x + platform.width - 14, platform.y + 2);
		context.lineTo(platform.x + platform.width - 14, platform.y + 7);
		context.closePath();
		context.fill();
	}
	if (platform.slingshot) {
		context.save();
		context.globalAlpha = 1;
		const centerX = platform.x + platform.width / 2;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.strokeStyle = '#67452e';
		context.lineWidth = 4.2;
		context.beginPath();
		context.moveTo(centerX, platform.y + 4);
		context.lineTo(centerX - 2, platform.y - 11);
		context.lineTo(centerX - 11, platform.y - 25);
		context.moveTo(centerX - 2, platform.y - 11);
		context.lineTo(centerX + 10, platform.y - 25);
		context.stroke();
		context.strokeStyle = '#b98554';
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(centerX - 11, platform.y - 25);
		context.lineTo(centerX - 2, platform.y - 11);
		context.lineTo(centerX + 10, platform.y - 25);
		context.stroke();
		context.strokeStyle = '#633c34';
		context.lineWidth = 2.1;
		context.beginPath();
		context.moveTo(centerX - 11, platform.y - 25);
		context.lineTo(centerX - 1, platform.y - 15);
		context.moveTo(centerX + 10, platform.y - 25);
		context.lineTo(centerX + 1, platform.y - 15);
		context.stroke();
		context.strokeStyle = '#e8d6ae';
		context.lineWidth = 2.2;
		context.beginPath();
		context.moveTo(centerX - 13, platform.y - 24);
		context.lineTo(centerX - 9, platform.y - 27);
		context.moveTo(centerX + 8, platform.y - 27);
		context.lineTo(centerX + 12, platform.y - 24);
		context.stroke();
		context.fillStyle = '#dbc08a';
		context.strokeStyle = '#815d3b';
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(centerX - 4, platform.y - 16);
		context.quadraticCurveTo(centerX, platform.y - 13, centerX + 4, platform.y - 16);
		context.lineTo(centerX + 3, platform.y - 12);
		context.quadraticCurveTo(centerX, platform.y - 10, centerX - 3, platform.y - 12);
		context.closePath();
		context.fill();
		context.stroke();
		context.restore();
	}
	context.restore();
}

function drawBoostPickup(pickup: BoostPickup): void {
	const bob = Math.sin(elapsedTime * 4 + pickup.phase) * 4;
	const x = pickup.x;
	const y = pickup.y + bob;
	const fish = penguinSprites.fish;
	if (!fish.complete || fish.naturalWidth === 0) return;
	const fishScale = pickup.size * 0.42;
	const fishWidth = fish.naturalWidth * fishScale;
	const fishHeight = fish.naturalHeight * fishScale;
	context.save();
	const glowRadius = 8 + pickup.size * 12;
	const glow = context.createRadialGradient(x, y, 2, x, y, glowRadius);
	glow.addColorStop(0, 'rgba(160, 239, 228, 0.58)');
	glow.addColorStop(0.45, 'rgba(122, 216, 211, 0.24)');
	glow.addColorStop(1, 'rgba(122, 216, 211, 0)');
	context.fillStyle = glow;
	context.beginPath();
	context.arc(x, y, glowRadius, 0, Math.PI * 2);
	context.fill();
	context.imageSmoothingEnabled = false;
	context.drawImage(fish, x - fishWidth / 2, y - fishHeight / 2, fishWidth, fishHeight);
	context.restore();
}

function drawPenguin(): void {
	const { x, y, radius } = player;
	const bounce = mode === 'playing' ? Math.sin(elapsedTime * 12) * 1.5 : 0;
	const tilt = Math.max(-0.16, Math.min(0.16, player.vx / 1800));
	const rising = player.vy < 0;
	const body = rising ? penguinSprites.up : penguinSprites.down;
	if (!body.complete || body.naturalWidth === 0) return;
	const bodyHeight = radius * 2.55;
	const pixelScale = bodyHeight / body.naturalHeight;
	const bodyWidth = body.naturalWidth * pixelScale;
	const cone = penguinSprites.cone;
	const coneWidth = radius * 1.3;
	const coneHeight = coneWidth * cone.naturalHeight / cone.naturalWidth;
	const bodyTop = -bodyHeight / 2;
	context.save();
	context.translate(x, y);
	context.rotate(tilt);
	context.translate(0, bounce);
	context.fillStyle = 'rgba(29, 76, 89, 0.15)';
	context.beginPath();
	context.ellipse(0, radius + 9, radius * 0.95, 4.5, 0, 0, Math.PI * 2);
	context.fill();
	context.imageSmoothingEnabled = false;
	context.drawImage(body, -bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
	if (cone.complete && cone.naturalWidth > 0) {
		context.drawImage(
			cone,
			-coneWidth / 2,
			bodyTop + pixelScale - coneHeight - coneOffset,
			coneWidth,
			coneHeight,
		);
	}
	context.restore();
}

function resetConeOnHead(): void {
	coneOffset = 0;
	coneVelocity = 0;
	coneDetached = false;
}

function drawScene(): void {
	const isInRun = mode === 'playing' || mode === 'won';
	const sceneAltitude = isInRun ? altitude : 0;
	drawBackground(sceneAltitude);
	for (const platform of platforms) {
		if (!platform.summit) continue;
		const bounds = summitImageBounds(platform);
		if (bounds.y < height + 70 && bounds.y + bounds.height > -50) {
			drawSummitPlatform(platform);
			drawSummitSnow(platform);
		}
	}
	drawSummitFish();
	drawSummitHearts();
	for (const pickup of boostPickups) {
		const pickupAltitude =
			height - GROUND_SURFACE - pickup.platform.y + sceneAltitude - pickup.offsetY;
		if (boostsAllowedAtAltitude(pickupAltitude)) drawBoostPickup(pickup);
	}
	for (const platform of platforms) {
		if (platform.summit) continue;
		if (platform.y < height + 70 && platform.y + 60 > -50) drawPlatform(platform);
	}
	drawDebrisHazard(sceneAltitude);
	if (mode === 'playing') drawRescueLine();
	drawPersonalBestMarker();
	if (mode === 'playing') drawRecoveryArm();
	if (mode !== 'over') drawPenguin();
	if (mode === 'won') drawSummitParticles();
}

interface RecordMarker {
	score: number;
	color: string;
	preferredX: number;
}

function drawPersonalBestMarker(): void {
	const personalMarker: RecordMarker = {
		score: personalBestScore,
		color: '#e63d4d',
		preferredX: width * 0.18,
	};
	const overallMarker: RecordMarker = {
		score: overallBestScore,
		color: '#f1bd45',
		preferredX: width * 0.82,
	};
	if (personalMarker.score <= 0 && overallMarker.score <= 0) return;

	const markers = [personalMarker, overallMarker]
		.filter((marker) => marker.score > 0)
		.sort((first, second) => first.score - second.score);
	const groups: Array<{ platform: Platform; markers: RecordMarker[] }> = [];
	const shareBestIsland =
		personalMarker.score > 0 && personalMarker.score === overallMarker.score;
	if (shareBestIsland) {
		const platform = findNearestPlatformAtAltitude(personalMarker.score * 10);
		if (platform) groups.push({ platform, markers: [personalMarker, overallMarker] });
	} else {
		for (const marker of markers) {
			const platform = findNearestPlatformAtAltitude(marker.score * 10);
			if (platform) groups.push({ platform, markers: [marker] });
		}
	}

	const usedMarkers: Array<{ x: number; y: number }> = [];
	for (const group of groups) {
		const islandY = group.platform.y;
		if (islandY < -45 || islandY > height + 45) continue;
		if (group.platform.summit) {
			const centerX = group.platform.x + group.platform.width / 2;
			if (group.markers.length > 1) {
				drawMarkerFlag(centerX - 12, islandY, personalMarker.color);
				drawMarkerFlag(centerX + 12, islandY, overallMarker.color);
				const isOverallLeader = pilotName.length > 0 && overallBestName === pilotName;
				const label = isOverallLeader
					? 'YOUR BEST'
					: `YOUR BEST · #1 ${overallBestName}`;
				drawMarkerLabel(label, centerX, islandY - 43, 'center', Math.max(40, width - 24));
			} else {
				const marker = group.markers[0];
				drawMarkerFlag(centerX, islandY, marker.color);
				const label = marker === personalMarker
					? `YOUR BEST · ${marker.score.toLocaleString()} m`
					: `#1 ${overallBestName} · ${marker.score.toLocaleString()} m`;
				drawMarkerLabel(label, centerX, islandY - 43, 'center', Math.max(40, width - 24));
			}
			continue;
		}
		const centerX = findMarkerIslandX(
			group.markers[0].preferredX,
			islandY,
			usedMarkers,
			group.markers.length > 1,
		);
		if (centerX === null) continue;
		usedMarkers.push({ x: centerX, y: islandY });
		const bobbedY = drawMarkerIsland(
			centerX,
			islandY,
			group.markers[0].score,
			group.markers.length > 1,
		);
		if (group.markers.length > 1) {
			drawMarkerFlag(centerX - 10, bobbedY, personalMarker.color);
			drawMarkerFlag(centerX + 10, bobbedY, overallMarker.color);
			const isOverallLeader = pilotName.length > 0 && overallBestName === pilotName;
			const label = isOverallLeader
				? 'YOUR BEST'
				: `YOUR BEST · #1 ${overallBestName}`;
			drawMarkerLabel(label, centerX, bobbedY - 42, 'center', Math.max(40, width - 24));
			continue;
		}

		const marker = group.markers[0];
		drawMarkerFlag(centerX, bobbedY, marker.color);
		const label = marker === personalMarker
			? `YOUR BEST · ${marker.score.toLocaleString()} m`
			: `#1 ${overallBestName} · ${marker.score.toLocaleString()} m`;
		const placeLabelOnRight = centerX <= width / 2;
		const labelX = centerX + (placeLabelOnRight ? 22 : -22);
		const availableWidth = placeLabelOnRight
			? width - labelX - 8
			: labelX - 8;
		drawMarkerLabel(
			label,
			labelX,
			bobbedY - 24,
			placeLabelOnRight ? 'left' : 'right',
			Math.max(40, availableWidth),
		);
	}
}

function drawMarkerIsland(
	centerX: number,
	islandY: number,
	score: number,
	wide = false,
): number {
	const bobbedY = islandY + Math.sin(elapsedTime * 2.4 + score) * 2.5;
	const halfWidth = wide ? 21 : 12;
	const lowerEdge = wide ? 10 : 8;
	context.save();
	context.shadowColor = 'rgba(22, 68, 86, 0.22)';
	context.shadowBlur = 3;
	context.fillStyle = '#79a9b7';
	context.beginPath();
	context.moveTo(centerX - halfWidth, bobbedY - 1);
	context.lineTo(centerX - halfWidth + 4, bobbedY + lowerEdge * 0.62);
	context.lineTo(centerX - 4, bobbedY + lowerEdge);
	context.lineTo(centerX + halfWidth - 5, bobbedY + lowerEdge * 0.75);
	context.lineTo(centerX + halfWidth, bobbedY - 1);
	context.closePath();
	context.fill();
	context.shadowBlur = 0;
	context.fillStyle = '#eaf7f8';
	context.beginPath();
	context.moveTo(centerX - halfWidth, bobbedY - 1);
	context.quadraticCurveTo(centerX - halfWidth * 0.48, bobbedY - 7, centerX, bobbedY - 3);
	context.quadraticCurveTo(centerX + halfWidth * 0.48, bobbedY - 8, centerX + halfWidth, bobbedY - 1);
	context.closePath();
	context.fill();
	context.restore();
	return bobbedY;
}

function drawMarkerLabel(
	label: string,
	x: number,
	y: number,
	align: CanvasTextAlign,
	maxWidth: number,
): void {
	context.save();
	context.font = '800 10px sans-serif';
	context.textAlign = align;
	context.textBaseline = 'middle';
	context.lineJoin = 'round';
	context.lineWidth = 3;
	context.strokeStyle = 'rgba(7, 20, 31, 0.96)';
	context.strokeText(label, x, y, maxWidth);
	context.fillStyle = '#ffffff';
	context.fillText(label, x, y, maxWidth);
	context.restore();
}

function drawMarkerFlag(poleX: number, islandY: number, color: string): void {
	const poleTop = islandY - 31;
	context.save();
	context.strokeStyle = '#edf3f2';
	context.lineWidth = 1.5;
	context.beginPath();
	context.moveTo(poleX, islandY - 3);
	context.lineTo(poleX, poleTop);
	context.stroke();
	context.fillStyle = color;
	context.beginPath();
	context.moveTo(poleX + 1, poleTop + 2);
	context.lineTo(poleX + 15, poleTop + 5);
	context.lineTo(poleX + 1, poleTop + 11);
	context.closePath();
	context.fill();
	context.restore();
}

function findMarkerIslandX(
	preferredX: number,
	islandY: number,
	usedMarkers: Array<{ x: number; y: number }>,
	wide = false,
): number | null {
	const islandHalfWidth = wide ? 21 : 12;
	const candidates: number[] = [];
	for (let candidate = islandHalfWidth + 4; candidate <= width - islandHalfWidth - 4; candidate += 12) {
		candidates.push(candidate);
	}
	candidates.sort((first, second) => Math.abs(first - preferredX) - Math.abs(second - preferredX));
	for (const centerX of candidates) {
		const overlapsPlatform = platforms.some((platform) => {
			const platformY = platform.y;
			const horizontalOverlap =
				centerX + islandHalfWidth > platform.x &&
				centerX - islandHalfWidth < platform.x + platform.width;
			const verticalOverlap = platformY < islandY + 8 && platformY + 10 > islandY - 6;
			return horizontalOverlap && verticalOverlap;
		});
		if (overlapsPlatform) continue;
		const overlapsMarker = usedMarkers.some((marker) =>
			Math.abs(marker.y - islandY) < 22 && Math.abs(marker.x - centerX) < 30,
		);
		if (overlapsMarker) continue;
		return centerX;
	}
	return null;
}

function syncBoostPickups(): void {
	for (const pickup of boostPickups) {
		pickup.x = Math.max(
			0,
			Math.min(width, pickup.platform.x + pickup.platform.width / 2 + (pickup.sideOffset ?? 0)),
		);
		pickup.y = pickup.platform.y + pickup.offsetY;
	}
}

function pickupClearOfSlingshots(
	pickupPlatform: Platform,
	size: number,
	candidates: Platform[],
): boolean {
	const halfWidth = size * 26;
	const halfHeight = size * 16;
	const fishY = pickupPlatform.y - 42;
	const centerMinX = pickupPlatform.moving
		? pickupPlatform.minX + pickupPlatform.width / 2
		: pickupPlatform.x + pickupPlatform.width / 2;
	const centerMaxX = pickupPlatform.moving
		? pickupPlatform.maxX + pickupPlatform.width / 2
		: centerMinX;
	return candidates.every((platform) => {
		if (!platform.slingshot) return true;
		const slingX = platform.x + platform.width / 2;
		return (
			centerMaxX + halfWidth <= slingX - 15 ||
			centerMinX - halfWidth >= slingX + 15 ||
			fishY + halfHeight <= platform.y - 28 ||
			fishY - halfHeight >= platform.y + 4
		);
	});
}

function platformAltitude(platform: Platform): number {
	const cameraOffset = mode === 'playing' || mode === 'won' ? altitude : 0;
	return Math.max(0, height - GROUND_SURFACE - platform.y + cameraOffset);
}

function findNearestPlatformAtAltitude(targetAltitude: number): Platform | null {
	let nearest: Platform | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const platform of platforms) {
		if (platform.falling || (platform.nebula && (platform.opacity ?? 1) < 0.98)) continue;
		const distance = Math.abs(platformAltitude(platform) - targetAltitude);
		if (distance < nearestDistance) {
			nearest = platform;
			nearestDistance = distance;
		}
	}
	return nearest;
}

function getPlanetRouteAvoidanceZones(nextPlatformAltitude: number): PlatformAvoidanceZone[] {
	const platformScreenOffset = height - GROUND_SURFACE - height * 0.42;
	return PLANET_SCENERY.flatMap((world) => {
		if (world.radius > PLANET_ROUTE_AVOIDANCE_MAX_RADIUS) return [];
		const radius = Math.min(world.radius, width * 0.3);
		const crossingAltitude = world.altitude + platformScreenOffset;
		if (Math.abs(nextPlatformAltitude - crossingAltitude) > radius + PLANET_ROUTE_AVOIDANCE_MARGIN) return [];
		return [{ centerX: width * world.x, radius }];
	});
}

function makePlatforms(): void {
	const courseStartAltitude = altitude;
	const remainingCourseAltitude = Math.max(0, COURSE_MAX_ALTITUDE - courseStartAltitude);
	platforms = [];
	boostPickups = [];
	standingPlatform = null;
	stuckElapsed = 0;
	rescueServedPlatform = null;
	rescueState = null;
	armRescue = null;
	knockbackTime = 0;
	boostActive = false;
	boostDeceleration = BOOST_DECELERATION;
	coneOffset = 0;
	coneVelocity = 0;
	resetConeOnHead();
	boostPlatformsUntilNext = 4 + Math.floor(Math.random() * 3);
	const ground: Platform = {
		x: 0,
		y: height - GROUND_SURFACE,
		width,
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
	platforms.push(createReachablePlatform(ground, width, Math.random, courseStartAltitude));
	let mainRoute = platforms[0];
	const mainRoutePlatforms = [mainRoute];
	const courseTop = ground.y - remainingCourseAltitude;
	let summitApproach: Platform | null = null;
	for (let layer = 0; layer < COURSE_PREVIEW_LAYERS && mainRoute.y > courseTop; layer += 1) {
		if (mainRoute.y - courseTop < 32) mainRoute.y = courseTop + 32;
		const layerAltitude = courseStartAltitude + ground.y - mainRoute.y;
		const avoidanceZones = getPlanetRouteAvoidanceZones(
			layerAltitude + PLATFORM_ROUTE_ALTITUDE_STEP,
		);
		const layerPlatforms = createReachablePlatformRoutes(
			[mainRoute],
			width,
			Math.random,
			layerAltitude,
			avoidanceZones,
		);
		if (layerPlatforms[0].y <= courseTop) {
			summitApproach = mainRoute;
			for (const platform of layerPlatforms) platform.y = courseTop;
		}
		for (const platform of layerPlatforms) {
			assignSlingshotPlatforms(
				[platform],
				Math.random,
				courseStartAltitude + ground.y - platform.y,
			);
		}
		platforms.push(...layerPlatforms);
		boostPlatformsUntilNext -= 1;
		if (boostPlatformsUntilNext <= 0) {
			if (Math.random() < 0.72) {
				const size = getFishSize(layerAltitude, Math.random);
				const eligiblePlatforms = layerPlatforms.filter((platform) =>
					!platform.slingshot &&
					boostsAllowedAtAltitude(
						courseStartAltitude + ground.y - platform.y + 42 + size * 18,
					) &&
					pickupClearOfSlingshots(
						platform,
						size,
						layerPlatforms,
					),
				);
				if (eligiblePlatforms.length > 0) {
					const platform = eligiblePlatforms[Math.floor(Math.random() * eligiblePlatforms.length)];
					boostPickups.push({
						x: platform.x + platform.width / 2,
						y: platform.y - 42,
						phase: Math.random() * Math.PI * 2,
						size,
						platform,
						offsetY: -42,
					});
				}
			}
			boostPlatformsUntilNext = 5 + Math.floor(Math.random() * 4);
		}
		mainRoute = layerPlatforms[0];
		mainRoutePlatforms.push(mainRoute);
	}
	if (remainingCourseAltitude > 0) {
		const finalRoute = summitApproach ?? mainRoute;
		platforms = platforms.filter((platform) => Math.abs(platform.y - courseTop) > 0.001);
		const summit = createSummitPlatform(finalRoute, width, courseTop);
		platforms.push(summit);

		const finalRouteLayers = mainRoutePlatforms
			.filter((platform) => platforms.includes(platform) && !platform.summit)
			.slice(-4);
		const firstRouteCenter = finalRouteLayers[0]
			? finalRouteLayers[0].x + finalRouteLayers[0].width / 2
			: summit.x + summit.width / 2;
		const summitCenter = summit.x + summit.width / 2;
		for (const [index, routePlatform] of finalRouteLayers.entries()) {
			const targetCenter = firstRouteCenter +
				(summitCenter - firstRouteCenter) * (index + 1) / finalRouteLayers.length;
			const layer = platforms.filter((platform) =>
				!platform.summit && Math.abs(platform.y - routePlatform.y) <= 12,
			);
			const shiftMin = Math.max(...layer.map((platform) => -platform.x));
			const shiftMax = Math.min(...layer.map((platform) => width - platform.x - platform.width));
			const shift = Math.max(
				shiftMin,
				Math.min(shiftMax, targetCenter - (routePlatform.x + routePlatform.width / 2)),
			);
			for (const platform of layer) {
				platform.x += shift;
				makePlatformStationary(platform);
			}
		}

		const approachGap = finalRoute.y - courseTop;
		if (approachGap >= 72) {
			const frontStep = createReachablePlatform(
				finalRoute,
				width,
				Math.random,
				COURSE_MAX_ALTITUDE - 500,
			);
			frontStep.x = summit.x + (summit.width - frontStep.width) / 2;
			frontStep.y = courseTop + Math.round(approachGap / 2);
			frontStep.cracked = false;
			frontStep.falling = false;
			frontStep.nebula = false;
			frontStep.opacity = 1;
			frontStep.slingshot = false;
			makePlatformStationary(frontStep);
			platforms.push(frontStep);
		}
	} else {
		const summit = createSummitPlatform(mainRoute, width, ground.y);
		platforms = [summit];
	}
	makeHighestPlatformLayersStationary(platforms, 4);
	for (const markerScore of new Set([personalBestScore, overallBestScore])) {
		if (markerScore <= 0 || markerScore * 10 < courseStartAltitude) continue;
		const markerY = ground.y - (markerScore * 10 - courseStartAltitude);
		const nearest = platforms.reduce<Platform | null>((best, platform) =>
			best === null || Math.abs(platform.y - markerY) < Math.abs(best.y - markerY)
				? platform
				: best,
		null);
		if (!nearest) continue;
		for (const platform of platforms) {
			if (Math.abs(platform.y - nearest.y) <= 12) makePlatformStationary(platform);
		}
	}
	const summitPlatform = platforms.find((platform) => platform.summit);
	summitFish = summitPlatform
		? [0.2, 0.35, 0.5, 0.65, 0.8].map((position, index) => ({
			platform: summitPlatform,
			offsetX: summitPlatform.width * position,
			offsetY: -13,
			phase: index * Math.PI * 0.42,
		}))
		: [];
	summitHeartParticles = [];
	moonX = width * 0.7;
	seedBackground();
}

function initializePreview(): void {
	altitude = 0;
	makePlatforms();
	player = {
		x: width / 2,
		y: height - GROUND_SURFACE - Math.max(14, Math.min(18, width * 0.045)),
		vx: 0,
		vy: 0,
		radius: Math.max(14, Math.min(18, width * 0.045)),
	};
	drawScene();
}

function setDirection(): void {
	const left = pressedKeys.has('arrowleft') || pressedKeys.has('a');
	const right = pressedKeys.has('arrowright') || pressedKeys.has('d');
	direction = left === right ? 0 : left ? -1 : 1;
}

function beginGame(): void {
	const enteredName = pilotInput.value.trim().replace(/\s+/g, ' ').slice(0, 24);
	if (!enteredName) {
		gameMessage.textContent = 'Choose a name first!';
		pilotInput.focus();
		return;
	}
	if (enteredName !== pilotName && !savePilotName(enteredName)) {
		return;
	}
	startClimb('Pip is airborne! Catch a fish for a boost; bigger fish launch higher.');
}

function startClimb(message: string): void {
	climbSession += 1;
	activeScoreRunToken = createScoreRun(pilotName).catch((error: unknown) => {
		console.error('The score run could not be validated.', error);
		return null;
	});
	score = 0;
	altitude = 0;
	elapsedTime = 0;
	summitVictory.hidden = true;
	summitParticles = [];
	standingPlatform = null;
	stuckElapsed = 0;
	rescueServedPlatform = null;
	rescueState = null;
	knockbackTime = 0;
	makePlatforms();
	player = {
		x: width / 2,
		y: height - GROUND_SURFACE - Math.max(14, Math.min(18, width * 0.045)),
		vx: 0,
		vy: -JUMP_SPEED,
		radius: Math.max(14, Math.min(18, width * 0.045)),
	};
	scoreValue.textContent = `${score}`;
	mode = 'playing';
	updatePilotFormAvailability();
	playLabel.textContent = 'Restart climb';
	gameMessage.textContent = message;
	updateBackground(0, altitude);
}

function endGame(): void {
	if (score === 0) {
		startClimb('Pip missed the ledge. Starting a fresh climb.');
		return;
	}
	const submittedScore = score;
	const submittedName = pilotName;
	const runToken = activeScoreRunToken;
	startClimb(`${submittedName} climbed ${submittedScore} m. Saving score…`);
	const session = climbSession;
	void saveScore(submittedName, submittedScore, runToken).then((saved) => {
		if (session !== climbSession) return;
		gameMessage.textContent = saved
			? `${submittedName} climbed ${submittedScore} m. Starting a fresh climb.`
			: `${submittedName} climbed ${submittedScore} m, but the score could not be saved. Starting a fresh climb.`;
	});
}

function reachSummit(): void {
	const runToken = activeScoreRunToken;
	score = COURSE_MAX_METERS;
	scoreValue.textContent = `${score}`;
	mode = 'won';
	updatePilotFormAvailability();
	boostActive = false;
	standingPlatform = platforms.find((platform) => platform.summit) ?? null;
	stuckElapsed = 0;
	rescueState = null;
	armRescue = null;
	resetConeOnHead();
	summitParticles = Array.from({ length: 38 }, (_, index) => {
		const angle = Math.PI * 2 * index / 38 + (Math.random() - 0.5) * 0.18;
		const speed = 65 + Math.random() * 180;
		return {
			x: player.x,
			y: player.y - player.radius * 1.7,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 55,
			age: 0,
			lifetime: 1.2 + Math.random() * 1.1,
			size: 2 + Math.random() * 3,
			color: ['#fff3a6', '#a7f5ff', '#ff9abb', '#c4a8ff'][index % 4],
		};
	});
	summitVictory.hidden = false;
	playLabel.textContent = 'Climb again';
	summitVictoryTitle.textContent = 'You made it!';
	summitVictoryCopy.textContent = 'Saving your score to the shared leaderboard…';
	gameMessage.textContent = 'Summit reached! Pip cannot jump here, but can slide left and right.';
	const submittedName = pilotName;
	const session = climbSession;
	void saveScore(submittedName, COURSE_MAX_METERS, runToken).then((saved) => {
		if (session !== climbSession || mode !== 'won') return;
		summitVictoryCopy.textContent = saved
			? 'Pip landed on the 10,000 m summit. Your score is saved. Explore the island with left and right, or start a new climb.'
			: 'Pip landed on the 10,000 m summit, but the score could not be saved. Explore the island with left and right.';
	});
}

function updateSummit(delta: number): void {
	const platform = standingPlatform;
	if (!platform?.summit) return;
	const targetVelocity = direction * 150;
	player.vx += (targetVelocity - player.vx) * Math.min(1, delta * 8);
	player.x += player.vx * delta;
	const margin = player.radius * 0.72;
	const minX = platform.x + margin;
	const maxX = platform.x + platform.width - margin;
	if (player.x < minX) {
		player.x = minX;
		player.vx = Math.max(0, player.vx);
	} else if (player.x > maxX) {
		player.x = maxX;
		player.vx = Math.min(0, player.vx);
	}
	player.y = platform.y - player.radius;
	player.vy = 0;
	for (let index = summitFish.length - 1; index >= 0; index -= 1) {
		const fish = summitFish[index];
		const fishX = fish.platform.x + fish.offsetX;
		const fishY = fish.platform.y + fish.offsetY + Math.sin(elapsedTime * 3 + fish.phase) * 1.5;
		if (Math.hypot(player.x - fishX, player.y - fishY) >= player.radius + 10) continue;
		summitFish.splice(index, 1);
		for (let heartIndex = 0; heartIndex < 5; heartIndex += 1) {
			const angle = -Math.PI * 0.9 + heartIndex * Math.PI * 0.45;
			summitHeartParticles.push({
				x: fishX,
				y: fishY,
				vx: Math.cos(angle) * (18 + Math.random() * 20),
				vy: -38 - Math.random() * 24,
				age: 0,
				lifetime: 0.65 + Math.random() * 0.35,
				size: 6 + Math.random() * 3,
			});
		}
		gameMessage.textContent = 'A little summit snack for Pip!';
	}
	for (const particle of summitParticles) {
		particle.age += delta;
		particle.x += particle.vx * delta;
		particle.y += particle.vy * delta;
		particle.vy += 110 * delta;
	}
	summitParticles = summitParticles.filter((particle) => particle.age < particle.lifetime);
	for (const heart of summitHeartParticles) {
		heart.age += delta;
		heart.x += heart.vx * delta;
		heart.y += heart.vy * delta;
		heart.vy -= 8 * delta;
	}
	summitHeartParticles = summitHeartParticles.filter((heart) => heart.age < heart.lifetime);
}

function hasNextReachablePlatform(platform: Platform): boolean {
	const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
	return hasReachablePlatform(platform, platforms, maxJumpHeight - 8, width * 0.38);
}

function hasReachableFish(platform: Platform): boolean {
	const maxJumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
	return hasReachablePickup(platform, boostPickups, maxJumpHeight, width * 0.38);
}

function updateRescue(delta: number): void {
	if (
		standingPlatform &&
		boostsAllowedAtAltitude(
			platformAltitude(standingPlatform) +
				(standingPlatform.slingshot ? 54 : 18) + 15,
		) &&
		standingPlatform !== rescueServedPlatform &&
		!standingPlatform.falling &&
		!hasNextReachablePlatform(standingPlatform) &&
		!hasReachableFish(standingPlatform)
	) {
		stuckElapsed += delta;
		if (!rescueState && stuckElapsed >= 2.2) {
			const centerX = standingPlatform.x + standingPlatform.width / 2;
			rescueState = {
				platform: standingPlatform,
				sideOffset: centerX < width / 2 ? 28 : -28,
				fishOffsetY: standingPlatform.slingshot ? -54 : -18,
				x: centerX + (centerX < width / 2 ? 28 : -28),
				phase: 'lowering',
				progress: 0,
			};
			gameMessage.textContent = 'Pip is stuck. A rescue fish is on its way!';
		}
	} else if (!rescueState) {
		stuckElapsed = 0;
	}
	if (!rescueState) return;
	rescueState.x = Math.max(
		18,
		Math.min(width - 18, rescueState.platform.x + rescueState.platform.width / 2 + rescueState.sideOffset),
	);
	rescueState.progress += delta / (rescueState.phase === 'lowering' ? 0.95 : 0.42);
	if (rescueState.progress < 1) return;
	if (rescueState.phase === 'lowering') {
		const platform = rescueState.platform;
		boostPickups.push({
			x: rescueState.x,
			y: platform.y + rescueState.fishOffsetY,
			phase: Math.random() * Math.PI * 2,
			size: getFishSize(0, () => 0),
			platform,
			offsetY: rescueState.fishOffsetY,
			sideOffset: rescueState.x - (platform.x + platform.width / 2),
		});
		rescueServedPlatform = platform;
		rescueState.phase = 'retracting';
		rescueState.progress = 0;
		return;
	}
	rescueState = null;
}

function drawRescueLine(): void {
	if (!rescueState) return;
	const platformY = rescueState.platform.y + rescueState.fishOffsetY;
	const hookY = rescueState.phase === 'lowering'
		? -12 + (platformY + 12) * rescueState.progress
		: platformY * (1 - rescueState.progress) - 12 * rescueState.progress;
	context.save();
	context.strokeStyle = 'rgba(244, 250, 255, 0.86)';
	context.lineWidth = 1.5;
	context.beginPath();
	context.moveTo(rescueState.x, -8);
	context.quadraticCurveTo(rescueState.x - 3, hookY * 0.5, rescueState.x, hookY);
	context.stroke();
	context.fillStyle = '#d8e7ee';
	context.beginPath();
	context.arc(rescueState.x, hookY, 3, 0, Math.PI * 2);
	context.fill();
	if (rescueState.phase === 'lowering' && penguinSprites.fish.complete && penguinSprites.fish.naturalWidth > 0) {
		const fishWidth = 16;
		const fishHeight = fishWidth * penguinSprites.fish.naturalHeight / penguinSprites.fish.naturalWidth;
		context.imageSmoothingEnabled = false;
		context.drawImage(penguinSprites.fish, rescueState.x - fishWidth / 2, hookY + 3, fishWidth, fishHeight);
	}
	context.restore();
}

function drawRecoveryArm(): void {
	if (!armRescue) return;
	const easedProgress = armRescue.progress * armRescue.progress * (3 - 2 * armRescue.progress);
	const armX = armRescue.phase === 'carrying'
		? armRescue.caughtX + (armRescue.targetX - armRescue.caughtX) * easedProgress
		: armRescue.phase === 'placing' || armRescue.phase === 'retracting'
			? armRescue.targetX
			: armRescue.caughtX;
	const handY = armRescue.phase === 'lowering'
		? -18 + (player.y - player.radius * 0.35 + 18) * easedProgress
		: armRescue.phase === 'retracting'
			? -18 + (armRescue.targetY - player.radius * 0.35 + 18) * armRescue.progress
			: player.y - player.radius * 0.35;
	context.save();
	context.lineCap = 'round';
	context.strokeStyle = '#263b49';
	context.lineWidth = 11;
	context.beginPath();
	context.moveTo(armX, -18);
	context.lineTo(armX, handY);
	context.stroke();
	context.strokeStyle = '#aabcc4';
	context.lineWidth = 5;
	context.stroke();
	context.fillStyle = '#e0b85e';
	context.strokeStyle = '#263b49';
	context.lineWidth = 2;
	context.beginPath();
	context.roundRect(armX - 8, handY - 3, 16, 8, 3);
	context.fill();
	context.stroke();
	context.strokeStyle = '#263b49';
	context.lineWidth = 3;
	context.beginPath();
	context.moveTo(armX - 5, handY + 4);
	context.quadraticCurveTo(armX - 11, handY + 11, armX - 7, handY + 15);
	context.moveTo(armX + 5, handY + 4);
	context.quadraticCurveTo(armX + 11, handY + 11, armX + 7, handY + 15);
	context.stroke();
	context.fillStyle = '#d5e0e2';
	context.beginPath();
	context.arc(armX - 7, handY + 15, 2, 0, Math.PI * 2);
	context.arc(armX + 7, handY + 15, 2, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function startRecoveryArmRescue(): boolean {
	if (!shouldUseRescueArm()) return false;
	const candidates = platforms.filter(
		(platform) =>
			!platform.moving &&
			!platform.cracked &&
			!platform.falling &&
			platform.y >= 12 &&
			platform.y <= height - 30,
	);
	if (candidates.length === 0) return false;
	const target = candidates.reduce((nearest, platform) => {
		const distance = Math.hypot(
			platform.x + platform.width / 2 - player.x,
			platform.y - player.y,
		);
		const nearestDistance = Math.hypot(
			nearest.x + nearest.width / 2 - player.x,
			nearest.y - player.y,
		);
		return distance < nearestDistance ? platform : nearest;
	});
	armRescue = {
		platform: target,
		phase: 'lowering',
		progress: 0,
		caughtX: player.x,
		caughtY: height - player.radius,
		targetX: target.x + target.width / 2,
		targetY: target.y - player.radius,
	};
	player.x = armRescue.caughtX;
	player.y = armRescue.caughtY;
	player.vx = 0;
	player.vy = 0;
	resetConeOnHead();
	boostActive = false;
	standingPlatform = null;
	rescueState = null;
	gameMessage.textContent = 'Rescue arm deployed! Pip is being carried to a safe island.';
	return true;
}

function updateRecoveryArm(delta: number): void {
	if (!armRescue) return;
	if (armRescue.phase === 'lowering') {
		armRescue.progress = Math.min(1, armRescue.progress + delta / 0.8);
		if (armRescue.progress >= 1) {
			armRescue.phase = 'carrying';
			armRescue.progress = 0;
		}
		return;
	}
	if (armRescue.phase === 'carrying') {
		armRescue.progress = Math.min(1, armRescue.progress + delta / 0.9);
		const eased = armRescue.progress * armRescue.progress * (3 - 2 * armRescue.progress);
		player.x = armRescue.caughtX + (armRescue.targetX - armRescue.caughtX) * eased;
		player.y = armRescue.caughtY +
			(armRescue.targetY - player.radius * 0.2 - armRescue.caughtY) * eased;
		if (armRescue.progress >= 1) {
			armRescue.phase = 'placing';
			armRescue.progress = 0;
		}
		return;
	}
	if (armRescue.phase === 'placing') {
		armRescue.progress = Math.min(1, armRescue.progress + delta / 0.3);
		player.x = armRescue.targetX;
		player.y = armRescue.targetY - player.radius * 0.2 * (1 - armRescue.progress);
		if (armRescue.progress >= 1) {
			player.y = armRescue.targetY;
			armRescue.phase = 'retracting';
			armRescue.progress = 1;
			standingPlatform = armRescue.platform;
			gameMessage.textContent = 'Pip is safe! The robotic arm set him on a solid island.';
		}
		return;
	}
	armRescue.progress = Math.max(0, armRescue.progress - delta / 0.65);
	if (armRescue.progress === 0) {
		armRescue = null;
		player.vy = -JUMP_SPEED;
		resetConeOnHead();
	}
}

function updateGame(delta: number): void {
	if (mode !== 'playing') return;
	for (const platform of platforms) {
		const ledgeAltitude = platformAltitude(platform);
		if (platform.slingshot && !boostsAllowedAtAltitude(ledgeAltitude)) {
			platform.slingshot = false;
		}
		updateMovingPlatform(platform, delta, ledgeAltitude);
		updateNebulaPlatform(platform, delta);
	}
	syncBoostPickups();
	if (armRescue) {
		updateRecoveryArm(delta);
		return;
	}
	const previousBottom = player.y + player.radius;
	const currentAltitude = Math.max(
		0,
		Math.min(
			COURSE_MAX_ALTITUDE,
			altitude + height - GROUND_SURFACE - player.y - player.radius,
		),
	);
	const steeringScale = steeringResponseAtAltitude(currentAltitude);
	knockbackTime = Math.max(0, knockbackTime - delta);
	player.vx +=
		(direction * 280 - player.vx) *
		Math.min(1, delta * 10 * steeringScale * (knockbackTime > 0 ? 0.2 : 1));
	let verticalDisplacement = player.vy * delta;
	if (boostActive) {
		const boostMotion = integrateBoostMotion(
			player.vy,
			currentAltitude,
			boostDeceleration,
			delta,
		);
		player.vy = boostMotion.velocity;
		verticalDisplacement = boostMotion.displacement;
		if (boostMotion.completed) {
			boostActive = false;
			boostDeceleration = BOOST_DECELERATION;
			gameMessage.textContent = '';
		}
	} else {
		player.vy += gravityAtAltitude(currentAltitude) * delta;
	}
	if (player.vy > 0) {
		coneDetached = true;
	} else {
		resetConeOnHead();
	}
	if (coneDetached) {
		coneVelocity = Math.min(110, coneVelocity + 210 * delta);
		coneOffset = Math.min(25, coneOffset + coneVelocity * delta);
	} else if (coneOffset > 0) {
		coneVelocity -= 900 * delta;
		coneOffset = Math.max(0, coneOffset + coneVelocity * delta);
		if (coneOffset === 0) coneVelocity = 0;
	}
	player.x += player.vx * delta;
	player.y += verticalDisplacement;

	if (player.x < -player.radius) player.x = width + player.radius;
	if (player.x > width + player.radius) player.x = -player.radius;
	let wasHitByDebris = false;
	if (
		debrisHazard &&
		Math.hypot(player.x - debrisHazard.x, player.y - debrisHazard.y) <
			player.radius + debrisHazard.radius
	) {
		const impactDirection = Math.atan2(debrisHazard.vy, debrisHazard.vx);
		const flingSpeed = 420 + debrisHazard.radius * 28;
		debrisHazard = null;
		nextDebrisAt = elapsedTime + 5 + Math.random() * 3;
		boostActive = false;
		player.vx = Math.cos(impactDirection) * flingSpeed;
		player.vy = Math.sin(impactDirection) * flingSpeed;
		knockbackTime = 1.1 + flingSpeed / 1800;
		wasHitByDebris = true;
		standingPlatform = null;
		stuckElapsed = 0;
		rescueState = null;
		gameMessage.textContent = 'ASTEROID IMPACT! Pip was flung along its flight path.';
	}
	if (!wasHitByDebris) {
		const planeIndex = backgroundElements.findIndex((element) => {
			if (element.type !== 'plane') return false;
			const cockpit = getPlaneCockpitPosition(element);
			const hitRadius = player.radius + 8 * element.size;
			return Math.hypot(player.x - cockpit.x, player.y - cockpit.y) <= hitRadius;
		});
		if (planeIndex >= 0) {
			const [plane] = backgroundElements.splice(planeIndex, 1);
			const flingSpeed = 1500 + plane.size * 420;
			const flingVelocity = getDirectionalFlingVelocity(plane.vx, plane.vy, flingSpeed);
			player.vx = flingVelocity.x;
			player.vy = flingVelocity.y;
			knockbackTime = 1.8;
			wasHitByDebris = true;
			boostActive = false;
			standingPlatform = null;
			stuckElapsed = 0;
			rescueState = null;
			nextPlaneAt = elapsedTime + 8 + Math.random() * 10;
			gameMessage.textContent = 'PLANE COLLISION! Pip was flung along its flight path.';
		}
	}

	if (player.vy > 0 && !wasHitByDebris) {
		for (const platform of platforms) {
			if (!canLandOnPlatform(platform)) continue;
			const overlaps =
				player.x + player.radius * 0.55 > platform.x &&
				player.x - player.radius * 0.55 < platform.x + platform.width;
			if (overlaps && previousBottom <= platform.y && player.y + player.radius >= platform.y) {
				player.y = platform.y - player.radius;
				if (platform.summit) {
					player.vx = 0;
					player.vy = 0;
					reachSummit();
					return;
				}
				player.vy = platform.slingshot
					? -slingshotLaunchSpeed(platformAltitude(platform))
					: -JUMP_SPEED;
				resetConeOnHead();
				if (standingPlatform !== platform) {
					standingPlatform = platform;
					stuckElapsed = 0;
					rescueServedPlatform = null;
					rescueState = null;
				}
				if (platform.cracked) {
					platform.falling = true;
					platform.fallSpeed = 0;
					platform.breakAmount = 0;
				}
				if (platform.slingshot) {
					boostActive = true;
					boostDeceleration = GRAVITY;
					gameMessage.textContent = 'SLINGSHOT! Pip launches roughly 500 metres upward!';
				}
				break;
			}
		}
	}

	const groundY = height - GROUND_SURFACE;
	if (
		player.vy > 0 &&
		altitude <= GROUND_BOUNCE_HEIGHT &&
		previousBottom <= groundY &&
		player.y + player.radius >= groundY
	) {
		player.y = groundY - player.radius;
		player.vy = -JUMP_SPEED;
		boostActive = false;
		resetConeOnHead();
		gameMessage.textContent = 'Pip bounced off the grass! Find the first ledge.';
	}

	const caughtFish = boostPickups.findIndex(
		(pickup) =>
			boostsAllowedAtAltitude(platformAltitude(pickup.platform) - pickup.offsetY) &&
			Math.hypot(player.x - pickup.x, player.y - pickup.y) <
			player.radius + pickup.size * 18,
	);
	if (caughtFish >= 0) {
		const [pickup] = boostPickups.splice(caughtFish, 1);
		const launchSpeed = boostLaunchSpeed(pickup.size);
		if (!boostActive || -player.vy < launchSpeed) {
			boostActive = true;
			boostDeceleration = BOOST_DECELERATION;
			player.vy = -launchSpeed;
			standingPlatform = null;
			stuckElapsed = 0;
			rescueState = null;
			gameMessage.textContent = 'FISH BOOST! Pip is rocketing upward — steer for a landing.';
		} else {
			gameMessage.textContent = 'FISH COLLECTED! Your stronger launch stays active.';
		}
	}
	updateRescue(delta);

	const scrollLine = height * 0.39;
	if (player.y < scrollLine) {
		const cameraLimit = summitCameraLimit(
			height,
			GROUND_SURFACE,
			scrollLine,
			player.radius,
		);
		const shift = Math.min(scrollLine - player.y, Math.max(0, cameraLimit - altitude));
		if (shift > 0) {
			player.y += shift;
			for (const platform of platforms) platform.y += shift;
			if (debrisHazard) debrisHazard.y += shift;
			for (const pickup of boostPickups) pickup.y += shift;
			altitude += shift;
		}
		score = climbScoreAtAltitude(altitude);
		scoreValue.textContent = `${score}`;
	}

	if (player.y - player.radius * 1.275 > height + 2) {
		if (startRecoveryArmRescue()) return;
		endGame();
	}
}

function frame(time: number): void {
	const delta = lastFrame === 0 ? 0 : Math.min((time - lastFrame) / 1000, 0.032);
	lastFrame = time;
	advanceEnvironmentTransitions(delta);
	if (mode === 'playing') {
		updateGame(delta);
	} else if (mode === 'won') {
		updateSummit(delta);
	} else {
		for (const platform of platforms) {
			updateMovingPlatform(platform, delta, platformAltitude(platform));
			updateNebulaPlatform(platform, delta);
		}
		syncBoostPickups();
	}
	updateBackground(delta, mode === 'playing' || mode === 'won' ? altitude : 0);
	drawScene();
	window.requestAnimationFrame(frame);
}

function resizeCanvas(): void {
	const bounds = canvas.getBoundingClientRect();
	const nextWidth = Math.max(1, bounds.width);
	const nextHeight = Math.max(1, bounds.height);
	if (width > 0 && height > 0) {
		const scaleX = nextWidth / width;
		player.x *= scaleX;
		player.y += nextHeight - height;
		player.radius *= scaleX;
		for (const platform of platforms) {
			resizePlatformHorizontally(platform, scaleX, nextWidth);
			platform.y += nextHeight - height;
		}
		for (const pickup of boostPickups) {
			pickup.x *= scaleX;
			pickup.y += nextHeight - height;
		}
		for (const element of ambientElements) {
			element.x *= scaleX;
			element.originX *= scaleX;
			element.y += nextHeight - height;
			element.baseY += nextHeight - height;
		}
		for (const star of twinklingStars) {
			star.x *= scaleX;
			star.y *= nextHeight / height;
		}
		for (const cloud of weatherClouds) cloud.x *= scaleX;
		for (const bank of fogBanks) {
			bank.x *= scaleX;
			bank.radius *= scaleX;
		}
		if (debrisHazard) {
			debrisHazard.x *= scaleX;
			debrisHazard.y += nextHeight - height;
		}
		for (const element of backgroundElements) {
			element.x *= scaleX;
			element.y += nextHeight - height;
			for (const point of element.contrail) {
				point.x *= scaleX;
				point.y += nextHeight - height;
			}
		}
		moonX *= scaleX;
	}
	width = nextWidth;
	height = nextHeight;
	initializeWeatherScenery();
	canvasPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.round(width * canvasPixelRatio);
	canvas.height = Math.round(height * canvasPixelRatio);
	context.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
	ensureInterstellarBaseTexture();
	ensureInterstellarNebulaTexture();
	ensureInterstellarForegroundStarTexture();
	drawScene();
}

pilotForm.addEventListener('submit', (event) => {
	event.preventDefault();
	savePilotName(pilotInput.value);
});

weatherConsent.addEventListener('change', async () => {
	const requestSequence = ++weatherLoadSequence;
	weatherRequestController?.abort();
	weatherRequestController = null;
	weatherSourceUrl = null;
	localWeatherObservation = null;
	weatherStatus.textContent = '';

	if (!weatherConsent.checked) {
		weatherLoading.hidden = true;
		setLocalFallback();
		return;
	}

	setDeviceTimeFallback(true);
	setWeatherKind('clear', true);
	weatherRequestState = 'locating';
	updateLocalConditions();
	weatherLoading.hidden = false;
	try {
		await loadLocalWeather(true, requestSequence);
	} finally {
		if (requestSequence === weatherLoadSequence) weatherLoading.hidden = true;
	}
});

function setWeatherInfoOpen(open: boolean, returnFocus = false): void {
	weatherInfo.hidden = !open;
	weatherInfoToggle.setAttribute('aria-expanded', `${open}`);
	if (open) weatherInfoClose.focus();
	else if (returnFocus) weatherInfoToggle.focus();
}

weatherInfoToggle.addEventListener('click', () => {
	setWeatherInfoOpen(weatherInfo.hasAttribute('hidden'));
});
weatherInfoClose.addEventListener('click', () => setWeatherInfoOpen(false, true));
document.addEventListener('click', (event) => {
	if (
		!weatherInfo.hidden &&
		event.target instanceof Node &&
		!weatherInfo.contains(event.target) &&
		!weatherInfoToggle.contains(event.target)
	) {
		setWeatherInfoOpen(false);
	}
});
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && !weatherInfo.hidden) setWeatherInfoOpen(false, true);
});

playButton.addEventListener('click', beginGame);
summitRestartButton.addEventListener('click', beginGame);
summitDismissButton.addEventListener('click', () => {
	summitVictory.hidden = true;
});
function holdDirection(button: HTMLButtonElement, key: string): void {
	button.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		pressedKeys.add(key);
		setDirection();
		button.setPointerCapture(event.pointerId);
	});
	button.addEventListener('pointerup', () => {
		pressedKeys.delete(key);
		setDirection();
	});
	button.addEventListener('pointercancel', () => {
		pressedKeys.delete(key);
		setDirection();
	});
	button.addEventListener('lostpointercapture', () => {
		pressedKeys.delete(key);
		setDirection();
	});
}

holdDirection(leftButton, 'a');
holdDirection(rightButton, 'd');

window.addEventListener('keydown', (event) => {
	const target = event.target;
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
	const key = event.key.toLowerCase();
	if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
		event.preventDefault();
		pressedKeys.add(key);
		setDirection();
	}
	if ((key === ' ' || key === 'enter') && mode !== 'playing' && mode !== 'won') {
		if (target instanceof HTMLElement && target.closest('button, a')) return;
		event.preventDefault();
		beginGame();
	}
});

window.addEventListener('keyup', (event) => {
	pressedKeys.delete(event.key.toLowerCase());
	setDirection();
});

window.addEventListener('blur', () => {
	pressedKeys.clear();
	setDirection();
});

clearPreviouslySavedScores();
clearLegacyPilotName();
const savedPilot = getSessionPilotName();
if (savedPilot) {
	const restoredName = savedPilot.trim().replace(/\s+/g, ' ').slice(0, 24);
	if (restoredName) {
		pilotName = restoredName;
		pilotInput.value = pilotName;
		gameMessage.textContent = `Welcome back, ${pilotName}. Ready for another climb?`;
	}
}
updatePilotFormAvailability();
renderLeaderboard();
void refreshLeaderboard(pilotName);
setLocalFallback();
window.setInterval(updateLocalConditions, 30_000);
resizeCanvas();
initializePreview();
new ResizeObserver(resizeCanvas).observe(canvas);
new ResizeObserver(updateLeaderboardNamePreviews).observe(leaderboardList);
window.requestAnimationFrame(frame);
