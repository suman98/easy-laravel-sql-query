<?php

namespace App\DbAdapters;

use App\Models\Connection;
use PDO;
use PDOException;
use RuntimeException;

class SqliteAdapter implements DbAdapter
{
    use FormatsBytes;

    private PDO $pdo;

    public function __construct(private Connection $connection)
    {
        $path = $connection->file_path ?: ':memory:';

        $this->pdo = new PDO('sqlite:'.$path, options: [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    private function quoteIdent(string $ident): string
    {
        return '"'.str_replace('"', '""', $ident).'"';
    }

    public function query(string $sql): array
    {
        $trimmed = ltrim($sql);
        $isSelect = preg_match('/^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i', $trimmed) === 1;

        if ($isSelect) {
            $stmt = $this->pdo->query($sql);
            $assocRows = $stmt->fetchAll();
            $columns = $assocRows ? array_keys($assocRows[0]) : [];
            $rows = array_map(fn ($row) => array_map(fn ($c) => $row[$c], $columns), $assocRows);

            return ['columns' => $columns, 'rows' => $rows, 'rowCount' => count($rows)];
        }

        $affected = $this->pdo->exec($sql);

        return ['columns' => [], 'rows' => [], 'rowCount' => $affected === false ? 0 : $affected];
    }

    public function getTables(?string $search = null): array
    {
        $stmt = $this->pdo->query(<<<'SQL'
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
            SQL);

        $tables = [];
        foreach ($stmt->fetchAll() as $row) {
            $name = $row['name'];

            if ($search !== null && $search !== '' && stripos($name, $search) === false) {
                continue;
            }

            $sizeBytes = 0;
            try {
                $sizeStmt = $this->pdo->query(
                    "SELECT SUM(pgsize) AS bytes FROM dbstat WHERE name = '".str_replace("'", "''", $name)."'"
                );
                $sizeBytes = (int) ($sizeStmt->fetch()['bytes'] ?? 0);
            } catch (PDOException) {
                // dbstat virtual table not compiled in; leave size at 0.
            }

            $tables[] = [
                'tableSchema' => 'main',
                'tableName' => $name,
                'tableKey' => "main.{$name}",
                'sizeBytes' => $sizeBytes,
                'sizeHuman' => $this->formatBytes($sizeBytes),
            ];
        }

        return $tables;
    }

    public function getTableSchema(string $schema, string $table): array
    {
        $ident = $this->quoteIdent($table);

        $columns = array_map(fn ($row) => [
            'name' => $row['name'],
            'type' => $row['type'],
            'nullable' => $row['notnull'] ? 'NO' : 'YES',
            'default' => $row['dflt_value'],
        ], $this->pdo->query("PRAGMA table_info({$ident})")->fetchAll());

        $indexes = [];
        foreach ($this->pdo->query("PRAGMA index_list({$ident})")->fetchAll() as $idx) {
            $indexIdent = $this->quoteIdent($idx['name']);
            $cols = array_column($this->pdo->query("PRAGMA index_info({$indexIdent})")->fetchAll(), 'name');
            $prefix = (int) $idx['unique'] === 1 ? 'UNIQUE' : 'INDEX';
            $indexes[] = [
                'name' => $idx['name'],
                'definition' => "{$prefix} (".implode(', ', $cols).')',
            ];
        }

        return ['columns' => $columns, 'indexes' => $indexes];
    }

    public function getAllColumnNames(): array
    {
        $names = [];
        foreach ($this->getTables() as $table) {
            $ident = $this->quoteIdent($table['tableName']);
            foreach ($this->pdo->query("PRAGMA table_info({$ident})")->fetchAll() as $col) {
                $names[$col['name']] = true;
            }
        }

        return array_keys($names);
    }

    public function testConnection(): void
    {
        try {
            $this->pdo->query('SELECT 1');
        } catch (PDOException $e) {
            throw new RuntimeException($e->getMessage(), previous: $e);
        }
    }
}
