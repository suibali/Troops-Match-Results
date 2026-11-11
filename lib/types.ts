/*
	types.ts

	Shapes for tournament.json, the r6-dissect output and the resolved data
	the pages render from

	(c) 2026 cio
*/

// Types: tournament.json

export interface TeamConfig {
	id: string;
	name: string;
	tag: string;
	logo?: string;
	players: string[];
}

export interface GroupConfig {
	id: string;
	name: string;
	teams: string[];
}

// Rounds awarded by forfeit, which never appear in a replay
export interface FfConfig {
	number: number;
	team: string;
}

export interface MapConfig {
	// Optional when `dissect` is given; both are read from the replay
	name?: string;
	// Rounds won, in the same order as the match's teams (excluding FF rounds)
	score?: [number, number];
	// FF rounds for this map. With no `dissect` or `score`, the map was forfeited outright
	// Path (from the project root) to an `r6-dissect <folder> -o x.json` file
	dissect?: string;
	// Path to an end-of-map scoreboard export (.csv or .json) when there's no replay
	scoreboard?: string;
	ff?: FfConfig | FfConfig[];
}

export interface GroupMatchConfig {
	teams: [string, string];
	date?: string;
	vod?: string;
	maps: MapConfig[];
}

export interface PlayoffMatchConfig {
	date?: string;
	vod?: string;
	maps: MapConfig[];
}

export interface PointsConfig {
	win: number;
	otWin: number;
	otLoss: number;
	loss: number;
}

export type PlayoffRound = "R1" | "UB-SF" | "UB-F" | "LB-R1" | "LB-QF" | "LB-SF" | "LB-F" | "GF";

export interface FormatConfig {
	groupBestOf: number;
	// Per round; any round left out uses the default in lib/tournament.ts
	playoffBestOf?: Partial<Record<PlayoffRound, number>> | number;
	// Maps the upper-bracket team starts the Grand Final with
	grandFinalAdvantage?: number;
	roundsToWin: number;
	points: PointsConfig;
}

export interface TournamentConfig {
	name: string;
	edition?: string;
	format: FormatConfig;
	teams: TeamConfig[];
	groups: GroupConfig[];
	groupMatches: GroupMatchConfig[];
	playoffs: Partial<Record<PlayoffSlot, PlayoffMatchConfig>>;
}

export type PlayoffSlot =
	| "R1-1" | "R1-2" | "R1-3" | "R1-4"
	| "UB-SF1" | "UB-SF2" | "UB-F"
	| "LB-R1-1" | "LB-R1-2"
	| "LB-QF1" | "LB-QF2"
	| "LB-SF" | "LB-F"
	| "GF";

// Types: r6-dissect output

export type DissectRole = "Attack" | "Defense";

export interface DissectTeam {
	name: string;
	score: number;
	startingScore?: number;
	won: boolean;
	winCondition?: string;
	role?: DissectRole;
}

export interface DissectPlayer {
	username: string;
	teamIndex: number;
	operator?: { name: string; id?: number };
}

export interface DissectFeed {
	// Older builds emit a bare string, newer builds `{ name, id }`
	type: string | { name: string; id?: number };
	username?: string;
	target?: string;
	headshot?: boolean;
	time: string;
	timeInSeconds: number;
	message?: string;
	operator?: { name: string; id?: number };
}

export interface DissectRoundStat {
	username: string;
	kills: number;
	died: boolean;
	assists: number;
	headshots: number;
	headshotPercentage: number;
	"1vX"?: number;
}

export interface DissectRound {
	map: { name: string; id?: number };
	site?: string;
	roundNumber: number;
	timestamp?: string;
	teams: [DissectTeam, DissectTeam];
	players: DissectPlayer[];
	matchFeedback: DissectFeed[];
	stats: DissectRoundStat[];
}

export interface DissectMatch {
	rounds: DissectRound[];
}

// Types: resolved

export type Side = 0 | 1;
export type MatchStatus = "upcoming" | "live" | "finished";

export interface FeedEvent {
	kind: "kill" | "death" | "plant" | "defuse" | "other";
	time: string;
	actor?: string;
	actorSide?: Side;
	target?: string;
	targetSide?: Side;
	headshot?: boolean;
	label?: string;
}

export interface RoundSummary {
	number: number;
	winner: Side;
	winCondition: string;
	site?: string;
	// Which match side (0 = first team) was attacking this round
	attacker: Side | null;
	scoreAfter: [number, number];
	feed: FeedEvent[];
}

export interface PlayerCounts {
	rounds: number;
	kills: number;
	deaths: number;
	assists: number;
	headshots: number;
	entryKills: number;
	entryDeaths: number;
	kostRounds: number;
	survived: number;
	trades: number;
	clutches: number;
	plants: number;
	multiKills: number;
	operators: Record<string, number>;
}

export interface PlayerLine extends PlayerCounts {
	username: string;
	side: Side;
	rating: number;
	kpr: number;
	kost: number;
	srv: number;
	hsPct: number;
}

export interface MapStats {
	// "scoreboard" maps have player totals only: no rounds, no score
	source: "replay" | "scoreboard";
	rounds: RoundSummary[];
	players: [PlayerLine[], PlayerLine[]];
	score: [number, number] | null;
}

export interface ResolvedMap {
	index: number;
	key: string;
	displayName: string;
	image: string | null;
	// Final score, FF rounds included
	score: [number, number] | null;
	// FF rounds already counted in `score`, per side
	ffRounds: [number, number];
	// No rounds were played: the whole map is FF rounds
	isForfeit: boolean;
	winner: Side | null;
	isOvertime: boolean;
	stats: MapStats | null;
	error?: string;
}

export interface ResolvedTeam extends TeamConfig {
	color: string;
}

export interface MatchSlotTeam {
	team: ResolvedTeam | null;
	// Seed label ("A1") or feeder label ("Winner QF1") shown when the team is unknown
	label: string;
}

export interface ResolvedMatch {
	id: string;
	stage: "group" | "playoff";
	title: string;
	subtitle: string;
	bestOf: number;
	date?: string;
	vod?: string;
	slots: [MatchSlotTeam, MatchSlotTeam];
	maps: ResolvedMap[];
	// Maps won, including any head start (the Grand Final advantage)
	mapScore: [number, number];
	// Head start included in mapScore
	advantage: [number, number];
	status: MatchStatus;
	winner: Side | null;
	// Every map was forfeited
	isForfeit: boolean;
	isProvisional: boolean;
}

export interface StandingRow {
	team: ResolvedTeam;
	played: number;
	wins: number;
	losses: number;
	otWins: number;
	otLosses: number;
	points: number;
	roundsFor: number;
	roundsAgainst: number;
}
