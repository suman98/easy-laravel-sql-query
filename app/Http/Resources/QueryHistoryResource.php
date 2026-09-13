<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QueryHistoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'connection_id' => $this->connection_id,
            'sql' => $this->sql,
            'is_write' => $this->is_write,
            'success' => $this->success,
            'error' => $this->error,
            'row_count' => $this->row_count,
            'execution_time' => $this->execution_time,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
