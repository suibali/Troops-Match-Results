/*
	dissect.ts

	Turns one r6-dissect match file (one map) into round summaries and
	per-player stat lines, lined up with the tournament match's two sides.

	(c) 2026 cio

	Implementation:

		- r6-dissect numbers teams 0/1 by in-game team, which does not have to
		  match the order in tournament.json. getSideMapping counts roster
		  names on each in-game team and flips the mapping if needed.
		- readRound walks the kill feed once per round and collects raw counts
		  (kills, entries, trades, KOST, clutches, plants) into PlayerCounts.
		- Lines are only ever built from summed counts (buildLine), so the
		  overall match tab is the same maths as a single map, just with
		  more rounds.

	Rating:

		The rating is a simple, transparent stand-in for SiegeGG's rating,
		where 1.00 is an average game. It blends kills per round, survival,
		KOST and opening duels against fixed baselines, plus a small clutch
		bonus. Tweak RATING_WEIGHTS / RATING_BASELINE to taste.
*/

// Modules

import fs from "node:fs";
import path from "node:path";
import type {
	DissectFeed,
	DissectMatch,
	DissectRound,
	FeedEvent,
	MapStats,
	PlayerCounts,
	PlayerLine,
	RoundSummary,
	Side,
} from "./types";

// Constants

const TRADE_WINDOW_SECONDS = 10;
const MULTI_KILL_THRESHOLD = 2;

const RATING_WEIGHTS = {
	KPR: 0.35,
	SRV: 0.2,
	KOST: 0.3,
	ENTRY: 0.15,
};

const RATING_BASELINE = {
	KPR: 0.7,
	SRV: 0.3,
	KOST: 0.62,
};

// Opening duel swing per round is small (~±0.1), so it is scaled up to matter
const ENTRY_SWING_SCALE = 4;
const CLUTCH_BONUS_PER_ROUND = 0.5;

const FEED_KIND: Record<string, FeedEvent["kind"]> = {
	Kill: "kill",
	Death: "death",
	DefuserPlantComplete: "plant",
	DefuserDisableComplete: "defuse",
	PlayerLeave: "other",
	Battleye: "other",
};

const FEED_LABEL: Record<string, string> = {
	PlayerLeave: "left the match",
	Battleye: "was banned by BattlEye",
};

// Util

function getFeedType(event: DissectFeed): string {
	return typeof event.type === "string" ? event.type : event.type?.name ?? "Other";
}

function normaliseName(name: string): string {
	return name.trim().toLowerCase();
}

function emptyCounts(): PlayerCounts {
	return {
		rounds: 0,
		kills: 0,
		deaths: 0,
		assists: 0,
		headshots: 0,
		entryKills: 0,
		entryDeaths: 0,
		kostRounds: 0,
		survived: 0,
		trades: 0,
		clutches: 0,
		plants: 0,
		multiKills: 0,
		operators: {},
	};
}

export function addCounts(into: PlayerCounts, from: PlayerCounts): void {
	into.rounds += from.rounds;
	into.kills += from.kills;
	into.deaths += from.deaths;
	into.assists += from.assists;
	into.headshots += from.headshots;
	into.entryKills += from.entryKills;
	into.entryDeaths += from.entryDeaths;
	into.kostRounds += from.kostRounds;
	into.survived += from.survived;
	into.trades += from.trades;
	into.clutches += from.clutches;
	into.plants += from.plants;
	into.multiKills += from.multiKills;
	for (const [operator, count] of Object.entries(from.operators)) {
		into.operators[operator] = (into.operators[operator] ?? 0) + count;
	}
}

export function getRating(counts: PlayerCounts): number {
	if (counts.rounds === 0) return 0;
	const kpr = counts.kills / counts.rounds;
	const srv = counts.survived / counts.rounds;
	const kost = counts.kostRounds / counts.rounds;
	const entrySwing = (counts.entryKills - counts.entryDeaths) / counts.rounds;
	const rating =
		RATING_WEIGHTS.KPR * (kpr / RATING_BASELINE.KPR) +
		RATING_WEIGHTS.SRV * (srv / RATING_BASELINE.SRV) +
		RATING_WEIGHTS.KOST * (kost / RATING_BASELINE.KOST) +
		RATING_WEIGHTS.ENTRY * (1 + entrySwing * ENTRY_SWING_SCALE) +
		(counts.clutches * CLUTCH_BONUS_PER_ROUND) / counts.rounds;
	return Math.max(0, rating);
}

