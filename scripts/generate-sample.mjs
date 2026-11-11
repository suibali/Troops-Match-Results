/*
	generate-sample.mjs

	Fills tournament.json with sample results and writes fake r6-dissect
	match files to replays/sample/ so the site has something to show
	before real replays exist. Run with: npm run sample

	(c) 2026 cio

	Implementation:

		- Every team gets a hidden strength. The stronger side always wins a
		  group map, so the group tables come out with no ties and the
		  bracket below lines up with what the site works out.
		- Each map is simulated round by round: side swap after 6 rounds,
		  overtime at 6-6 to 8, kill feed, plants and defuses, then written
		  in the same shape `r6-dissect <match folder> -o match.json` emits.
		- The double-elimination bracket mirrors BRACKET in lib/tournament.ts.
		  The Lower Final is left half played and the Grand Final unplayed on
		  purpose, so the site shows every match state.
*/

// Modules

import fs from "node:fs";
import path from "node:path";

// Constants

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TOURNAMENT_PATH = path.join(ROOT, "tournament.json");
const SAMPLE_DIR = path.join(ROOT, "replays", "sample");
const SAMPLE_PREFIX = "replays/sample";

const SEED = 1337;

const STRENGTH = {
	t1: 0.75, t2: 0.4, t3: 0.9, t4: 0.55,
	t5: 0.5, t6: 0.85, t7: 0.35, t8: 0.7,
};

const ROUNDS_TO_WIN = 7;
const OT_ROUNDS_TO_WIN = 8;
const HALF_LENGTH = 6;
const ACTION_PHASE_SECONDS = 180;
const DEFUSER_SECONDS = 45;
const HEADSHOT_CHANCE = 0.55;
const ASSIST_CHANCE = 0.35;
const ROUND_STRENGTH_SCALE = 0.35;

const MAP_POOL = [
	{ name: "ClubHouseY10", id: 837214085, sites: ["2F Gym, 2F Bedroom", "1F Bar, 1F Stage", "2F CCTV Room, 2F Cash Room", "B Church, B Arsenal Room"] },
	{ name: "BankY10", id: 355496559, sites: ["2F Executive Lounge, 2F CEO Office", "1F Staff Room, 1F Open Area", "1F Tellers' Office, 1F Archives", "B Lockers, B CCTV Room"] },
	{ name: "BorderY10", id: 1756942836, sites: ["2F Armory Lockers, 2F Archives", "1F Ventilation Room, 1F Workshop", "1F Customs Inspection, 1F Supply Room", "1F Bathroom, 1F Tellers"] },
	{ name: "ChaletY10", id: 133666548, sites: ["2F Master Bedroom, 2F Office", "1F Bar, 1F Gaming Room", "1F Dining Room, 1F Kitchen", "B Wine Cellar, B Snowmobile Garage"] },
	{ name: "KafeDostoyevskyY10", id: 1378191338, sites: ["3F Bar, 3F Cocktail Lounge", "2F Fireplace Hall, 2F Mining Room", "2F Reading Room, 2F Fireplace Hall", "1F Kitchen Service, 1F Kitchen Cooking"] },
	{ name: "LairY10", id: 409316012, sites: ["2F Master Office, 2F R6 Room", "1F Bunks, 1F Briefing", "1F Armory, 1F Weapon Maintenance", "B Lab, B Lab Support"] },
	{ name: "NighthavenLabsY10", id: 288032145, sites: ["2F Command Center, 2F Server Room", "1F Kitchen, 1F Cafeteria", "1F Storage, 1F Assembly", "B Tank, B Hangar"] },
	{ name: "ConsulateY10", id: 1987654321, sites: ["2F Consul Office, 2F Meeting Room", "1F Lobby, 1F Press Room", "B Garage, B Cafeteria", "B Archives, B Tellers"] },
	{ name: "Oregon", id: 1234567890, sites: ["2F Kids Dorms, 2F Dorms Main Hall", "1F Kitchen, 1F Dining Hall", "1F Meeting Hall, 1F Kitchen", "B Laundry Room, B Supply Room"] },
	{ name: "Villa", id: 88107330328, sites: ["2F Aviator Room, 2F Games Room", "2F Trophy Room, 2F Statuary Room", "1F Living Room, 1F Library", "1F Dining Room, 1F Kitchen"] },
];

