# Notes

## What I completed

**Required:**

- Ingestion. 
- Persistence.
- GraphQL. 
- Tests.
- TypeScript, strict mode, layered structure. 
- Docker.
- Docs.
- Error handling. 
- Structured logging. 
- Configuration. 

**Nice to have:**

- NestJS (v12).
- Feature flags for startup ingestion and for the mutation; a `/health` endpoint; graceful shutdown that cancels an ingestion in progress.

## What I left out, and why

- **GitHub Actions CI**. Due to time available, I prioritized the rest of the requirements over this optional one.
- **Deleting makes that disappear from vPIC.** A partial or failed download could wrongly wipe good data, so rows are only added or updated. A safe version would delete only after a fully successful run ("mark and sweep").
- **Scheduled refresh with a cron job.** The data changes rarely. Startup ingestion plus the `startIngestion` mutation is enough, and an external scheduler (a Kubernetes CronJob, for example) could call the mutation at a set interval.
- **More E2E tests**. Again, as it was optional I prioritized the rest of the tasks. It would be better to have a more thorough end to end suite.
- **Authentication on the mutation.** It is not required. Instead there is a feature flag to disable it (`FEATURE_INGESTION_MUTATION=false`). In a real deployment it would sit behind authentication.

## Decisions and trade-offs

- **SQLite by default, PostgreSQL supported.** Reviewers can run everything with `npm install` and nothing else, while Compose provide a a production-style database. Only DB-neutral TypeORM features are used, and the same integration and e2e tests run on both.
- **Ingestion in the background.** A full run is about 12,000 HTTP calls (vPIC has no bulk endpoint), which takes 15–20 minutes at concurrency 10. The API starts serving immediately, and progress is visible through `latestIngestionRun`. Startup skips ingestion when the database already has data.
- **Native `fetch`** plus a small, tested retry helper (exponential backoff with jitter, retrying only 429, 5xx and network errors), with a timeout on each attempt. This avoids an HTTP library dependency.
- **Code-first GraphQL.** The TypeScript classes are the single source of truth, and `schema.gql` is generated from them.

## If I had another day

1. Delete makes that vanished from vPIC, only after a fully successful run.
2. Authentication or an API key for `startIngestion`, and rate limiting.
3. Incremental refresh: only re-fetch makes whose data is older than N days, and resume an interrupted run from its last committed batch.

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

- [x] **Step 8: vPIC HTTP client:** Add the fetch-based client with timeouts, retries, cancellation, and mocked API tests. ➕ 2026-10-21 ✅ 2026-10-22

- [x] **Step 9: Persistence:** Add TypeORM entities and repositories, database migration, SQLite/PostgreSQL configuration, and persistence integration tests. ➕ 2026-10-21 ✅ 2026-10-22

- [x] **Step 10: Use cases:** Add the ingestion pipeline, startup ingestion behavior, catalog queries, and related configuration. ➕ 2026-10-21 ✅ 2026-10-22

- [x] **Step 11: GraphQL API and health check:** Add GraphQL types, resolvers, DataLoader, error formatting and logging, plus the health endpoint. ➕ 2026-10-21 ✅ 2026-10-22

- [x] **Step 12: Wire everything together:** Connect modules and dependencies, handle graceful shutdown, run it, and verify GraphQL and ingestion. ➕ 2026-10-21 ✅ 2026-10-22

- [-] **Step 13: End-to-end tests:** Test ingestion through persistence and GraphQL using a fake vPIC server; verify the e2e suite. ➕ 2026-10-21 ❌ 2026-10-22

- [x] **Step 14: Docker:** Add the Dockerfile and Compose stack; build and smoke-test the container and PostgreSQL setup. ➕ 2026-10-21 ✅ 2026-10-22

- [-] **Step 15: GitHub Actions CI:** Add the workflow for quality checks, SQLite/PostgreSQL e2e tests, and Docker build and smoke test. ➕ 2026-10-21 ❌ 2026-10-22

- [x] **Step 16: Documentation:** Add the README and architecture documentation; read both through as a final review. ➕ 2026-10-21 ✅ 2026-10-22

- [x] **Step 17: Review `NOTES.md`:** Check requirements, prioritize work, clarify decisions and run instructions, remove template comments and files, then run the final quality gates and build. ➕ 2026-10-21 🛫 2026-10-22 ✅ 2026-10-22