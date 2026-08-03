<?php

namespace App\Http\Controllers\Api;

use App\DbAdapters\AdapterFactory;
use App\Http\Controllers\Controller;
use App\Http\Resources\ConnectionResource;
use App\Models\Connection;
use App\Services\CredentialCipher;
use Illuminate\Http\Request;

class ConnectionController extends Controller
{
    public function __construct(
        private AdapterFactory $adapters,
        private CredentialCipher $cipher,
    ) {}

    public function index()
    {
        $connections = Connection::orderByRaw('LOWER(name)')->get();

        return response()->json(['connections' => ConnectionResource::collection($connections)]);
    }

    public function store(Request $request)
    {
        $data = $request->all();

        if (! trim((string) ($data['name'] ?? ''))) {
            return response()->json(['error' => 'Name is required.'], 400);
        }
        if (! in_array($data['driver'] ?? null, ['mysql', 'pgsql', 'sqlite'], true)) {
            return response()->json(['error' => 'Invalid driver.'], 400);
        }
        if ($data['driver'] === 'sqlite' && ! trim((string) ($data['filePath'] ?? ''))) {
            return response()->json(['error' => 'File path is required for SQLite.'], 400);
        }
        if ($data['driver'] !== 'sqlite' && ! trim((string) ($data['database'] ?? ''))) {
            return response()->json(['error' => 'Database name is required.'], 400);
        }

        $connection = new Connection($this->prepareAttributes($data));

        try {
            $adapter = $this->adapters->makeUnsaved($connection, $data['password'] ?? '');
            $adapter->testConnection();
        } catch (\Throwable $e) {
            return response()->json(['error' => "Could not connect: {$e->getMessage()}"], 422);
        }

        if (! empty($data['password'])) {
            $connection->password_encrypted = $this->cipher->encrypt($data['password']);
        }

        $connection->created_at = now();
        $connection->save();

        return response()->json(['connection' => new ConnectionResource($connection)], 201);
    }

    public function show(Connection $connection)
    {
        return response()->json(['connection' => new ConnectionResource($connection)]);
    }

    public function update(Request $request, Connection $connection)
    {
        $data = $request->all();

        if (! trim((string) ($data['name'] ?? ''))) {
            return response()->json(['error' => 'Name is required.'], 400);
        }

        $connection->fill($this->prepareAttributes($data));

        if (! empty($data['password'])) {
            $connection->password_encrypted = $this->cipher->encrypt($data['password']);
        }

        $connection->save();

        return response()->json(['connection' => new ConnectionResource($connection)]);
    }

    public function destroy(Connection $connection)
    {
        $connection->delete();

        return response()->json(['ok' => true]);
    }

    private function prepareAttributes(array $data): array
    {
        $isSqlite = $data['driver'] === 'sqlite';

        return [
            'name' => trim((string) $data['name']),
            'driver' => $data['driver'],
            'host' => $isSqlite ? null : (trim((string) ($data['host'] ?? '')) ?: null),
            'port' => $isSqlite ? null : ($data['port'] ? (int) $data['port'] : null),
            'database' => $isSqlite ? null : (trim((string) ($data['database'] ?? '')) ?: null),
            'username' => $isSqlite ? null : (trim((string) ($data['username'] ?? '')) ?: null),
            'ssl' => $isSqlite ? false : (bool) ($data['ssl'] ?? false),
            'file_path' => $isSqlite ? (trim((string) ($data['filePath'] ?? '')) ?: null) : null,
        ];
    }
}