const ATTACKERS = ["Ash", "Thermite", "Hibana", "Ace", "Zofia", "Sledge", "Twitch", "Thatcher", "Iana", "Grim", "Nomad", "Buck", "Deimos", "Striker", "Maverick", "Ying"];
const DEFENDERS = ["Mira", "Jäger", "Bandit", "Kaid", "Valkyrie", "Mute", "Smoke", "Azami", "Lesion", "Melusi", "Thunderbird", "Solis", "Echo", "Sentry", "Wamai", "Rook"];

const WIN = {
	ELIMINATION: "KilledOpponents",
	DEFUSED: "DefusedBomb",
	DISABLED: "DisabledDefuser",
	TIME: "Time",
};

const FEED_TYPE = {
	Kill: 0,
	Death: 1,
	DefuserPlantStart: 2,
	DefuserPlantComplete: 3,
	DefuserDisableStart: 4,
	DefuserDisableComplete: 5,
	LocateObjective: 6,
	OperatorSwap: 7,
	Other: 10,
};

// Same shape and order as BRACKET in lib/tournament.ts
const winnerOf = (from) => ({ from, take: "winner" });
const loserOf = (from) => ({ from, take: "loser" });
const BRACKET = {
	"R1-1": { round: "R1", feeders: [{ seed: [0, 0] }, { seed: [1, 3] }] },
	"R1-2": { round: "R1", feeders: [{ seed: [1, 1] }, { seed: [0, 2] }] },
	"R1-3": { round: "R1", feeders: [{ seed: [1, 0] }, { seed: [0, 3] }] },
	"R1-4": { round: "R1", feeders: [{ seed: [0, 1] }, { seed: [1, 2] }] },
	"UB-SF1": { round: "UB-SF", feeders: [winnerOf("R1-1"), winnerOf("R1-2")] },
	"UB-SF2": { round: "UB-SF", feeders: [winnerOf("R1-3"), winnerOf("R1-4")] },
	"LB-R1-1": { round: "LB-R1", feeders: [loserOf("R1-1"), loserOf("R1-2")] },
	"LB-R1-2": { round: "LB-R1", feeders: [loserOf("R1-3"), loserOf("R1-4")] },
	"LB-QF1": { round: "LB-QF", feeders: [loserOf("UB-SF2"), winnerOf("LB-R1-1")] },
	"LB-QF2": { round: "LB-QF", feeders: [loserOf("UB-SF1"), winnerOf("LB-R1-2")] },
	"UB-F": { round: "UB-F", feeders: [winnerOf("UB-SF1"), winnerOf("UB-SF2")] },
	"LB-SF": { round: "LB-SF", feeders: [winnerOf("LB-QF1"), winnerOf("LB-QF2")] },
	"LB-F": { round: "LB-F", feeders: [loserOf("UB-F"), winnerOf("LB-SF")] },
	"GF": { round: "GF", feeders: [winnerOf("UB-F"), winnerOf("LB-F")] },
};

const DEFAULT_BEST_OF = { "R1": 1, "LB-R1": 1, "LB-QF": 1, "UB-SF": 3, "LB-SF": 3, "UB-F": 3, "LB-F": 3, "GF": 3 };

// Util

let RngState = SEED;

function random() {
	// mulberry32, so the sample is identical on every run
	RngState = (RngState + 0x6d2b79f5) | 0;
	let T = Math.imul(RngState ^ (RngState >>> 15), 1 | RngState);
	T = (T + Math.imul(T ^ (T >>> 7), 61 | T)) ^ T;
	return ((T ^ (T >>> 14)) >>> 0) / 4294967296;
}

function randomInt(min, max) {
	return min + Math.floor(random() * (max - min + 1));
}

