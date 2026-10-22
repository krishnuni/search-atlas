# Deployment record

Search Atlas was deployed publicly on 22 October 2026 after local production checks passed.

- Live URL: https://search-atlas-lab.vaikrish8.chatgpt.site
- GitHub source: https://github.com/krishnuni/search-atlas
- Sites project: appgprj_6ada01d59120819193ebda6bddb59fad
- Saved version: appgprj_6ada01d59120819193ebda6bddb59fad~appgver_0ccd1539cec48191af612436e2b4e900
- Deployed source commit: 6832af47b2864f3032993febd113474c65a4ebef
- Archive content hash: sha256:6d3d412ee096fa2a87dd3123642e8243a19046335638aeb47674d24d46a683df
- Deployment state returned by Sites: succeeded.

An additional browser smoke test of the public deployment verified worker execution and the default route: 36 moves, cost 36, 125 non-goal expansions. Documentation-only publication changes after that source commit do not change the deployed application.

## Rebuild or host elsewhere

Run `npm ci` and `npm run build`, then serve `dist/` from any static host with JavaScript module and worker support. Asset paths are relative. Browser storage and URL-fragment sharing need no server-side database. Keep MIME types for JavaScript, CSS, fonts and SVG correct. If deploying below a path prefix, check the favicon path and worker asset resolution in the real hosted build.

The Sites workflow keeps deployment identity in `.openai/hosting.json`. Credentials remain outside tracked files. Never commit `.sites-runtime`, local authentication state, node_modules, test reports or deployment archives.
