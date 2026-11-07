<?php

namespace App\Http\Controllers\Api;

use App\DbAdapters\AdapterFactory;
use App\DbAdapters\DbAdapter;
use App\DbAdapters\EditableAdapter;
use App\Http\Controllers\Controller;
use App\Models\Connection;
use App\Models\QueryHistory;
use App\Support\DeleteTargetResolver;
use App\Support\Exporter;
use App\Support\MongoQueryParser;
use App\Support\ResultSerializer;
use App\Support\RowUpdateBuilder;
use App\Support\SqlUtils;
use Illuminate\Http\Request;
use InvalidArgumentException;

class QueryController extends Controller
{
    public function __construct(private AdapterFactory $adapters) {}

    public function run(Request $request, Connection $connection)
    {
        $sql = trim((string) $request->input('sql', ''));

        if ($sql === '') {
            return response()->json(['error' => 'Query is empty.'], 400);
        }

        $isMongo = $connection->driver === 'mongodb';
        $isWrite = $isMongo ? MongoQueryParser::isWriteQuery($sql) : SqlUtils::isWriteQuery($sql);
        $confirmWrite = (bool) $request->input('confirmWrite', false);

        if ($isWrite && ! $confirmWrite) {
            return response()->json([
                'needsConfirm' => true,
                'isWriteQuery' => true,
                'isDdl' => $isMongo ? MongoQueryParser::isDdlQuery($sql) : SqlUtils::isDdlQuery($sql),
            ]);
        }

        $limit = max(1, min((int) $request->input('limit', 200), 1000));

        if ($isMongo) {
            $finalSql = $isWrite ? MongoQueryParser::stripTrailing($sql) : MongoQueryParser::injectLimit($sql, $limit);
        } else {
            $finalSql = $isWrite ? SqlUtils::stripTrailing($sql) : SqlUtils::injectLimit($sql, $limit);
        }

        $adapter = $this->adapters->make($connection);

        $start = microtime(true);

        try {
            $result = $adapter->query($finalSql);
        } catch (\Throwable $e) {
            QueryHistory::record($connection->id, [
                'sql' => $sql,
                'is_write' => $isWrite,
                'success' => false,
                'error' => $e->getMessage(),
                'row_count' => null,
                'execution_time' => round((microtime(true) - $start) * 1000, 2),
            ]);

            return response()->json(['error' => $e->getMessage()], 400);
        }

        $executionTime = (microtime(true) - $start) * 1000;

        QueryHistory::record($connection->id, [
            'sql' => $sql,
            'is_write' => $isWrite,
            'success' => true,
            'error' => null,
            'row_count' => $result['rowCount'],
            'execution_time' => round($executionTime, 2),
        ]);

        $edit = $isWrite || $result['columns'] === []
            ? ['editable' => null, 'reason' => null]
            : $this->detectEditable($adapter, $sql, $result['columns']);

        $deleteTargets = [];
        if (! $isWrite && $result['columns'] !== [] && $adapter instanceof EditableAdapter) {
            try {
                $deleteTargets = DeleteTargetResolver::resolve($adapter, $sql, $result['columns']);
            } catch (\Throwable) {
                $deleteTargets = [];
            }
        }

        return response()->json([
            'columns' => $result['columns'],
            'rows' => ResultSerializer::rows($result['rows']),
            'rowCount' => $result['rowCount'],
            'executionTime' => round($executionTime, 2),
            'isWriteQuery' => $isWrite,
            'editable' => $edit['editable'],
            'editReason' => $edit['reason'],
            'deleteTargets' => $deleteTargets,
        ]);
    }

    /**
     * Decide whether a SELECT's result grid can be edited in place.
     *
     * @param  string[]  $columns
     * @return array{editable: ?array, reason: ?string}
     */
    private function detectEditable(DbAdapter $adapter, string $sql, array $columns): array
    {
        if (! $adapter instanceof EditableAdapter) {
            return ['editable' => null, 'reason' => 'Editing is not supported for this database.'];
        }

        $parsed = SqlUtils::parseSimpleSelect($sql);
        if ($parsed === null) {
            return ['editable' => null, 'reason' => 'Only simple single-table SELECT results can be edited.'];
        }

        try {
            $schema = $parsed['schema']
                ? $adapter->normalizeIdentifier($parsed['schema']['name'], $parsed['schema']['quoted'])
                : null;
            $table = $adapter->normalizeIdentifier($parsed['table']['name'], $parsed['table']['quoted']);
            $target = $adapter->describeTable($schema, $table);
        } catch (\Throwable) {
            $target = null;
        }

        if ($target === null) {
            return ['editable' => null, 'reason' => 'Source is not an editable table.'];
        }

        $result = RowUpdateBuilder::editableColumns($target, $parsed, $columns);

        if ($result['editable'] !== null) {
            $result['editable'] = [
                'schema' => $target['schema'],
                'table' => $target['table'],
                ...$result['editable'],
            ];
        }

        return $result;
    }

    public function updateRows(Request $request, Connection $connection)
    {
        $data = $request->validate([
            'schema' => ['nullable', 'string'],
            'table' => ['required', 'string'],
            'changes' => ['required', 'array', 'min:1', 'max:1000'],
            'changes.*.key' => ['required', 'array'],
            'changes.*.values' => ['required', 'array'],
            'dryRun' => ['boolean'],
        ]);

        return $this->runRowStatements(
            $request,
            $connection,
            $data,
            fn (EditableAdapter $adapter, array $target) => RowUpdateBuilder::build($adapter, $target, $data['changes'])
        );
    }