function pick(list) {
	return list[Math.floor(random() * list.length)];
}

function shuffle(list) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function formatTime(seconds) {
	const whole = Math.max(0, Math.round(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function feedType(name) {
	return { name, id: FEED_TYPE[name] };
}

// Simulation

function getSides(roundIndex, firstAttacker) {
	// Regulation swaps after HALF_LENGTH rounds; overtime alternates every round
	const swapped = roundIndex < HALF_LENGTH * 2
		? roundIndex >= HALF_LENGTH
		: (roundIndex - HALF_LENGTH * 2) % 2 === 1;
	const attacker = swapped ? 1 - firstAttacker : firstAttacker;
	return attacker === 0 ? ["Attack", "Defense"] : ["Defense", "Attack"];
}

function simulateRound({ roundIndex, winner, sides, rosters, mapInfo, skills, favourites }) {
	const loser = 1 - winner;
	const attackIndex = sides[0] === "Attack" ? 0 : 1;
	const attackWon = winner === attackIndex;

	let winCondition = WIN.ELIMINATION;
	const roll = random();
	if (attackWon && roll < 0.35) winCondition = WIN.DEFUSED;
	if (!attackWon && roll < 0.12) winCondition = WIN.TIME;
	else if (!attackWon && roll < 0.3) winCondition = WIN.DISABLED;

	const operators = rosters.map((roster, team) =>
		roster.map((_, index) => {
			const pool = sides[team] === "Attack" ? ATTACKERS : DEFENDERS;
			const favourite = favourites[team][index][sides[team]];
			// Players mostly stick to their main, which keeps operator columns readable
			return random() < 0.7 ? favourite : pick(pool);
		}),
	);

	const alive = [new Set([0, 1, 2, 3, 4]), new Set([0, 1, 2, 3, 4])];
	const feed = [];
	const kills = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
	const heads = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
	const assists = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
	const died = [[false, false, false, false, false], [false, false, false, false, false]];
	const clutch = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];

	const loserDeaths = winCondition === WIN.ELIMINATION ? 5 : randomInt(1, 4);
	const winnerDeaths = randomInt(0, Math.min(4, loserDeaths + 1));
	let deathOrder = shuffle([
		...Array(loserDeaths).fill(loser),
		...Array(winnerDeaths).fill(winner),
	]);
	if (winCondition === WIN.ELIMINATION) {
		// Elimination means the last body to drop belongs to the losing team
		const lastLoser = deathOrder.lastIndexOf(loser);
		deathOrder.splice(lastLoser, 1);
		deathOrder.push(loser);
	}

	feed.push({ type: feedType("Other"), time: "0:00", timeInSeconds: 0, message: "Friendly Fire turned off until Action Phase" });
	const locator = pick([...alive[attackIndex]]);
	const locateSeconds = randomInt(10, 40);
	feed.push({ type: feedType("LocateObjective"), username: rosters[attackIndex][locator], time: formatTime(locateSeconds), timeInSeconds: locateSeconds });
	feed.push({ type: feedType("Other"), time: "2:59", timeInSeconds: 179, message: "Friendly Fire is now active" });

	const plantsThisRound = winCondition === WIN.DEFUSED || winCondition === WIN.DISABLED || (attackWon && random() < 0.3);
	const plantAfterDeath = Math.min(deathOrder.length - 1, randomInt(1, Math.max(1, deathOrder.length - 2)));

	let clock = ACTION_PHASE_SECONDS - randomInt(4, 25);
	let planted = false;
	let clutchCandidate = null;

	deathOrder.forEach((victimTeam, deathIndex) => {
		if (plantsThisRound && !planted && deathIndex === plantAfterDeath) {
			const planter = pick([...alive[attackIndex]]);
			clock -= randomInt(5, 20);
			feed.push({ type: feedType("DefuserPlantStart"), username: rosters[attackIndex][planter], time: formatTime(clock), timeInSeconds: Math.round(clock) });
			clock -= 7;
			feed.push({ type: feedType("DefuserPlantComplete"), username: rosters[attackIndex][planter], time: formatTime(clock), timeInSeconds: Math.round(clock) });
			planted = true;
			// After the plant the in-game clock becomes the defuser timer
			clock = DEFUSER_SECONDS;
		}
		const killerTeam = 1 - victimTeam;
		if (alive[victimTeam].size === 0 || alive[killerTeam].size === 0) return;

		const victim = pick([...alive[victimTeam]]);
		const killerPool = [...alive[killerTeam]];
		const weighted = killerPool.flatMap((index) => Array(Math.max(1, Math.round(skills[killerTeam][index] * 10))).fill(index));
		const killer = pick(weighted);
		const headshot = random() < HEADSHOT_CHANCE;

		clock -= randomInt(3, planted ? 6 : 22);
		feed.push({
			type: feedType("Kill"),
			username: rosters[killerTeam][killer],
			target: rosters[victimTeam][victim],
			headshot,
			time: formatTime(clock),
			timeInSeconds: Math.max(0, Math.round(clock)),
		});
		alive[victimTeam].delete(victim);
		died[victimTeam][victim] = true;
		kills[killerTeam][killer] += 1;
		if (headshot) heads[killerTeam][killer] += 1;
		const helpers = [...alive[killerTeam]].filter((index) => index !== killer);
		if (helpers.length > 0 && random() < ASSIST_CHANCE) assists[killerTeam][pick(helpers)] += 1;

		if (alive[winner].size === 1 && clutchCandidate === null && alive[loser].size > 0) {
			clutchCandidate = { player: [...alive[winner]][0], versus: alive[loser].size };
		}
	});

	if (winCondition === WIN.DISABLED) {
		const defender = pick([...alive[winner]]);
		clock = Math.max(2, clock - randomInt(3, 12));
		feed.push({ type: feedType("DefuserDisableStart"), username: rosters[winner][defender], time: formatTime(clock), timeInSeconds: Math.round(clock) });
		clock = Math.max(0, clock - 7);
		feed.push({ type: feedType("DefuserDisableComplete"), username: rosters[winner][defender], time: formatTime(clock), timeInSeconds: Math.round(clock) });
	}

	if (clutchCandidate && alive[winner].has(clutchCandidate.player) && alive[winner].size === 1) {
		clutch[winner][clutchCandidate.player] = clutchCandidate.versus;
	}

	return {
		winCondition,
		site: pick(mapInfo.sites),
		operators,
		feed,
		stats: rosters.flatMap((roster, team) =>
			roster.map((username, index) => ({
				username,
				score: kills[team][index] * 100 + assists[team][index] * 50,
				kills: kills[team][index],
				died: died[team][index],
				assists: assists[team][index],
				headshots: heads[team][index],
				headshotPercentage: kills[team][index] === 0 ? 0 : (heads[team][index] / kills[team][index]) * 100,
				...(clutch[team][index] > 0 ? { "1vX": clutch[team][index] } : {}),
			})),
		),
	};
}

function getRoundWinner(score, strengths, mustWin) {
	const edge = (strengths[0] - strengths[1]) * ROUND_STRENGTH_SCALE;
	let chance = 0.5 + edge;
	// Keep the designated map winner on course without making every map a stomp
	const leader = mustWin;
	if (score[leader] < score[1 - leader] - 1) chance = leader === 0 ? 0.8 : 0.2;
	return random() < chance ? 0 : 1;
}

function simulateMap({ teams, rosters, mapInfo, strengths, mustWin, matchId }) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const skills = rosters.map(() => [0, 1, 2, 3, 4].map(() => 0.6 + random() * 0.8));
		const favourites = rosters.map(() =>
			[0, 1, 2, 3, 4].map(() => ({ Attack: pick(ATTACKERS), Defense: pick(DEFENDERS) })),
		);
		const firstAttacker = random() < 0.5 ? 0 : 1;
		const score = [0, 0];
		const rounds = [];

		while (true) {
			const isOvertime = score[0] >= HALF_LENGTH && score[1] >= HALF_LENGTH;
			const target = isOvertime ? OT_ROUNDS_TO_WIN : ROUNDS_TO_WIN;
			if (score[0] >= target || score[1] >= target) break;
			const roundIndex = rounds.length;
			const sides = getSides(roundIndex, firstAttacker);
			const winner = getRoundWinner(score, strengths, mustWin);
			score[winner] += 1;
			const round = simulateRound({ roundIndex, winner, sides, rosters, mapInfo, skills, favourites });
			rounds.push({ winner, sides, scoreAfter: [...score], round });
		}

		const mapWinner = score[0] > score[1] ? 0 : 1;
		if (mapWinner !== mustWin) continue;
		return buildDissectFile({ teams, rosters, mapInfo, rounds, matchId });
	}
	throw new Error(`Could not simulate ${matchId}`);
}

