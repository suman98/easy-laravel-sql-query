<?php

namespace App\DbAdapters;

use App\Models\Connection;
use PDO;
use PDOException;
use RuntimeException;

class MysqlAdapter implements DbAdapter, EditableAdapter
{
    use EditsRowsWithPdo;
    use FormatsBytes;

    private PDO $pdo;

    public function __construct(private Connection $connection, private string $password)
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $connection->host,
            $connection->port ?: 3306,
            $connection->database
        );

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];

        if ($connection->ssl) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = null;
        }

        $this->pdo = new PDO($dsn, $connection->username, $password, $options);
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
        $stmt = $this->pdo->prepare(<<<'SQL'
            SELECT table_name AS table_name, data_length + index_length AS size_bytes
            FROM information_schema.tables
            WHERE table_schema = :db
            ORDER BY table_name
            SQL);
        $stmt->execute(['db' => $this->connection->database]);

        $tables = [];
        foreach ($stmt->fetchAll() as $row) {
            if ($search !== null && $search !== '' && stripos($row['table_name'], $search) === false) {
                continue;
            }

            $sizeBytes = (int) $row['size_bytes'];
            $tables[] = [
                'tableSchema' => $this->connection->database,
                'tableName' => $row['table_name'],
                'tableKey' => $row['table_name'],
                'sizeBytes' => $sizeBytes,
                'sizeHuman' => $this->formatBytes($sizeBytes),
            ];
        }

        return $tables;
    }

    public function getTableSchema(string $schema, string $table): array
    {
        $colStmt = $this->pdo->prepare(<<<'SQL'
            SELECT column_name AS column_name, data_type AS data_type, is_nullable AS is_nullable, column_default AS column_default
            FROM information_schema.columns
            WHERE table_schema = :db AND table_name = :table
            ORDER BY ordinal_position
            SQL);
        $colStmt->execute(['db' => $this->connection->database, 'table' => $table]);

        $columns = array_map(fn ($row) => [
            'name' => $row['column_name'],
            'type' => $row['data_type'],
            'nullable' => $row['is_nullable'],
            'default' => $row['column_default'],
        ], $colStmt->fetchAll());

        $idxStmt = $this->pdo->prepare(<<<'SQL'
            SELECT index_name AS index_name, non_unique AS non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
            FROM information_schema.statistics
            WHERE table_schema = :db AND table_name = :table
            GROUP BY index_name, non_unique
            SQL);
        $idxStmt->execute(['db' => $this->connection->database, 'table' => $table]);

        $indexes = array_map(function ($row) {
            $prefix = $row['index_name'] === 'PRIMARY'
                ? 'PRIMARY KEY'
                : ((int) $row['non_unique'] === 0 ? 'UNIQUE' : 'INDEX');

            return [
                'name' => $row['index_name'],
                'definition' => "{$prefix} ({$row['cols']})",
            ];
        }, $idxStmt->fetchAll());

        return ['columns' => $columns, 'indexes' => $indexes];
    }

    public function getAllColumnNames(): array
    {
        $stmt = $this->pdo->prepare(<<<'SQL'
            SELECT DISTINCT column_name AS column_name
            FROM information_schema.columns
            WHERE table_schema = :db
            SQL);
        $stmt->execute(['db' => $this->connection->database]);

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

    public function normalizeIdentifier(string $name, bool $quoted): string
    {
        return $name;
    }

    public function quoteIdentifier(string $name): string
    {
        return '`'.str_replace('`', '``', $name).'`';
    }

    public function describeTable(?string $schema, string $table): ?array
    {
        $db = $schema ?: $this->connection->database;

        $tableStmt = $this->pdo->prepare(<<<'SQL'
            SELECT table_schema AS table_schema, table_name AS table_name
            FROM information_schema.tables
            WHERE table_schema = :db AND table_name = :table AND table_type = 'BASE TABLE'
            SQL);
        $tableStmt->execute(['db' => $db, 'table' => $table]);
        $found = $tableStmt->fetch();

        if (! $found) {
            return null;
        }

        $params = ['db' => $found['table_schema'], 'table' => $found['table_name']];

        $colStmt = $this->pdo->prepare(<<<'SQL'
            SELECT column_name AS column_name
            FROM information_schema.columns
            WHERE table_schema = :db AND table_name = :table
            ORDER BY ordinal_position
            SQL);
        $colStmt->execute($params);

        $pkStmt = $this->pdo->prepare(<<<'SQL'
            SELECT column_name AS column_name
            FROM information_schema.key_column_usage
            WHERE table_schema = :db AND table_name = :table AND constraint_name = 'PRIMARY'
            ORDER BY ordinal_position
            SQL);
        $pkStmt->execute($params);

        return [
            'schema' => $found['table_schema'],
            'table' => $found['table_name'],
            'columns' => array_column($colStmt->fetchAll(), 'column_name'),
            'primaryKey' => array_column($pkStmt->fetchAll(), 'column_name'),
        ];
    }
}
