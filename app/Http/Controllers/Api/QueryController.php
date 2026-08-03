<?php

namespace App\Http\Controllers\Api;

use App\DbAdapters\AdapterFactory;
use App\Http\Controllers\Controller;
use App\Models\Connection;
use App\Support\Exporter;
use App\Support\ResultSerializer;
use App\Support\SqlUtils;
use Illuminate\Http\Request;

class QueryController extends Controller
{
    public function __construct(private AdapterFactory $adapters) {}

    public function run(Request $request, Connection $connection)
    {
        $sql = trim((string) $request->input('sql', ''));

        if ($sql === '') {
            return response()->json(['error' => 'Query is empty.'], 400);
        }

        $isWrite = SqlUtils::isWriteQuery($sql);
        $confirmWrite = (bool) $request->input('confirmWrite', false);

        if ($isWrite && ! $confirmWrite) {
            return response()->json([
                'needsConfirm' => true,
                'isWriteQuery' => true,
                'isDdl' => SqlUtils::isDdlQuery($sql),
            ]);
        }

        $limit = max(1, min((int) $request->input('limit', 200), 1000));
        $finalSql = $isWrite ? SqlUtils::stripTrailing($sql) : SqlUtils::injectLimit($sql, $limit);

        $adapter = $this->adapters->make($connection);

        $start = microtime(true);

        try {
            $result = $adapter->query($finalSql);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        $executionTime = (microtime(true) - $start) * 1000;

        return response()->json([
            'columns' => $result['columns'],
            'rows' => ResultSerializer::rows($result['rows']),
            'rowCount' => $result['rowCount'],
            'executionTime' => round($executionTime, 2),
            'isWriteQuery' => $isWrite,
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

        foreach (SqlUtils::SQL_KEYWORDS as $keyword) {
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

        if (SqlUtils::isWriteQuery($sql)) {
            return response()->json(['error' => 'Only SELECT queries can be exported.'], 400);
        }

        $format = $request->input('format', 'csv');
        $adapter = $this->adapters->make($connection);

        try {
            $result = $adapter->query(SqlUtils::stripTrailing($sql));
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