function buildDissectFile({ rosters, mapInfo, rounds, matchId }) {
	const baseTime = Date.parse("2026-11-21T17:00:00Z");
	const matchUuid = `sample-${matchId}`;
	const playerIds = rosters.map((roster, team) => roster.map((_, index) => String(team * 10 + index + 1)));

	const roundOut = rounds.map((entry, roundIndex) => ({
		gameVersion: "Y11S3",
		codeVersion: 0,
		timestamp: new Date(baseTime + roundIndex * 240000).toISOString(),
		matchType: { name: "CustomGameLocal", id: 7 },
		map: { name: mapInfo.name, id: mapInfo.id },
		site: entry.round.site,
		recordingPlayerID: 0,
		additionalTags: "",
		gamemode: { name: "Bomb", id: 327933806 },
		roundsPerMatch: 12,
		roundsPerMatchOvertime: 3,
		roundNumber: roundIndex,
		overtimeRoundNumber: Math.max(0, roundIndex - 11),
		teams: [0, 1].map((team) => ({
			name: team === 0 ? "YOUR TEAM" : "OPPONENTS",
			startingScore: entry.scoreAfter[team] - (entry.winner === team ? 1 : 0),
			score: entry.scoreAfter[team],
			won: entry.winner === team,
			...(entry.winner === team ? { winCondition: entry.round.winCondition } : {}),
			role: entry.sides[team],
		})),
		players: rosters.flatMap((roster, team) =>
			roster.map((username, index) => ({
				profileID: `profile-${playerIds[team][index]}`,
				username,
				teamIndex: team,
				operator: { name: entry.round.operators[team][index], id: 0 },
				alliance: team,
			})),
		),
		gmSettings: [],
		matchID: matchUuid,
		matchFeedback: entry.round.feed,
		stats: entry.round.stats,
	}));

	const totals = new Map();
	for (const round of roundOut) {
		for (const stat of round.stats) {
			const current = totals.get(stat.username) ?? { username: stat.username, rounds: 0, kills: 0, deaths: 0, assists: 0, headshots: 0, headshotPercentage: 0 };
			current.rounds += 1;
			current.kills += stat.kills;
			current.deaths += stat.died ? 1 : 0;
			current.assists += stat.assists;
			current.headshots += stat.headshots;
			current.headshotPercentage = current.kills === 0 ? 0 : (current.headshots / current.kills) * 100;
			totals.set(stat.username, current);
		}
	}

	return { rounds: roundOut, stats: [...totals.values()] };
}

