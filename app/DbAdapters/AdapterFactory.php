<?php

namespace App\DbAdapters;

use App\Models\Connection;
use App\Services\CredentialCipher;
use RuntimeException;

class AdapterFactory
{
    public function __construct(private CredentialCipher $cipher) {}

    public function make(Connection $connection): DbAdapter
    {
        $password = $connection->password_encrypted
            ? $this->cipher->decrypt($connection->password_encrypted)
            : '';

        return $this->build($connection, $password);
    }

    /**
     * Build an adapter from a plaintext password for a not-yet-persisted
     * connection (used to test-connect before saving).
     */
    public function makeUnsaved(Connection $connection, string $plaintextPassword): DbAdapter
    {
        return $this->build($connection, $plaintextPassword);
    }

    private function build(Connection $connection, string $password): DbAdapter
    {
        return match ($connection->driver) {
            'pgsql' => new PostgresAdapter($connection, $password),
            'mysql' => new MysqlAdapter($connection, $password),
            'sqlite' => new SqliteAdapter($connection),
            'mongodb' => new MongoAdapter($connection, $password),
            default => throw new RuntimeException("Unsupported driver: {$connection->driver}"),
        };
    }
}
