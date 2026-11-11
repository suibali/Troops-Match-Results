/*
	OperatorIcon

	Operator badge from the r6operators icon set, with a text fallback for
	operators the package doesn't know yet

	(c) 2026 cio
*/

// Modules

import { getOperatorSvg } from "@/lib/format";

// Constants

const FALLBACK_LETTERS = 3;

// UI

export default function OperatorIcon({ name, rounds }: { name: string; rounds?: number }) {
	const svg = getOperatorSvg(name);
	const title = rounds ? `${name} · ${rounds} round${rounds === 1 ? "" : "s"}` : name;

	if (!svg) {
		return (
			<span className="op-icon is-unknown" title={title}>
				{name.slice(0, FALLBACK_LETTERS).toUpperCase()}
			</span>
		);
	}
	return <span className="op-icon" title={title} dangerouslySetInnerHTML={{ __html: svg }} />;
}
