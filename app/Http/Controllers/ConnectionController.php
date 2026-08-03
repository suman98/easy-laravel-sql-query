<?php

namespace App\Http\Controllers;

use App\DbAdapters\AdapterFactory;
use App\Http\Resources\ConnectionResource;
use App\Http\Resources\SavedQueryResource;
use App\Models\Connection;
use App\Services\CredentialCipher;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConnectionController extends Controller
{
    public function __construct(
        private AdapterFactory $adapters,
        private CredentialCipher $cipher,
    ) {}

    public function index(): Response
    {
        $connections = Connection::orderByRaw('LOWER(name)')->get();

        return Inertia::render('Connections/Index', [
            'connections' => ConnectionResource::collection($connections),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('Connections/New');
    }

    public function store(Request $request)
    {
        $data = $request->all();

        if (! trim((string) ($data['name'] ?? ''))) {
            return back()->withErrors(['error' => 'Name is required.']);
        }
        if (! in_array($data['driver'] ?? null, ['mysql', 'pgsql', 'sqlite', 'mongodb'], true)) {
            return back()->withErrors(['error' => 'Invalid driver.']);
        }
        if ($data['driver'] === 'sqlite' && ! trim((string) ($data['filePath'] ?? ''))) {
            return back()->withErrors(['error' => 'File path is required for SQLite.']);
        }
        if ($data['driver'] !== 'sqlite' && ! trim((string) ($data['database'] ?? ''))) {
            return back()->withErrors(['error' => 'Database name is required.']);
        }

        $connection = new Connection($this->prepareAttributes($data));

        try {
            $adapter = $this->adapters->makeUnsaved($connection, $data['password'] ?? '');
            $adapter->testConnection();
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => "Could not connect: {$e->getMessage()}"]);
        }

        if (! empty($data['password'])) {
            $connection->password_encrypted = $this->cipher->encrypt($data['password']);
        }

        $connection->created_at = now();
        $connection->save();

        return redirect()->route('connections.show', $connection);
    }

    public function show(Connection $connection): Response
    {
        return Inertia::render('Connections/Show', [
            'connection' => new ConnectionResource($connection),
            'savedQueries' => SavedQueryResource::collection(
                $connection->savedQueries()->orderByRaw('LOWER(name)')->get()
            ),
        ]);
    }

    public function update(Request $request, Connection $connection)
    {
        $data = $request->all();

        if (! trim((string) ($data['name'] ?? ''))) {
            return back()->withErrors(['error' => 'Name is required.']);
        }

        $connection->fill($this->prepareAttributes($data));

        if (! empty($data['password'])) {
            $connection->password_encrypted = $this->cipher->encrypt($data['password']);
        }

        $connection->save();

        return redirect()->route('connections.show', $connection);
    }

    public function destroy(Connection $connection)
    {
        $connection->delete();

        return redirect()->route('connections.index');
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
