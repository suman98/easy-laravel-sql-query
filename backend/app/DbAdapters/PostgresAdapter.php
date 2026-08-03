<?php

namespace App\DbAdapters;

use App\Models\Connection;
use PDO;
use PDOException;
use RuntimeException;

class PostgresAdapter implements DbAdapter
{
    use FormatsBytes;

    private PDO $pdo;

    public function __construct(private Connection $connection, private string $password)
    {
        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s%s',
            $connection->host,
            $connection->port ?: 5432,
            $connection->database,
            $connection->ssl ? ';sslmode=require' : ''
        );

        $this->pdo = new PDO($dsn, $connection->username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    public function query(string $sql): array
    {
        $stmt = $this->pdo->query($sql);

        if ($stmt->columnCount() > 0) {
            $assocRows = $stmt->fetchAll();
            $columns = $assocRows ? array_keys($assocRows[0]) : $this->columnNamesFromStatement($stmt);
            $rows = array_map(fn ($row) => array_map(fn ($c) => $row[$c], $columns), $assocRows);

            return ['columns' => $columns, 'rows' => $rows, 'rowCount' => count($rows)];
        }

        return ['columns' => [], 'rows' => [], 'rowCount' => $stmt->rowCount()];
    }

    private function columnNamesFromStatement(\PDOStatement $stmt): array
    {
        $columns = [];
        for ($i = 0; $i < $stmt->columnCount(); $i++) {
            $meta = $stmt->getColumnMeta($i);
            $columns[] = $meta['name'] ?? "col{$i}";
        }

        return $columns;
    }

    public function getTables(?string $search = null): array
    {
        $sql = <<<'SQL'
            SELECT schemaname AS table_schema,
                   tablename AS table_name,
                   pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass) AS size_bytes
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, tablename
            SQL;

        $stmt = $this->pdo->query($sql);
        $tables = [];

        foreach ($stmt->fetchAll() as $row) {
            if ($search !== null && $search !== '' &&
                stripos($row['table_name'], $search) === false &&
                stripos($row['table_schema'], $search) === false) {
                continue;
            }

            $sizeBytes = (int) $row['size_bytes'];
            $tables[] = [
                'tableSchema' => $row['table_schema'],
                'tableName' => $row['table_name'],
                'tableKey' => $row['table_schema'].'.'.$row['table_name'],
                'sizeBytes' => $sizeBytes,
                'sizeHuman' => $this->formatBytes($sizeBytes),
            ];
        }

        return $tables;
    }

    public function getTableSchema(string $schema, string $table): array
    {
        $colStmt = $this->pdo->prepare(<<<'SQL'
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = :schema AND table_name = :table
            ORDER BY ordinal_position
            SQL);
        $colStmt->execute(['schema' => $schema, 'table' => $table]);

        $columns = array_map(fn ($row) => [
            'name' => $row['column_name'],
            'type' => $row['data_type'],
            'nullable' => $row['is_nullable'],
            'default' => $row['column_default'],
        ], $colStmt->fetchAll());

        $idxStmt = $this->pdo->prepare(<<<'SQL'
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = :schema AND tablename = :table
            SQL);
        $idxStmt->execute(['schema' => $schema, 'table' => $table]);

        $indexes = array_map(fn ($row) => [
            'name' => $row['indexname'],
            'definition' => $row['indexdef'],
        ], $idxStmt->fetchAll());

        return ['columns' => $columns, 'indexes' => $indexes];
    }

    public function getAllColumnNames(): array
    {
        $stmt = $this->pdo->query(<<<'SQL'
            SELECT DISTINCT column_name
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            SQL);

        return array_column($stmt->fetchAll(), 'column_name');
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
