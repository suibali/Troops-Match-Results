/*
	not-found.tsx

	404 for unknown match ids

	(c) 2026 cio
*/

// Modules

import Link from "next/link";

// UI

export default function NotFound() {
	return (
		<div className="container">
			<div className="empty-state" style={{ marginTop: 48 }}>
				<div className="display">Match not found</div>
				<Link href="/" style={{ color: "var(--accent)" }}>
					Back to the bracket
				</Link>
			</div>
		</div>
	);
}
