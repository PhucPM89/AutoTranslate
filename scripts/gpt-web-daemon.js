#!/usr/bin/env node
"use strict";

const { main } = require("./gemini-web-daemon");

main().catch((error) => { console.error(`[gpt-web-daemon] FAILED: ${error.stack || error.message}`); process.exit(1); });
