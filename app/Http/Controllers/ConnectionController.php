<?php

namespace App\Http\Controllers;

use App\DbAdapters\AdapterFactory;
use App\Http\Resources\ConnectionResource;
use App\Http\Resources\SavedQueryResource;
use App\Models\Connection;
use App\Services\CredentialCipher;
use App\Services\DatabaseCreator;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ConnectionController extends Controller
{
    public function __construct(
        private AdapterFactory $adapters,
        private CredentialCipher $cipher,
        private DatabaseCreator $databaseCreator,
    ) {}

    public function index(): Response
    {
        $connections = Connection::orderBy('position')->orderByRaw('LOWER(name)')->get();

        return Inertia::render('Connections/Index', [
            'connections' => ConnectionResource::collection($connections),
        ]);
    }

    public function reorder(Request $request)
    {
        $order = $request->input('order', []);

        if (! is_array($order) || empty($order)) {
            return response()->json(['error' => 'order must be a non-empty array of connection ids.'], 422);
        }

        $ids = array_map('intval', $order);
        $existingIds = Connection::whereIn('id', $ids)->pluck('id')->all();

        foreach ($ids as $index => $id) {
            if (in_array($id, $existingIds, true)) {
                Connection::where('id', $id)->update(['position' => $index]);
            }
        }

        return response()->json(['ok' => true]);
    }

    public function create(): Response
    {
        return Inertia::render('Connections/New');
    }

    public function edit(Connection $connection): Response
    {
        return Inertia::render('Connections/Edit', [
            'connection' => new ConnectionResource($connection),
        ]);
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
        if (! empty($data['color']) && ! preg_match('/^#[0-9a-fA-F]{6}$/', $data['color'])) {
            return back()->withErrors(['error' => 'Color must be a hex value like #a1b2c3.']);
        }

        $connection = new Connection($this->prepareAttributes($data));

        if (! empty($data['createDatabase']) && in_array($connection->driver, ['mysql', 'pgsql'], true)) {
            try {
                $this->databaseCreator->createIfMissing($connection, $data['password'] ?? '');
            } catch (\Throwable $e) {
                return back()->withErrors(['error' => "Could not create database: {$e->getMessage()}"]);
            }
        }

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
        if (! empty($data['color']) && ! preg_match('/^#[0-9a-fA-F]{6}$/', $data['color'])) {
            return back()->withErrors(['error' => 'Color must be a hex value like #a1b2c3.']);
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
            'color' => trim((string) ($data['color'] ?? '')) ?: null,
        ];
    }
}
