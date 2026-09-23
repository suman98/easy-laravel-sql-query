<?php

namespace App\Http\Controllers\Api;

use App\DbAdapters\AdapterFactory;
use App\DbAdapters\DbAdapter;
use App\Http\Controllers\Controller;
use App\Models\Connection;
use App\Services\DeepSeekClient;
use Illuminate\Http\Request;
use Throwable;

class AiQueryController extends Controller
{
    public function __construct(private AdapterFactory $adapters, private DeepSeekClient $deepseek) {}

    public function assist(Request $request, Connection $connection)
    {
        $prompt = trim((string) $request->input('prompt', ''));
        $currentSql = trim((string) $request->input('sql', ''));
        $error = trim((string) $request->input('error', ''));
        $table = trim((string) $request->input('table', ''));
        $tableSchema = trim((string) $request->input('tableSchema', ''));

        if ($prompt === '' && $currentSql === '') {
            return response()->json(['error' => 'Describe what you need, or provide a query to fix.'], 400);
        }

        $adapter = $this->adapters->make($connection);

        try {
            $schemaContext = $table !== ''
                ? $this->describeTable($adapter, $tableSchema, $table)
                : $this->describeTables($adapter);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        $dialect = match ($connection->driver) {
            'pgsql' => 'PostgreSQL',
            'mysql' => 'MySQL',
            'sqlite' => 'SQLite',
            'mongodb' => 'MongoDB (mongo shell-style query, not SQL)',
            default => $connection->driver,
        };

        $system = "You are a {$dialect} query assistant. Write or fix a single query for this database. "
            ."Reply with ONLY the query itself — no explanation, no markdown code fences, no comments.\n\n"
            ."Schema context:\n{$schemaContext}";

        $user = $this->buildUserMessage($prompt, $currentSql, $error);

        try {
            $sql = $this->deepseek->complete($system, $user);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }

        return response()->json(['sql' => $this->stripFences($sql)]);
    }

    private function buildUserMessage(string $prompt, string $currentSql, string $error): string
    {
        $parts = [];

        if ($currentSql !== '') {
            $parts[] = "Current query:\n{$currentSql}";
        }

        if ($error !== '') {
            $parts[] = "It failed with this error:\n{$error}";
        }

        $parts[] = $prompt !== ''
            ? "Instruction: {$prompt}"
            : 'Fix the query above so it runs without error.';

        return implode("\n\n", $parts);
    }

    private function describeTable(DbAdapter $adapter, string $schema, string $table): string
    {
        $info = $adapter->getTableSchema($schema, $table);

        $columns = collect($info['columns'])
            ->map(function (array $c) {
                $nullable = in_array($c['nullable'], ['YES', '1'], true) ? '' : ' not null';

                return "  - {$c['name']} ({$c['type']}){$nullable}";
            })
            ->implode("\n");

        return "Table `{$table}`:\n{$columns}";
    }

    private function describeTables(DbAdapter $adapter): string
    {
        $tables = collect($adapter->getTables())->take(50)->pluck('tableName')->implode(', ');

        return $tables !== ''
            ? "Available tables: {$tables}"
            : 'No tables found in this database.';
    }

    private function stripFences(string $sql): string
    {
        $sql = trim($sql);
        $sql = preg_replace('/^```[a-zA-Z]*\n?/', '', $sql);
        $sql = preg_replace('/```$/', '', $sql);

        return trim($sql);
    }
}
