/*
	format.ts

	Display helpers shared by the pages: dates, stat numbers, win conditions,
	operator icons

	(c) 2026 cio
*/

// Modules

import * as Operators from "r6operators";

// Constants

// Dates are stored in UTC in tournament.json and shown in this zone
const DISPLAY_TIMEZONE = "Europe/London";
const DISPLAY_LOCALE = "en-GB";

const RATING_GOOD = 1.15;
const RATING_POOR = 0.85;

// Util

export function formatDate(iso?: string): string {
	if (!iso) return "TBD";
	return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
		timeZone: DISPLAY_TIMEZONE,
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

export function formatShortDate(iso?: string): string {
	if (!iso) return "TBD";
	return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
		timeZone: DISPLAY_TIMEZONE,
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));
}

export function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

export function formatSigned(value: number): string {
	if (value > 0) return `+${value}`;
	return String(value);
}

export function getRatingTone(rating: number): "good" | "poor" | "even" {
	if (rating >= RATING_GOOD) return "good";
	if (rating <= RATING_POOR) return "poor";
	return "even";
}

export function getDiffTone(value: number): "good" | "poor" | "even" {
	if (value > 0) return "good";
	if (value < 0) return "poor";
	return "even";
}

// Operators

function getOperatorKey(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

export function getOperatorSvg(name: string): string | null {
	const operator = (Operators as unknown as Record<string, { toSVG?: () => string } | undefined>)[getOperatorKey(name)];
	return operator?.toSVG ? operator.toSVG() : null;
}

export function getTopOperators(operators: Record<string, number>, limit: number): string[] {
	return Object.entries(operators)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name]) => name);
}