// Tournament

function getStandings(tournament, group) {
	const wins = Object.fromEntries(group.teams.map((id) => [id, 0]));
	for (const match of tournament.groupMatches) {
		if (!group.teams.includes(match.teams[0])) continue;
		const [a, b] = match.teams;
		wins[STRENGTH[a] > STRENGTH[b] ? a : b] += 1;
	}
	return [...group.teams].sort((a, b) => wins[b] - wins[a]);
}

function writeMatch({ tournament, matchId, teamIds, bestOf, mapsToPlay, mapPool }) {
	const teams = teamIds.map((id) => tournament.teams.find((team) => team.id === id));
	const rosters = teams.map((team) => team.players);
	const strengths = teamIds.map((id) => STRENGTH[id]);
	const favourite = strengths[0] >= strengths[1] ? 0 : 1;
	const needed = Math.floor(bestOf / 2) + 1;

	const maps = [];
	const wins = [0, 0];
	const pool = shuffle(mapPool);
	while (wins[0] < needed && wins[1] < needed && maps.length < mapsToPlay) {
		// Underdogs steal a map now and then in a series
		const underdogSteal = bestOf > 1 && wins[1 - favourite] === 0 && random() < 0.35;
		const mustWin = underdogSteal ? 1 - favourite : favourite;
		const mapInfo = pool[maps.length % pool.length];
		const file = `${matchId}-${maps.length + 1}.json`;
		const data = simulateMap({ teams, rosters, mapInfo, strengths, mustWin, matchId: `${matchId}-${maps.length + 1}` });
		fs.writeFileSync(path.join(SAMPLE_DIR, file), JSON.stringify(data, null, "\t"));
		wins[mustWin] += 1;
		maps.push({ dissect: `${SAMPLE_PREFIX}/${file}` });
	}
	return { maps, winner: wins[0] >= needed ? teamIds[0] : wins[1] >= needed ? teamIds[1] : null };
}

