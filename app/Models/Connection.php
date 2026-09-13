<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Connection extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'name',
        'driver',
        'host',
        'port',
        'database',
        'username',
        'password_encrypted',
        'ssl',
        'file_path',
        'color',
        'position',
    ];

    protected $hidden = [
        'password_encrypted',
    ];

    protected function casts(): array
    {
        return [
            'ssl' => 'boolean',
            'port' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function savedQueries()
    {
        return $this->hasMany(SavedQuery::class);
    }

    public function queryHistory()
    {
        return $this->hasMany(QueryHistory::class);
    }
}
