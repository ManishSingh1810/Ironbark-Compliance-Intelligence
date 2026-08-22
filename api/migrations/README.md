# SQL migrations

These files use **PostgreSQL** syntax (`CREATE TYPE … AS ENUM`, `CREATE EXTENSION`, `gen_random_uuid()`, etc.).

Editor SQL linters may flag PostgreSQL-only syntax if they assume T-SQL. That is not proof of an error.

**The migration is not validated until it succeeds against PostgreSQL:**

```bash
cp .env.example .env
# set DATABASE_URL, then:
npm run migrate
```

A successful run creates all tables and records `001_initial_schema.sql` in `schema_migrations`. Running `npm run migrate` again should skip already-applied files.