export function buildLine(username: string, side: Side, counts: PlayerCounts): PlayerLine {
	const rounds = Math.max(1, counts.rounds);
	return {
		...counts,
		username,
		side,
		rating: getRating(counts),
		kpr: counts.kills / rounds,
		kost: counts.kostRounds / rounds,
		srv: counts.survived / rounds,
		hsPct: counts.kills === 0 ? 0 : counts.headshots / counts.kills,
	};
}

export function sortLines(lines: PlayerLine[]): PlayerLine[] {
	return [...lines].sort((a, b) => b.rating - a.rating || b.kills - a.kills);
}

// Side mapping

function getSideMapping(match: DissectMatch, rosters: [string[], string[]]): [Side, Side] {
	const rosterSets = rosters.map((roster) => new Set(roster.map(normaliseName)));
	const overlap = [
		[0, 0],
		[0, 0],
	];
	const seen = new Set<string>();
	for (const round of match.rounds) {
		for (const player of round.players) {
			const key = `${player.teamIndex}:${normaliseName(player.username)}`;
			if (seen.has(key) || player.teamIndex > 1) continue;
			seen.add(key);
			for (const side of [0, 1] as const) {
				if (rosterSets[side].has(normaliseName(player.username))) overlap[player.teamIndex][side] += 1;
			}
		}
	}
	const straight = overlap[0][0] + overlap[1][1];
	const crossed = overlap[0][1] + overlap[1][0];
	return crossed > straight ? [1, 0] : [0, 1];
}

// Rounds

function getRoundWinner(round: DissectRound, previous: [number, number]): number {
	const flagged = round.teams.findIndex((team) => team.won);
	if (flagged !== -1) return flagged;
	// Older replays sometimes miss `won`; fall back to whose score went up
	return round.teams[1].score > previous[1] ? 1 : 0;
}

