<?php

use App\Http\Controllers\ConnectionController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/connections');

Route::get('connections', [ConnectionController::class, 'index'])->name('connections.index');
Route::get('connections/new', [ConnectionController::class, 'create'])->name('connections.create');
Route::post('connections', [ConnectionController::class, 'store'])->name('connections.store');
Route::get('connections/{connection}', [ConnectionController::class, 'show'])->name('connections.show');
Route::put('connections/{connection}', [ConnectionController::class, 'update'])->name('connections.update');
Route::delete('connections/{connection}', [ConnectionController::class, 'destroy'])->name('connections.destroy');
