/*
	TeamMark

	Square team badge: the team's logo if tournament.json has one, otherwise
	its tag on a tint of the team colour

	(c) 2026 cio
*/

// Modules

import type { ResolvedTeam } from "@/lib/types";

// Constants

const TINT_ALPHA = "26";
const BORDER_ALPHA = "80";
const TAG_FONT_SCALE = 0.42;

// UI

export default function TeamMark({ team, size = 28 }: { team: ResolvedTeam | null; size?: number }) {
	if (!team) {
		return <span className="team-mark" style={{ width: size, height: size, borderColor: "var(--line-strong)", borderStyle: "dashed" }} />;
	}

	return (
		<span
			className="team-mark"
			title={team.name}
			style={{
				width: size,
				height: size,
				fontSize: Math.round(size * TAG_FONT_SCALE),
				background: `${team.color}${TINT_ALPHA}`,
				borderColor: `${team.color}${BORDER_ALPHA}`,
			}}
		>
			{team.logo ? <img src={team.logo} alt="" /> : team.tag}
		</span>
	);
}
