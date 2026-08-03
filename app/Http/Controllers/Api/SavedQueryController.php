<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SavedQueryResource;
use App\Models\Connection;
use App\Models\SavedQuery;
use Illuminate\Http\Request;

class SavedQueryController extends Controller
{
    public function index(Connection $connection)
    {
        $queries = $connection->savedQueries()->orderByRaw('LOWER(name)')->get();

        return response()->json(['savedQueries' => SavedQueryResource::collection($queries)]);
    }

    public function store(Request $request, Connection $connection)
    {
        $name = trim((string) $request->input('name', ''));

        if ($name === '') {
            return response()->json(['error' => 'Name is required.'], 400);
        }

        $saved = $connection->savedQueries()->create([
            'name' => $name,
            'description' => trim((string) $request->input('description', '')),
            'query' => $request->input('query', ''),
            'created_at' => now(),
        ]);

        return response()->json(['savedQuery' => new SavedQueryResource($saved)], 201);
    }

    public function destroy(Connection $connection, SavedQuery $savedQuery)
    {
        if ($savedQuery->connection_id !== $connection->id) {
            return response()->json(['error' => 'Saved query not found.'], 404);
        }

        $savedQuery->delete();

        return response()->json(['ok' => true]);
    }
}
