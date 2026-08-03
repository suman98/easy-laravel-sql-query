<?php

use App\Http\Controllers\Api\ConnectionController;
use App\Http\Controllers\Api\QueryController;
use App\Http\Controllers\Api\SavedQueryController;
use Illuminate\Support\Facades\Route;

Route::get('connections', [ConnectionController::class, 'index']);
Route::post('connections', [ConnectionController::class, 'store']);
Route::get('connections/{connection}', [ConnectionController::class, 'show']);
Route::put('connections/{connection}', [ConnectionController::class, 'update']);
Route::delete('connections/{connection}', [ConnectionController::class, 'destroy']);

Route::prefix('connections/{connection}')->group(function () {
    Route::post('query', [QueryController::class, 'run']);
    Route::get('autocomplete', [QueryController::class, 'autocomplete']);
    Route::post('export', [QueryController::class, 'export']);
    Route::get('schema', [QueryController::class, 'schema']);
    Route::get('tables', [QueryController::class, 'tables']);

    Route::get('saved-queries', [SavedQueryController::class, 'index']);
    Route::post('saved-queries', [SavedQueryController::class, 'store']);
    Route::delete('saved-queries/{savedQuery}', [SavedQueryController::class, 'destroy']);
});
