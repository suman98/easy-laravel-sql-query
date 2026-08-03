<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SavedQuery extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'connection_id',
        'name',
        'description',
        'query',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function connection()
    {
        return $this->belongsTo(Connection::class);
    }
}
