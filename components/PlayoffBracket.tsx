/*
	PlayoffBracket

	Double-elimination bracket: the upper bracket (Round 1 to the Grand Final)
	above the lower bracket, with connector lines drawn in CSS

	(c) 2026 cio

	Implementation:

		- Layout comes from BRACKET_LAYOUT in lib/tournament.ts. A column with
		  `merge` pairs its matches so the pair draws the vertical join into
		  the next column; other columns feed straight across.
		- Teams dropping in from the upper bracket aren't drawn as lines; their
		  slot reads "Loser UB-SF2" until the result is in.
		- Unknown teams show their seed ("B4") or feeder ("Winner R1-1").
*/

// Modules

import Link from "next/link";
import TeamMark from "./TeamMark";
import { formatShortDate } from "@/lib/format";
import { BRACKET_LAYOUT, getPlayoffMatches } from "@/lib/tournament";
import type { ResolvedMatch, Side } from "@/lib/types";

// Constants

const PAIR_SIZE = 2;
const SEED_PATTERN = /^[A-Z]\d$/;
const GRAND_FINAL_SEEDS = ["UB", "LB"];

// UI

function StatusBadge({ match }: { match: ResolvedMatch }) {
	if (match.status === "live") return <span className="badge is-live">Live</span>;
	if (match.isProvisional) return <span className="badge is-provisional">Provisional</span>;
	if (match.status === "finished" && match.isForfeit) return <span className="badge is-provisional">Forfeit</span>;
	if (match.status === "finished") return <span className="badge is-finished">Final</span>;
	return <span>{formatShortDate(match.date)}</span>;
}

function getSeedLabel(match: ResolvedMatch, side: Side): string {
	if (match.id === "GF") return GRAND_FINAL_SEEDS[side];
	const label = match.slots[side].label;
	return SEED_PATTERN.test(label) ? label : "";
}

function BracketRow({ match, side }: { match: ResolvedMatch; side: Side }) {
	const slot = match.slots[side];
	const isWinner = match.winner === side;
	const isLoser = match.winner !== null && !isWinner;
	const hasScore = match.status !== "upcoming";

	return (
		<div className={`bracket-row${isWinner ? " is-winner" : ""}${isLoser ? " is-loser" : ""}`}>
			<span className="seed">{getSeedLabel(match, side)}</span>
			<div className="team-cell">
				<TeamMark team={slot.team} size={22} />
				{slot.team ? <span className="team-name">{slot.team.name}</span> : <span className="tbd">{slot.label}</span>}
				{match.advantage[side] > 0 && (
					<span className="adv" title="Upper-bracket advantage: starts with this many maps won">
						+{match.advantage[side]}
					</span>
				)}
			</div>
			<span className="score num">{hasScore ? match.mapScore[side] : "–"}</span>
		</div>
	);
}

function BracketMatch({ match }: { match: ResolvedMatch }) {
	return (
		<Link href={`/match/${match.id}`} className={`bracket-match${match.id === "GF" ? " is-final" : ""}`}>
			<div className="bracket-match-head">
				<span>
					{match.id} · BO{match.bestOf}
				</span>
				<StatusBadge match={match} />
			</div>
			<BracketRow match={match} side={0} />
			<BracketRow match={match} side={1} />
		</Link>
	);
}

function chunk<T>(list: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

export default function PlayoffBracket() {
	const matches = getPlayoffMatches();

	return (
		<div className="brackets">
			{BRACKET_LAYOUT.map((bracket) => (
				<section key={bracket.name}>
					<div className="bracket-title">{bracket.name}</div>
					<div className="bracket-scroll">
						<div className="bracket" style={{ ["--columns" as string]: bracket.columns.length }}>
							{bracket.columns.map((column) => {
								const columnMatches = column.slots.map((slot) => matches.get(slot) as ResolvedMatch);
								return (
									<div key={column.name} className="bracket-col">
										<div className="bracket-col-head">
											<span>{column.name}</span>
											<span>BO{columnMatches[0]?.bestOf}</span>
										</div>
										<div className="bracket-body">
											{chunk(columnMatches, column.merge ? PAIR_SIZE : 1).map((group) => (
												<div key={group[0].id} className={`bracket-pair${column.merge ? "" : " is-straight"}`}>
													{group.map((match) => (
														<div key={match.id} className="bracket-slot">
															<BracketMatch match={match} />
														</div>
													))}
												</div>
											))}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</section>
			))}
		</div>
	);
}
