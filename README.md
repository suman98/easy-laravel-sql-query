# SQL Query

Web-based SQL client. Connect to MySQL, PostgreSQL, or SQLite databases, browse schema, run queries, and export results — all from the browser.

## Stack

Single Laravel app using [Inertia.js](https://inertiajs.com) + React for the frontend — no separate SPA, no CORS, one server.

- **Backend:** Laravel 13, PHP 8.3+
- **Frontend:** React 19 + TypeScript, driven by Inertia (`resources/js/`)
- **Styling:** Tailwind CSS 4
- **Editor:** CodeMirror 6 (SQL syntax highlighting + autocomplete)
- **DB drivers:** MySQL, PostgreSQL, SQLite via PDO

## Features

- Connect to multiple databases at once; credentials encrypted at rest
- Table browser with schema + index inspection
- SQL editor with autocomplete (keywords, tables, columns)
- Run arbitrary SQL with a confirmation gate for write/DDL statements
- Export query results as CSV or Markdown; copy as Markdown or JSON
- Save and reuse queries per connection

## Setup

```bash
composer install
npm install

cp .env.example .env
php artisan key:generate

touch database/database.sqlite   # if using the default sqlite driver
php artisan migrate

npm run build   # or `npm run dev` for a hot-reloading dev server
php artisan serve
```

Visit `/connections` to add your first database.

### Dev workflow

```bash
composer run dev
```

Runs the PHP server, queue listener, log tailer, and Vite dev server together (via `concurrently`).

## Architecture notes

- **Page navigation** (connections list, new-connection form, analyzer shell) is handled by Inertia — routes in `routes/web.php`, controller renders in `app/Http/Controllers/ConnectionController.php`, pages in `resources/js/Pages/`.
- **In-session interactions** inside the analyzer (running queries, autocomplete, schema/table lookups, export, saved queries) stay as plain JSON endpoints under `routes/api.php` — these are live AJAX calls within a page, not full navigations, so they don't go through Inertia.
- DB-specific logic lives in `app/DbAdapters/` (one adapter per driver, behind `AdapterFactory`).

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
