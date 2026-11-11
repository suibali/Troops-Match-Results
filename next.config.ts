/*
	next.config.ts

	Static export so the site can be hosted on GitHub Pages (or any static
	host). BASE_PATH is set by the deploy workflow to "/<repo-name>" for
	project pages; leave it empty for a user site or a custom domain.

	(c) 2026 cio
*/

import type { NextConfig } from "next";

const BASE_PATH = process.env.BASE_PATH ?? "";

const config: NextConfig = {
	output: "export",
	basePath: BASE_PATH,
	// GitHub Pages serves /match/QF1/index.html for /match/QF1/
	trailingSlash: true,
};

export default config;
