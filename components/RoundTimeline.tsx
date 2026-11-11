/*
	RoundTimeline

	Round-by-round strip for one map. Each column is a round; the winner's
	row gets an icon for how the round was won, coloured by the side they
	were playing. Clicking a round opens its kill feed underneath.

	(c) 2026 cio

	Implementation:

		- RoundTimeline owns SelectedIndex; the strip and RoundDetail both
		  read it, nothing else holds state.
		- Rounds are passed in already resolved to match sides (0 = first
		  team), so the component never touches r6-dissect team indexes.
*/

"use client";

// Modules

import { useState } from "react";
import { WIN_CONDITION_LABEL as WIN_LABEL } from "@/lib/labels";
import type { FeedEvent, RoundSummary, Side } from "@/lib/types";

// Constants

// Regulation is two halves of HALF_LENGTH rounds; a heavier divider marks each half
const HALF_LENGTH = 6;
const REGULATION_LENGTH = HALF_LENGTH * 2;

const ROLE_CLASS = { ATTACK: "atk", DEFENSE: "def" };

// Types

export interface TimelineTeam {
	name: string;
	tag: string;
	color: string;
}

// UI

function WinIcon({ condition }: { condition: string }) {
	switch (condition) {
		case "DefusedBomb":
			return (
				<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
					<circle cx="7" cy="9.5" r="5" />
					<rect x="9.5" y="2" width="2" height="4" transform="rotate(35 10.5 4)" />
					<rect x="12" y="0.5" width="3" height="2" />
				</svg>
			);
		case "DisabledDefuser":
			return (
				<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
					<path d="M8 1 2 3.5v4C2 11 4.6 14 8 15c3.4-1 6-4 6-7.5v-4L8 1Zm-1 10L4.5 8.5l1.1-1.1L7 8.8l3.4-3.4 1.1 1.1L7 11Z" />
				</svg>
			);
		case "Time":
			return (
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
					<circle cx="8" cy="8" r="6" />
					<path d="M8 4.5V8l2.5 1.5" />
				</svg>
			);
		default:
			return (
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
					<circle cx="8" cy="8" r="5" />
					<path d="M8 0.5v4M8 11.5v4M0.5 8h4M11.5 8h4" />
				</svg>
			);
	}
}

function getRoleClass(round: RoundSummary): string {
	if (round.attacker === null) return "";
	return round.attacker === round.winner ? ROLE_CLASS.ATTACK : ROLE_CLASS.DEFENSE;
}

function isHalfBreak(roundNumber: number): boolean {
	return roundNumber === HALF_LENGTH || roundNumber === REGULATION_LENGTH;
}

function Name({ name, side, teams }: { name?: string; side?: Side; teams: [TimelineTeam, TimelineTeam] }) {
	return (
		<span className="who" style={{ color: side !== undefined ? teams[side].color : undefined }}>
			{name ?? "Unknown"}
		</span>
	);
}

function FeedLine({ event, teams }: { event: FeedEvent; teams: [TimelineTeam, TimelineTeam] }) {
	switch (event.kind) {
		case "kill":
			return (
				<span className="line">
					<Name name={event.actor} side={event.actorSide} teams={teams} />
					<span className="arrow">▸</span>
					<Name name={event.target} side={event.targetSide} teams={teams} />
					{event.headshot && <span className="hs">HS</span>}
				</span>
			);
		case "death":
			return (
				<span className="line">
					<Name name={event.actor ?? event.target} side={event.actorSide ?? event.targetSide} teams={teams} />
					<span className="muted">died</span>
				</span>
			);
		case "plant":
			return (
				<span className="line">
					<span className="event plant">Plant</span>
					<Name name={event.actor} side={event.actorSide} teams={teams} />
				</span>
			);
		case "defuse":
			return (
				<span className="line">
					<span className="event defuse">Disable</span>
					<Name name={event.actor} side={event.actorSide} teams={teams} />
				</span>
			);
		default:
			return (
				<span className="line">
					<Name name={event.actor} side={event.actorSide} teams={teams} />
					<span className="muted">{event.label}</span>
				</span>
			);
	}
}

function RoundDetail({ round, teams }: { round: RoundSummary; teams: [TimelineTeam, TimelineTeam] }) {
	const winner = teams[round.winner];
	const attacker = round.attacker !== null ? teams[round.attacker] : null;
	return (
		<div className="round-detail">
			<div className="round-detail-head">
				<span className="round-detail-title">Round {round.number}</span>
				<span className="kv">
					Winner <b style={{ color: winner.color }}>{winner.name}</b>
				</span>
				<span className="kv">
					Result <b>{WIN_LABEL[round.winCondition] ?? (round.winCondition || "—")}</b>
				</span>
				{attacker && (
					<span className="kv">
						Attack <b>{attacker.name}</b>
					</span>
				)}
				{round.site && (
					<span className="kv">
						Site <b>{round.site}</b>
					</span>
				)}
				<span className="kv">
					Score{" "}
					<b className="num">
						{round.scoreAfter[0]}–{round.scoreAfter[1]}
					</b>
				</span>
			</div>
			{round.feed.length === 0 ? (
				<div className="feed-empty">No kill feed recorded for this round.</div>
			) : (
				<ol className="feed">
					{round.feed.map((event, index) => (
						<li key={index}>
							<span className="time">{event.time}</span>
							<FeedLine event={event} teams={teams} />
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export default function RoundTimeline({ rounds, teams }: { rounds: RoundSummary[]; teams: [TimelineTeam, TimelineTeam] }) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	if (rounds.length === 0) return null;
	const selected = rounds[Math.min(selectedIndex, rounds.length - 1)];

	return (
		<div className="timeline">
			<div className="timeline-grid">
				<div className="timeline-names">
					<div>Round</div>
					{teams.map((team) => (
						<div key={team.tag}>
							<span className="swatch" style={{ background: team.color }} />
							{team.name}
						</div>
					))}
				</div>
				<div className="timeline-rounds">
					{rounds.map((round, index) => (
						<button
							key={round.number}
							type="button"
							className={`timeline-round${index === selectedIndex ? " is-selected" : ""}${isHalfBreak(round.number) && index < rounds.length - 1 ? " is-half" : ""}`}
							onClick={() => setSelectedIndex(index)}
							title={`Round ${round.number}: ${teams[round.winner].name} — ${WIN_LABEL[round.winCondition] ?? round.winCondition}`}
						>
							<div>{round.number}</div>
							{([0, 1] as const).map((side) => (
								<div key={side}>
									{round.winner === side && (
										<span className={`round-icon ${getRoleClass(round)}`}>
											<WinIcon condition={round.winCondition} />
										</span>
									)}
								</div>
							))}
						</button>
					))}
				</div>
			</div>

			<div className="timeline-legend">
				<span>
					<span className="swatch" style={{ background: "var(--attack)" }} /> Won on attack
				</span>
				<span>
					<span className="swatch" style={{ background: "var(--defense)" }} /> Won on defence
				</span>
				<span>
					<WinIcon condition="KilledOpponents" /> Elimination
				</span>
				<span>
					<WinIcon condition="DefusedBomb" /> Defuser detonated
				</span>
				<span>
					<WinIcon condition="DisabledDefuser" /> Defuser disabled
				</span>
				<span>
					<WinIcon condition="Time" /> Time
				</span>
			</div>

			<RoundDetail round={selected} teams={teams} />
		</div>
	);
}
