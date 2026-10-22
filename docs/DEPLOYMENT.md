# GitHub Pages deployment

The application is hosted directly from this repository through GitHub Pages:

**https://krishnuni.github.io/search-atlas/**

The README embeds actual application screenshots. The full application also runs locally after cloning; no external application service or API key is required.

## Verification before deployment

The repository's verification workflow installs locked dependencies, runs correctness tests, builds the production bundle and executes browser/accessibility checks. Only a successful main-branch verification uploads the static Pages artifact and permits the deployment job to run. Pull requests run verification without publishing.

The deployment job receives only the GitHub Pages and OIDC permissions needed by GitHub's official Pages action. No deployment credentials are stored in source. GitHub records deployments in the repository's github-pages environment.

## Build and run locally

Run `npm ci` and `npm run dev` for local development, or `npm run build` and `npm run preview` for the static production build.

The build uses relative asset paths, including its favicon, so it supports the `/search-atlas/` project path. Web Workers and fonts are served from the same origin. Browser storage and URL-fragment sharing need no database.

The previous hosting configuration was removed and the earlier hosted copy was made private at the author's request. GitHub Pages is the public demo location.
