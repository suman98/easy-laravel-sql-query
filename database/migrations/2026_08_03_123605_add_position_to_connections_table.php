<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->integer('position')->default(0)->after('color');
        });

        DB::table('connections')->orderByRaw('LOWER(name)')->pluck('id')
            ->each(fn ($id, $index) => DB::table('connections')->where('id', $id)->update(['position' => $index]));
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn('position');
        });
    }
};
