<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('saved_queries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('connection_id')->constrained('connections')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('query');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('saved_queries');
    }
};