// Main

function main() {
	const tournament = JSON.parse(fs.readFileSync(TOURNAMENT_PATH, "utf8"));
	fs.rmSync(SAMPLE_DIR, { recursive: true, force: true });
	fs.mkdirSync(SAMPLE_DIR, { recursive: true });

	for (const match of tournament.groupMatches) {
		const group = tournament.groups.find((entry) => entry.teams.includes(match.teams[0]));
		const result = writeMatch({
			tournament,
			matchId: `${group.id}-${match.teams.join("-")}`,
			teamIds: match.teams,
			bestOf: tournament.format.groupBestOf,
			mapsToPlay: tournament.format.groupBestOf,
			mapPool: MAP_POOL,
		});
		match.maps = result.maps;
	}

	// One partial forfeit so the FF display has something to show: Team2 is
	// gifted 2 rounds on top of its replay score (4–7 becomes 6–7)
	const partialFf = tournament.groupMatches.find((match) => match.teams.join() === "t2,t4");
	if (partialFf) partialFf.maps[0].ff = { number: 2, team: "t2" };

	const [groupA, groupB] = tournament.groups.map((group) => getStandings(tournament, group));
	const seeds = [groupA, groupB];
	const bestOf = (round) => {
		const setting = tournament.format.playoffBestOf;
		if (typeof setting === "number") return setting;
		return setting?.[round] ?? DEFAULT_BEST_OF[round];
	};

	const results = {};
	const teamFor = (feeder) => {
		if (feeder.seed) return seeds[feeder.seed[0]][feeder.seed[1]];
		const result = results[feeder.from];
		return feeder.take === "winner" ? result.winner : result.loser;
	};

	for (const [slot, spec] of Object.entries(BRACKET)) {
		tournament.playoffs[slot] ??= { maps: [] };
		if (slot === "GF") {
			tournament.playoffs[slot].maps = [];
			continue;
		}
		const teamIds = spec.feeders.map(teamFor);
		const seriesLength = bestOf(spec.round);
		// The Lower Final stops after one map so the site shows a live series
		const mapsToPlay = slot === "LB-F" ? 1 : seriesLength;
		const result = writeMatch({ tournament, matchId: slot, teamIds, bestOf: seriesLength, mapsToPlay, mapPool: MAP_POOL });
		tournament.playoffs[slot].maps = result.maps;
		results[slot] = { winner: result.winner, loser: result.winner ? teamIds.find((id) => id !== result.winner) : null };
	}

	fs.writeFileSync(TOURNAMENT_PATH, `${JSON.stringify(tournament, null, "\t")}\n`);
	console.log(`Sample written: ${fs.readdirSync(SAMPLE_DIR).length} replay files`);
}

main();
