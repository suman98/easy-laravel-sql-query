<?php

namespace App\DbAdapters;

/**
 * SQL adapters that support editing result rows in place.
 */
interface EditableAdapter
{
    /**
     * Apply the driver's identifier folding rules (e.g. Postgres lowercases
     * unquoted names) so a name parsed from SQL matches the catalog.
     */
    public function normalizeIdentifier(string $name, bool $quoted): string;

    /**
     * Look up a base table by its catalog name. A null schema means the
     * connection's default. Returns null when it is not an editable table.
     *
     * @return null|array{schema: string, table: string, columns: string[], primaryKey: string[]}
     */
    public function describeTable(?string $schema, string $table): ?array;

    public function quoteIdentifier(string $name): string;

    public function quoteLiteral(mixed $value): string;

    /**
     * Run the statements in one transaction; rolls back on any failure.
     *
     * @param  array<int, array{sql: string, params: array<int, mixed>}>  $statements
     * @return int total affected rows
     */
    public function executeStatements(array $statements): int;
}
