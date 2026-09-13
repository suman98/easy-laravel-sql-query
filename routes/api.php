<?php

use App\Http\Controllers\Api\QueryController;
use App\Http\Controllers\Api\QueryHistoryController;
use App\Http\Controllers\Api\SavedQueryController;
use App\Http\Controllers\ConnectionController;
use Illuminate\Support\Facades\Route;

Route::put('connections/reorder', [ConnectionController::class, 'reorder']);

Route::prefix('connections/{connection}')->group(function () {
    Route::post('query', [QueryController::class, 'run']);
    Route::get('autocomplete', [QueryController::class, 'autocomplete']);
    Route::post('export', [QueryController::class, 'export']);
    Route::get('schema', [QueryController::class, 'schema']);
    Route::get('tables', [QueryController::class, 'tables']);

    Route::get('saved-queries', [SavedQueryController::class, 'index']);
    Route::post('saved-queries', [SavedQueryController::class, 'store']);
    Route::delete('saved-queries/{savedQuery}', [SavedQueryController::class, 'destroy']);

    Route::get('history', [QueryHistoryController::class, 'index']);
    Route::delete('history', [QueryHistoryController::class, 'clear']);
    Route::delete('history/{queryHistory}', [QueryHistoryController::class, 'destroy']);
});
