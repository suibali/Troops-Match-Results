/*
	page.tsx (homepage)

	Hero, group stage cross-tables and the playoff bracket

	(c) 2026 cio
*/

// Modules

import GroupTable from "@/components/GroupTable";
import PlayoffBracket from "@/components/PlayoffBracket";
import { getMapImage } from "@/lib/maps";
import { getGrandFinalAdvantage, getTournamentProgress, isGroupStageComplete, loadTournament } from "@/lib/tournament";

// Constants

const HERO_MAP = "Clubhouse";

// UI

export default function HomePage() {
	const tournament = loadTournament();
	const progress = getTournamentProgress();
	const { format } = tournament;
	const heroImage = getMapImage(HERO_MAP);

	const stats = [
		{ label: "Teams", value: tournament.teams.length },
		{ label: "Groups", value: `${tournament.groups.length} × ${tournament.groups[0].teams.length}` },
		{ label: "Group stage", value: `Round robin · BO${format.groupBestOf}` },
		{ label: "Playoffs", value: "Double elimination" },
		{ label: "Played", value: `${progress.played} / ${progress.total}` },
	];

	return (
		<>
			<section className="hero">
				{heroImage && <div className="hero-bg" style={{ backgroundImage: `url(${heroImage})` }} />}
				<div className="container hero-inner">
					<div className="eyebrow">Rainbow Six Siege{tournament.edition ? ` · ${tournament.edition}` : ""}</div>
					<h1>{tournament.name}</h1>
					<div className="hero-stats">
						{stats.map((stat) => (
							<div key={stat.label} className="hero-stat">
								<div className="hero-stat-label">{stat.label}</div>
								<div className="hero-stat-value num">{stat.value}</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="groups" className="section container">
				<div className="section-head">
					<h2>Group Stage</h2>
					<span className="rule" />
					<span className="note">
						Win {format.points.win} · OT win {format.points.otWin} · OT loss {format.points.otLoss}
					</span>
				</div>
				<div className="groups">
					{tournament.groups.map((group) => (
						<GroupTable key={group.id} group={group} />
					))}
				</div>
			</section>

			<section id="playoffs" className="section container">
				<div className="section-head">
					<h2>Playoffs</h2>
					<span className="rule" />
					<span className="note">
						{isGroupStageComplete() ? "Round 1 inverse seeded · A1–B4 · B2–A3 · B1–A4 · A2–B3" : "Round 1 follows live standings"}
						{` · UB finalist starts GF ${getGrandFinalAdvantage()}–0`}
					</span>
				</div>
				<PlayoffBracket />
			</section>
		</>
	);
}
