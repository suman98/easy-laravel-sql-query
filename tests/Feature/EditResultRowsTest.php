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
        $pdo->exec('CREATE TABLE class_rooms (id INTEGER PRIMARY KEY, name TEXT)');
        $pdo->exec('CREATE TABLE student_class (id INTEGER PRIMARY KEY, class_id INTEGER, student_id INTEGER, role TEXT)');
        $pdo->exec("INSERT INTO class_rooms VALUES (10, 'Math'), (11, 'Art')");
        $pdo->exec("INSERT INTO student_class VALUES (1, 10, 7, 'teacher'), (2, 11, 7, 'teacher'), (3, 99, 7, 'teacher'), (4, 10, 8, 'student')");

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

    public function test_delete_dry_run_previews_without_deleting(): void
    {
        $this->postJson($this->url('rows/delete'), [
            'table' => 'users',
            'keys' => [['id' => 1], ['id' => 1]],
            'dryRun' => true,
        ])
            ->assertOk()
            ->assertJsonPath('statements', ['DELETE FROM "main"."users" WHERE "id" = 1;']);

        $this->assertSame(2, $this->userCount());
    }

    public function test_delete_removes_selected_rows(): void
    {
        $this->postJson($this->url('rows/delete'), [
            'table' => 'users',
            'keys' => [['id' => 2]],
        ])
            ->assertOk()
            ->assertJsonPath('affected', 1);

        $this->assertSame(1, $this->userCount());
        $this->assertSame('Ann', $this->userName(1));
    }

    public function test_delete_requires_full_non_null_primary_key(): void
    {
        $this->postJson($this->url('rows/delete'), ['table' => 'users', 'keys' => [['name' => 'Ann']]])
            ->assertStatus(422);

        $this->postJson($this->url('rows/delete'), ['table' => 'users', 'keys' => [['id' => null]]])
            ->assertStatus(422);

        $this->postJson($this->url('rows/delete'), ['table' => 'logs', 'keys' => [['msg' => 'a']]])
            ->assertStatus(400);

        $this->assertSame(2, $this->userCount());
    }

    public function test_join_result_reports_delete_targets_by_column_position(): void
    {
        $sql = 'SELECT sc.*, cr.id AS class_id, cr.name FROM student_class sc LEFT JOIN class_rooms cr ON sc.class_id = cr.id WHERE sc.student_id = 7';

        $this->postJson($this->url('query'), ['sql' => $sql])
            ->assertOk()
            ->assertJsonPath('editable', null)
            ->assertJsonPath('deleteTargets.0.table', 'student_class')
            ->assertJsonPath('deleteTargets.0.alias', 'sc')
            ->assertJsonPath('deleteTargets.0.keyColumns', [['name' => 'id', 'index' => 0]])
            ->assertJsonPath('deleteTargets.1.table', 'class_rooms')
            ->assertJsonPath('deleteTargets.1.keyColumns', [['name' => 'id', 'index' => 4]]);
    }

    public function test_simple_select_also_reports_delete_target(): void
    {
        $this->postJson($this->url('query'), ['sql' => 'SELECT name, id FROM users'])
            ->assertOk()
            ->assertJsonPath('deleteTargets.0.table', 'users')
            ->assertJsonPath('deleteTargets.0.keyColumns', [['name' => 'id', 'index' => 1]]);
    }

    public function test_results_without_traceable_keys_have_no_delete_targets(): void
    {
        foreach ([
            'SELECT name FROM users',
            'SELECT student_id, COUNT(*) AS n FROM student_class GROUP BY student_id',
            'SELECT * FROM student_class sc JOIN class_rooms cr USING (id)',
            'SELECT x.id FROM (SELECT id FROM users) x',
            'SELECT id FROM users UNION SELECT id FROM class_rooms',
            'SELECT sc.id + 0 AS id FROM student_class sc',
        ] as $sql) {
            $this->postJson($this->url('query'), ['sql' => $sql])
                ->assertOk()
                ->assertJsonPath('deleteTargets', [], $sql);
        }
    }

    public function test_delete_from_join_result_by_base_table_key(): void
    {
        $this->postJson($this->url('rows/delete'), [
            'table' => 'student_class',
            'keys' => [['id' => 1], ['id' => 3]],
        ])->assertOk()->assertJsonPath('affected', 2);

        $left = (new PDO('sqlite:'.$this->dbPath))->query('SELECT id FROM student_class ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertSame([2, 4], array_map('intval', $left));
    }

    private function userCount(): int
    {
        return (int) (new PDO('sqlite:'.$this->dbPath))->query('SELECT COUNT(*) FROM users')->fetchColumn();
    }

    private function userName(int $id): string
    {
        $pdo = new PDO('sqlite:'.$this->dbPath);

        return $pdo->query("SELECT name FROM users WHERE id = {$id}")->fetchColumn();
    }
}
