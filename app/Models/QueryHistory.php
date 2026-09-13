<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QueryHistory extends Model
{
    public $timestamps = false;

    /**
     * Max history entries retained per connection.
     */
    const PER_CONNECTION_LIMIT = 100;

    protected $fillable = [
        'connection_id',
        'sql',
        'is_write',
        'success',
        'error',
        'row_count',
        'execution_time',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'is_write' => 'boolean',
            'success' => 'boolean',
            'row_count' => 'integer',
            'execution_time' => 'float',
            'created_at' => 'datetime',
        ];
    }

    public function connection()
    {
        return $this->belongsTo(Connection::class);
    }

    public static function record(int $connectionId, array $attributes): self
    {
        $last = static::where('connection_id', $connectionId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();

        if ($last && $last->sql === $attributes['sql']) {
            $last->fill(array_merge($attributes, ['created_at' => now()]));
            $last->save();

            return $last;
        }

        $entry = static::create(array_merge($attributes, [
            'connection_id' => $connectionId,
            'created_at' => now(),
        ]));

        $overflowIds = static::where('connection_id', $connectionId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->skip(self::PER_CONNECTION_LIMIT)
            ->take(PHP_INT_MAX)
            ->pluck('id');

        if ($overflowIds->isNotEmpty()) {
            static::whereIn('id', $overflowIds)->delete();
        }

        return $entry;
    }
}
