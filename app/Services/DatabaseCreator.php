<?php

namespace App\Services;

use App\Models\Connection;
use PDO;
use PDOException;
use RuntimeException;

class DatabaseCreator
{
    /**
     * Create the connection's target database on the server if it doesn't
     * already exist. Only meaningful for server-based drivers (mysql/pgsql);
     * sqlite creates its file lazily and Mongo creates databases lazily on
     * first write, so both are no-ops here.
     */
    public function createIfMissing(Connection $connection, string $password): void
    {
        match ($connection->driver) {
            'mysql' => $this->createMysql($connection, $password),
            'pgsql' => $this->createPostgres($connection, $password),
            default => null,
        };
    }

    private function assertSafeName(string $name): void
    {
        if (! preg_match('/^[A-Za-z0-9_]+$/', $name)) {
            throw new RuntimeException('Database name may only contain letters, numbers, and underscores.');
        }
    }

    private function createMysql(Connection $connection, string $password): void
    {
        $this->assertSafeName($connection->database);

        $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $connection->host, $connection->port ?: 3306);

        try {
            $pdo = new PDO($dsn, $connection->username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$connection->database}`");
        } catch (PDOException $e) {
            throw new RuntimeException($e->getMessage(), previous: $e);
        }
    }

    private function createPostgres(Connection $connection, string $password): void
    {
        $this->assertSafeName($connection->database);

        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=postgres%s',
            $connection->host,
            $connection->port ?: 5432,
            $connection->ssl ? ';sslmode=require' : ''
        );

        try {
            $pdo = new PDO($dsn, $connection->username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);

            $stmt = $pdo->prepare('SELECT 1 FROM pg_database WHERE datname = :name');
            $stmt->execute(['name' => $connection->database]);

            if (! $stmt->fetchColumn()) {
                $pdo->exec("CREATE DATABASE \"{$connection->database}\"");
            }
        } catch (PDOException $e) {
            throw new RuntimeException($e->getMessage(), previous: $e);
        }
    }
}
