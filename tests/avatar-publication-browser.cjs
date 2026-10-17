// Execute only after the final deployment is confirmed. Loads the real public
// site assets, intercepts every API/voice request, and audits avatar PWA cache.
// node tests/avatar-publication-browser.cjs
process.argv.push('--online', '--presentation-only');
require('./avatar-browser.cjs');