    public function deleteRows(Request $request, Connection $connection)
    {
        $data = $request->validate([
            'schema' => ['nullable', 'string'],
            'table' => ['required', 'string'],
            'keys' => ['required', 'array', 'min:1', 'max:1000'],
            'keys.*' => ['required', 'array'],
            'dryRun' => ['boolean'],
        ]);

        return $this->runRowStatements(
            $request,
            $connection,
            $data,
            fn (EditableAdapter $adapter, array $target) => RowUpdateBuilder::buildDeletes($adapter, $target, $data['keys'])
        );
    }

    /**
     * Resolve the target table, build per-row statements, then either return the
     * preview (dry run) or execute them in one transaction and record history.
     *
     * @param  array{schema?: ?string, table: string}  $data
     * @param  callable(EditableAdapter, array): array<int, array{sql: string, params: array, preview: string}>  $build
     */
    private function runRowStatements(Request $request, Connection $connection, array $data, callable $build)
    {
        $adapter = $this->adapters->make($connection);

        if (! $adapter instanceof EditableAdapter) {
            return response()->json(['error' => 'Editing is not supported for this database.'], 400);
        }

        try {
            $target = $adapter->describeTable($data['schema'] ?? null, $data['table']);

            if ($target === null || $target['primaryKey'] === []) {
                return response()->json(['error' => 'Table not found or has no primary key.'], 400);
            }

            $statements = $build($adapter, $target);
        } catch (InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $previews = array_column($statements, 'preview');

        if ($request->boolean('dryRun')) {
            return response()->json(['statements' => $previews]);
        }

        $historySql = implode("\n", $previews);
        $start = microtime(true);

        try {
            $affected = $adapter->executeStatements($statements);
        } catch (\Throwable $e) {
            QueryHistory::record($connection->id, [
                'sql' => $historySql,
                'is_write' => true,
                'success' => false,
                'error' => $e->getMessage(),
                'row_count' => null,
                'execution_time' => round((microtime(true) - $start) * 1000, 2),
            ]);

            return response()->json(['error' => $e->getMessage()], 400);
        }

        $executionTime = round((microtime(true) - $start) * 1000, 2);

        QueryHistory::record($connection->id, [
            'sql' => $historySql,
            'is_write' => true,
            'success' => true,
            'error' => null,
            'row_count' => $affected,
            'execution_time' => $executionTime,
        ]);

        return response()->json([
            'statements' => $previews,
            'affected' => $affected,
            'executionTime' => $executionTime,
        ]);
    }

    public function autocomplete(Connection $connection)
    {
        $adapter = $this->adapters->make($connection);

        try {
            $tables = $adapter->getTables();
            $columns = $adapter->getAllColumnNames();
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        $terms = [];
        $keywords = $connection->driver === 'mongodb' ? MongoQueryParser::METHOD_NAMES : SqlUtils::SQL_KEYWORDS;

        foreach ($keywords as $keyword) {
            $terms[] = ['value' => $keyword, 'type' => 'keyword'];
        }

        foreach ($tables as $table) {
            $terms[] = ['value' => $table['tableName'], 'type' => 'table'];
        }

        foreach ($columns as $column) {
            $terms[] = ['value' => $column, 'type' => 'column'];
        }

        return response()->json(['terms' => $terms]);
    }

    public function export(Request $request, Connection $connection)
    {
        $sql = trim((string) $request->input('sql', ''));

        if ($sql === '') {
            return response()->json(['error' => 'Query is empty.'], 400);
        }

        $isWrite = $connection->driver === 'mongodb'
            ? MongoQueryParser::isWriteQuery($sql)
            : SqlUtils::isWriteQuery($sql);

        if ($isWrite) {
            return response()->json(['error' => 'Only read queries can be exported.'], 400);
        }

        $format = $request->input('format', 'csv');
        $adapter = $this->adapters->make($connection);

        $finalSql = $connection->driver === 'mongodb'
            ? MongoQueryParser::stripTrailing($sql)
            : SqlUtils::stripTrailing($sql);

        try {
            $result = $adapter->query($finalSql);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        if ($result['rowCount'] === 0) {
            return response()->json(['error' => 'Query returned no rows to export.'], 400);
        }

        $rows = ResultSerializer::rows($result['rows']);
        $timestamp = str_replace([':', '.'], '-', now()->toISOString());

        if ($format === 'markdown') {
            $body = Exporter::toMarkdownTable($result['columns'], $rows);
            $filename = "sql-analyzer-{$timestamp}.md";
            $contentType = 'text/markdown; charset=utf-8';
        } else {
            $body = Exporter::toCsv($result['columns'], $rows);
            $filename = "sql-analyzer-{$timestamp}.csv";
            $contentType = 'text/csv; charset=utf-8';
        }

        return response($body, 200, [
            'Content-Type' => $contentType,
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function schema(Request $request, Connection $connection)
    {
        $table = $request->query('table');

        if (! $table) {
            return response()->json(['error' => 'table is required.'], 400);
        }

        $schema = $request->query('schema', '');
        $adapter = $this->adapters->make($connection);

        try {
            return response()->json($adapter->getTableSchema($schema, $table));
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function tables(Request $request, Connection $connection)
    {
        $adapter = $this->adapters->make($connection);

        try {
            return response()->json(['tables' => $adapter->getTables($request->query('search', ''))]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
