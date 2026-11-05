<?php

namespace Tests\Feature;

use App\Models\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PDO;
use Tests\TestCase;

class EditResultRowsTest extends TestCase
{
    use RefreshDatabase;

    private string $dbPath;

    private Connection $connection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dbPath = tempnam(sys_get_temp_dir(), 'edit-rows-').'.sqlite';
        $pdo = new PDO('sqlite:'.$this->dbPath);
        $pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');
        $pdo->exec("INSERT INTO users VALUES (1, 'Ann', 'ann@x.test'), (2, 'Bob', 'bob@x.test')");
        $pdo->exec('CREATE TABLE logs (msg TEXT)');

        $this->connection = Connection::create([
            'name' => 'test',
            'driver' => 'sqlite',
            'file_path' => $this->dbPath,
        ]);
    }

    protected function tearDown(): void
    {
        @unlink($this->dbPath);
        parent::tearDown();
    }

    private function url(string $path): string
    {
        return "/api/connections/{$this->connection->id}/{$path}";
    }

    public function test_simple_select_is_reported_editable(): void
    {
        $this->postJson($this->url('query'), ['sql' => 'SELECT * FROM users'])
            ->assertOk()
            ->assertJsonPath('editable.table', 'users')
            ->assertJsonPath('editable.primaryKey', ['id'])
            ->assertJsonPath('editable.columns', ['name', 'email']);
    }

    public function test_complex_or_keyless_selects_are_read_only(): void
    {
        $this->postJson($this->url('query'), ['sql' => 'SELECT name FROM users'])
            ->assertOk()
            ->assertJsonPath('editable', null)
            ->assertJsonPath('editReason', 'Select the primary key column (id) to edit rows.');

        $this->postJson($this->url('query'), ['sql' => 'SELECT u.* FROM users u JOIN users v ON v.id = u.id'])
            ->assertOk()
            ->assertJsonPath('editable', null);
    }

    public function test_dry_run_previews_without_writing(): void
    {
        $this->postJson($this->url('rows/update'), [
            'schema' => 'main',
            'table' => 'users',
            'changes' => [['key' => ['id' => 1], 'values' => ['name' => "O'Neil", 'email' => null]]],
            'dryRun' => true,
        ])
            ->assertOk()
            ->assertJsonPath('statements.0', 'UPDATE "main"."users" SET "name" = \'O\'\'Neil\', "email" = NULL WHERE "id" = 1;');

        $this->assertSame('Ann', $this->userName(1));
    }

    public function test_update_applies_changes(): void
    {
        $this->postJson($this->url('rows/update'), [
            'schema' => 'main',
            'table' => 'users',
            'changes' => [
                ['key' => ['id' => 1], 'values' => ['name' => 'Annie']],
                ['key' => ['id' => 2], 'values' => ['name' => 'Robert']],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('affected', 2);

        $this->assertSame('Annie', $this->userName(1));
        $this->assertSame('Robert', $this->userName(2));
    }

    public function test_update_rejects_unknown_columns_and_partial_keys(): void
    {
        $this->postJson($this->url('rows/update'), [
            'table' => 'users',
            'changes' => [['key' => ['id' => 1], 'values' => ['bogus' => 'x']]],
        ])->assertStatus(422);

        $this->postJson($this->url('rows/update'), [
            'table' => 'users',
            'changes' => [['key' => ['name' => 'Ann'], 'values' => ['email' => 'x']]],
        ])->assertStatus(422);

        $this->postJson($this->url('rows/update'), [
            'table' => 'logs',
            'changes' => [['key' => ['msg' => 'a'], 'values' => ['msg' => 'b']]],
        ])->assertStatus(400);
    }

    private function userName(int $id): string
    {
        $pdo = new PDO('sqlite:'.$this->dbPath);

        return $pdo->query("SELECT name FROM users WHERE id = {$id}")->fetchColumn();
    }
}
