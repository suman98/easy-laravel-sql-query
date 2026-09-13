<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\QueryHistoryResource;
use App\Models\Connection;
use App\Models\QueryHistory;

class QueryHistoryController extends Controller
{
    public function index(Connection $connection)
    {
        $history = $connection->queryHistory()->orderByDesc('created_at')->orderByDesc('id')->get();

        return response()->json(['history' => QueryHistoryResource::collection($history)]);
    }

    public function destroy(Connection $connection, QueryHistory $queryHistory)
    {
        if ($queryHistory->connection_id !== $connection->id) {
            return response()->json(['error' => 'History entry not found.'], 404);
        }

        $queryHistory->delete();

        return response()->json(['ok' => true]);
    }

    public function clear(Connection $connection)
    {
        $connection->queryHistory()->delete();

        return response()->json(['ok' => true]);
    }
}