function readRound(
	round: DissectRound,
	roundNumber: number,
	previousScore: [number, number],
	sideOf: (dissectTeam: number) => Side,
	countsByPlayer: Map<string, { side: Side; counts: PlayerCounts; display: string }>,
): RoundSummary {
	const playerTeam = new Map<string, number>();
	const operatorOf = new Map<string, string>();
	for (const player of round.players) {
		playerTeam.set(normaliseName(player.username), player.teamIndex);
		if (player.operator?.name) operatorOf.set(normaliseName(player.username), player.operator.name);
	}

	const winnerTeam = getRoundWinner(round, previousScore);
	const winner = sideOf(winnerTeam);
	const attackTeam = round.teams.findIndex((team) => team.role === "Attack");
	const scoreAfter: [number, number] = [0, 0];
	round.teams.forEach((team, index) => {
		scoreAfter[sideOf(index)] = team.score;
	});

	const kills = new Map<string, number>();
	const objective = new Set<string>();
	const traded = new Set<string>();
	const tradeKills = new Map<string, number>();
	const plants = new Map<string, number>();
	const feed: FeedEvent[] = [];
	const killEvents: { killer: string; victim: string; seconds: number }[] = [];
	let entryKiller: string | null = null;
	let entryVictim: string | null = null;

	for (const event of round.matchFeedback ?? []) {
		const type = getFeedType(event);
		const actor = event.username ? normaliseName(event.username) : undefined;
		const target = event.target ? normaliseName(event.target) : undefined;

		if (type === "OperatorSwap" && actor && event.operator?.name) {
			operatorOf.set(actor, event.operator.name);
			continue;
		}
		if (type === "DefuserPlantComplete" && actor) {
			objective.add(actor);
			plants.set(actor, (plants.get(actor) ?? 0) + 1);
		}
		if (type === "DefuserDisableComplete" && actor) objective.add(actor);

		if (type === "Kill" && actor && target) {
			kills.set(actor, (kills.get(actor) ?? 0) + 1);
			if (entryKiller === null) {
				entryKiller = actor;
				entryVictim = target;
			}
			// A kill trades any teammate the victim killed in the last few seconds
			for (const earlier of killEvents) {
				if (earlier.killer !== target) continue;
				if (Math.abs(earlier.seconds - event.timeInSeconds) > TRADE_WINDOW_SECONDS) continue;
				if (playerTeam.get(earlier.victim) !== playerTeam.get(actor)) continue;
				traded.add(earlier.victim);
				tradeKills.set(actor, (tradeKills.get(actor) ?? 0) + 1);
			}
			killEvents.push({ killer: actor, victim: target, seconds: event.timeInSeconds });
		}

		const kind = FEED_KIND[type];
		if (!kind) continue;
		const actorTeam = actor !== undefined ? playerTeam.get(actor) : undefined;
		const targetTeam = target !== undefined ? playerTeam.get(target) : undefined;
		feed.push({
			kind,
			time: event.time,
			actor: event.username,
			actorSide: actorTeam !== undefined ? sideOf(actorTeam) : undefined,
			target: event.target,
			targetSide: targetTeam !== undefined ? sideOf(targetTeam) : undefined,
			headshot: event.headshot ?? false,
			label: FEED_LABEL[type],
		});
	}

	for (const stat of round.stats ?? []) {
		const key = normaliseName(stat.username);
		const team = playerTeam.get(key);
		if (team === undefined) continue;
		const side = sideOf(team);
		const entry = countsByPlayer.get(key) ?? { side, counts: emptyCounts(), display: stat.username };
		const counts = entry.counts;
		const roundKills = kills.get(key) ?? stat.kills;
		const survived = !stat.died;

		counts.rounds += 1;
		counts.kills += stat.kills;
		counts.deaths += stat.died ? 1 : 0;
		counts.assists += stat.assists ?? 0;
		counts.headshots += stat.headshots ?? 0;
		counts.survived += survived ? 1 : 0;
		counts.trades += tradeKills.get(key) ?? 0;
		counts.plants += plants.get(key) ?? 0;
		if (entryKiller === key) counts.entryKills += 1;
		if (entryVictim === key) counts.entryDeaths += 1;
		if (roundKills > 0 || objective.has(key) || survived || traded.has(key)) counts.kostRounds += 1;
		if (roundKills >= MULTI_KILL_THRESHOLD) counts.multiKills += 1;
		if ((stat["1vX"] ?? 0) > 0 && team === winnerTeam) counts.clutches += 1;
		const operator = operatorOf.get(key);
		if (operator) counts.operators[operator] = (counts.operators[operator] ?? 0) + 1;

		countsByPlayer.set(key, entry);
	}

	const winningTeam = round.teams[winnerTeam];
	return {
		number: roundNumber,
		winner,
		winCondition: winningTeam?.winCondition ?? "",
		site: round.site,
		attacker: attackTeam === -1 ? null : sideOf(attackTeam),
		scoreAfter,
		feed,
	};
}

// Public

export function readMapStats(match: DissectMatch, rosters: [string[], string[]]): MapStats {
	const mapping = getSideMapping(match, rosters);
	const sideOf = (dissectTeam: number): Side => mapping[dissectTeam === 1 ? 1 : 0];
	const countsByPlayer = new Map<string, { side: Side; counts: PlayerCounts; display: string }>();
	const rounds: RoundSummary[] = [];
	let previous: [number, number] = [0, 0];

	const ordered = [...match.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
	ordered.forEach((round, index) => {
		const rawPrevious: [number, number] = [round.teams[0].startingScore ?? previous[0], round.teams[1].startingScore ?? previous[1]];
		const summary = readRound(round, index + 1, rawPrevious, sideOf, countsByPlayer);
		rounds.push(summary);
		previous = [round.teams[0].score, round.teams[1].score];
	});

	const players: [PlayerLine[], PlayerLine[]] = [[], []];
	for (const { side, counts, display } of countsByPlayer.values()) {
		players[side].push(buildLine(display, side, counts));
	}

	const last = rounds[rounds.length - 1];
	return {
		rounds,
		players: [sortLines(players[0]), sortLines(players[1])],
		score: last ? last.scoreAfter : [0, 0],
	};
}

export function loadDissect(relativePath: string): DissectMatch {
	const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath);
	const raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
	// A single-round export (`-R01.rec -o round.json`) is one round object, not { rounds }
	if (Array.isArray(raw?.rounds)) return raw as DissectMatch;
	if (raw?.teams && raw?.players) return { rounds: [raw] } as DissectMatch;
	throw new Error("Not an r6-dissect match file");
}

export function readMapName(match: DissectMatch): string | null {
	return match.rounds[0]?.map?.name ?? null;
}
