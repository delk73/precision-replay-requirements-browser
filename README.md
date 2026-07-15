# Precision Replay Requirements Browser

A read-only browser for inspecting precision-replay requirements and traceability data from a fresh repository snapshot.

The app parses HLR and LLR Markdown definitions, traceability matrix rows, evidence paths, parser audit findings, work packets, and branch comparison deltas. It is intended to make requirement coverage easier to review without manually moving between multiple Markdown files.

## Features

- Browse parsed HLR and LLR requirements from `docs/normative` and `docs/design`.
- Inspect traceability matrix rows with source file and line references.
- Review linked HLR, LLR, matrix row, and evidence-path context.
- Compare a base branch against another branch from the same GitHub repository.
- Group related requirements and matrix rows into work packets.
- Surface parser audit findings for missing, mismatched, or referenced-only IDs.

## Prerequisites

- Node.js
- npm
- Git available on your `PATH`

The app clones/fetches GitHub snapshots through `git`, then parses files from the resolved commit SHA.

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the local URL printed by the server, usually:

   ```text
   http://localhost:3000
   ```

By default the app scans `https://github.com/delk73/precision-replay.git` at `main`. You can change the repository URL and branch in the browser UI.

## Scripts

- `npm run dev` - start the Express/Vite development server.
- `npm run build` - build the frontend for production.
- `npm run preview` - preview the production build.
- `npm run lint` - run the TypeScript type check.
- `npm run test` - run parser and highlighting tests.

## Configuration

The server uses `PORT` when set, otherwise it listens on port `3000`.

```bash
PORT=3000 npm run dev
```

No external AI API key is required for the current app.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
