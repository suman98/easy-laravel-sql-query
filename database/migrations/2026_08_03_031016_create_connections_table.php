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
        Schema::create('connections', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('driver', ['mysql', 'pgsql', 'sqlite']);
            $table->string('host')->nullable();
            $table->integer('port')->nullable();
            $table->string('database')->nullable();
            $table->string('username')->nullable();
            $table->text('password_encrypted')->nullable();
            $table->boolean('ssl')->default(false);
            $table->string('file_path')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('connections');
    }
};
