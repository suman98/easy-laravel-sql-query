<?php

namespace App\DbAdapters;

interface DbAdapter
{
    /**
     * @return array{columns: string[], rows: array<int, array<int, mixed>>, rowCount: int} rows are positional, matching $columns order
     */
    public function query(string $sql): array;

    /**
     * @return array<int, array{tableSchema: string, tableName: string, tableKey: string, sizeBytes: int, sizeHuman: string}>
     */
    public function getTables(?string $search = null): array;

    /**
     * @return array{columns: array<int, array{name: string, type: string, nullable: string, default: ?string}>, indexes: array<int, array{name: string, definition: string}>}
     */
    public function getTableSchema(string $schema, string $table): array;

    /**
     * @return string[]
     */
    public function getAllColumnNames(): array;

    public function testConnection(): void;
}
