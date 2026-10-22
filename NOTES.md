# Notes

Fill this in as you go — it carries as much weight in review as the code.
Keep it short; bullets are fine.

## What I completed

<!-- Required items done, and anything from the optional list. -->

## What I left out, and why

<!-- Scope you consciously cut. Naming a trade-off reads better than silence. -->

## Decisions and trade-offs

<!-- Structure, state management, where filtering happens, what you tested and
     what you didn't, any library you added and why. -->

## If I had another day

<!-- What you would do next, in priority order. -->

## Anything you should know to run it

<!-- Deviations from `npm install && npm run dev`, if any. -->

# Tasks

Feel free to ignore this section, it's my task list to organize my progress and thoughts.

- [x] **Before you start:** Review requirements deeply, make a plan and write tasks down. ➕ 2026-10-25 ✅ 2026-10-25

- [x] **Step 0: Initialise the repository:** Initialize Git repo, select Node 24, leave `README.md` empty, and set up the `NOTES.md` progress log. ➕ 2026-10-15 ✅ 2026-10-15

- [x] **Step 1: Tooling:** Configure TypeScript, NestJS, ESLint, Prettier, and Jest; add the required scripts and verify the initial setup. ➕ 2026-10-21 ✅ 2026-10-21

See:
- https://docs.nestjs.com/first-steps
- https://dev.to/micalevisk/5-steps-to-create-a-bare-minimum-nestjs-app-from-scratch-5c3b

- [x] **Step 2: Building blocks:** Add error classes, retry with backoff, and concurrency helpers; run type, lint, and unit-test checks. ➕ 2026-10-21 ✅ 2026-10-21

- [x] **Step 3: Configuration:** Add validated environment settings for environment, port, and host; add config tests and `.env.example` file. ➕ 2026-10-21 ✅ 2026-10-21

See: [Configuration | NestJS - A progressive Node.js framework](https://docs.nestjs.com/application/configuration).

- [x] **Step 4: Domain model:** Add catalog models, repository contracts, the catalog combiner, and in-memory repositories. ➕ 2026-10-21 ✅ 2026-10-21

_Decisions:_ will use a layered structure (domain → application → infrastructure → presentation). The domain has no framework imports. Repository contracts are abstract classes in the domain, which lets NestJS inject them without string tokens and lets unit tests use in-memory fakes.

- [x] **Step 5: XML parser:** Add validated XML parsing and vPIC XML fixtures. ➕ 2026-10-21 ✅ 2026-10-21

See: [NaturalIntelligence/fast-xml-parser: Validate XML, Parse XML and Build XML rapidly without C/C++ based libraries and no callback.](https://github.com/NaturalIntelligence/fast-xml-parser).

- [x] **Step 6: Transformers:** Convert parsed vPIC responses into domain objects; verify transformer coverage reaches 100%. ➕ 2026-10-21 ✅ 2026-10-21

- [x] **Step 7: Structured logging:** Add Pino logging and logging configuration, including development settings. ➕ 2026-10-21 ✅ 2026-10-22

See:
- [Logger | NestJS](https://docs.nestjs.com/application/logger) and [Use external logger | NestJS](https://docs.nestjs.com/application/logger#use-external-logger)
- [Pino with Web Frameworks (Nest)](https://getpino.io/#/docs/web?id=nest)

- [ ] **Step 8: vPIC HTTP client:** Add the fetch-based client with timeouts, retries, cancellation, and mocked API tests. ➕ 2026-10-21
- [ ] **Step 9: Persistence:** Add TypeORM entities and repositories, database migration, SQLite/PostgreSQL configuration, and persistence integration tests. ➕ 2026-10-21
- [ ] **Step 10: Use cases:** Add the ingestion pipeline, startup ingestion behavior, catalog queries, and related configuration. ➕ 2026-10-21
- [ ] **Step 11: GraphQL API and health check:** Add GraphQL types, resolvers, DataLoader, error formatting and logging, plus the health endpoint. ➕ 2026-10-21

- [ ] **Step 12: Wire everything together:** Connect modules and dependencies, ~~bootstrap the app~~, handle graceful shutdown, run it, and verify GraphQL and ingestion. ➕ 2026-10-21

- [ ] **Step 13: End-to-end tests:** Test ingestion through persistence and GraphQL using a fake vPIC server; verify the e2e suite. ➕ 2026-10-21
- [ ] **Step 14: Docker:** Add the Dockerfile and Compose stack; build and smoke-test the container and PostgreSQL setup. ➕ 2026-10-21
- [ ] **Step 15: GitHub Actions CI:** Add the workflow for quality checks, SQLite/PostgreSQL e2e tests, and Docker build and smoke test. ➕ 2026-10-21
- [ ] **Step 16: Documentation:** Add the README and architecture documentation; read both through as a final review. ➕ 2026-10-21
- [ ] **Step 17: Review `NOTES.md`:** Check requirements, prioritize deferred work, clarify decisions and run instructions, remove template comments, then run the final quality gates and build. ➕ 2026-10-21