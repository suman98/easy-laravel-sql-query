<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SavedQueryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'connection_id' => $this->connection_id,
            'name' => $this->name,
            'description' => $this->description,
            'query' => $this->query,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
