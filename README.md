# SQL Query

Web-based database client. Connect to MySQL, PostgreSQL, SQLite, or MongoDB, browse schema, run queries, and export results — all from the browser.

## Stack

Single Laravel app using [Inertia.js](https://inertiajs.com) + React for the frontend — no separate SPA, no CORS, one server.

- **Backend:** Laravel 13, PHP 8.3+
- **Frontend:** React 19 + TypeScript, driven by Inertia (`resources/js/`)
- **Styling:** Tailwind CSS 4
- **Editor:** CodeMirror 6 (SQL syntax highlighting for SQL drivers, JS-mode highlighting for Mongo shell syntax)
- **DB drivers:** MySQL, PostgreSQL, SQLite via PDO; MongoDB via `mongodb/mongodb`

## Features

- Connect to multiple databases at once; credentials encrypted at rest
- Table/collection browser with schema + index inspection
- Query editor with autocomplete (keywords, tables/collections, columns/fields)
- Run arbitrary queries with a confirmation gate for write/DDL statements
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

### MongoDB support

Requires the native `mongodb` PHP extension (`pecl install mongodb`, or via your platform's package manager) — the `mongodb/mongodb` composer package alone isn't enough, it wraps the extension.

The query editor for a Mongo connection accepts `mongosh`-style shell syntax, not SQL:

```js
db.users.find({ status: "A" }, { name: 1 }).sort({ name: 1 }).limit(20)
db.orders.find({ _id: ObjectId("64b64f9e2f8b9a0012345678") })
db.users.updateOne({ _id: ObjectId("...") }, { $set: { status: "B" } })
db.sales.aggregate([{ $match: { status: "A" } }, { $group: { _id: "$cust", total: { $sum: "$amount" } } }])
```

Supported methods: `find`, `findOne`, `aggregate`, `countDocuments`, `estimatedDocumentCount`, `distinct`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `drop`, plus chained `.limit()`/`.skip()`/`.sort()` on `find()`. `ObjectId("...")` and `ISODate("...")`/`new Date("...")` literals are supported.

Caveats: the query text is parsed with a lightweight JS-object parser (`App\Support\MongoQueryParser`), not a full JS engine — stick to standard filter/update syntax; avoid JS expressions, variables, or comments inside the query. Auth defaults to `authSource=<database>` (the connection's target database), matching how most self-hosted Mongo users are created; there's no field in the connection form to override it.

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
