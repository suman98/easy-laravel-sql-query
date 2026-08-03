<?php

namespace App\DbAdapters;

use App\Models\Connection;
use App\Support\MongoQueryParser;
use MongoDB\BSON\Binary;
use MongoDB\BSON\Decimal128;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\Regex;
use MongoDB\BSON\UTCDateTime;
use MongoDB\Client;
use MongoDB\Collection;
use MongoDB\Database;
use MongoDB\Model\BSONArray;
use MongoDB\Model\BSONDocument;
use RuntimeException;
use Throwable;

class MongoAdapter implements DbAdapter
{
    use FormatsBytes;

    private Client $client;

    private Database $database;

    public function __construct(private Connection $connection, private string $password)
    {
        $uri = 'mongodb://';

        if ($connection->username) {
            $uri .= rawurlencode($connection->username);
            if ($this->password !== '') {
                $uri .= ':'.rawurlencode($this->password);
            }
            $uri .= '@';
        }

        $uri .= ($connection->host ?: 'localhost').':'.($connection->port ?: 27017).'/';

        if ($connection->username) {
            $uri .= '?authSource='.rawurlencode($connection->database ?: 'admin');
        }

        $options = [];
        if ($connection->ssl) {
            $options['tls'] = true;
        }

        $this->client = new Client($uri, $options);
        $this->database = $this->client->selectDatabase($connection->database);
    }

    public function query(string $sql): array
    {
        $parsed = MongoQueryParser::parse($sql);
        $collection = $this->database->selectCollection($parsed['collection']);

        return match ($parsed['method']) {
            'find' => $this->runFind($collection, $parsed['args'], $parsed['modifiers']),
            'findOne' => $this->runFindOne($collection, $parsed['args']),
            'aggregate' => $this->runAggregate($collection, $parsed['args']),
            'countDocuments' => $this->rowsFromScalar('count', $collection->countDocuments($parsed['args'][0] ?? [])),
            'estimatedDocumentCount' => $this->rowsFromScalar('count', $collection->estimatedDocumentCount()),
            'distinct' => $this->runDistinct($collection, $parsed['args']),
            'insertOne' => $this->runInsertOne($collection, $parsed['args']),
            'insertMany' => $this->runInsertMany($collection, $parsed['args']),
            'updateOne' => $this->runUpdate($collection, 'updateOne', $parsed['args']),
            'updateMany' => $this->runUpdate($collection, 'updateMany', $parsed['args']),
            'replaceOne' => $this->runUpdate($collection, 'replaceOne', $parsed['args']),
            'deleteOne' => $this->runDelete($collection, 'deleteOne', $parsed['args']),
            'deleteMany' => $this->runDelete($collection, 'deleteMany', $parsed['args']),
            'drop' => $this->runDrop($collection),
            default => throw new RuntimeException("Unsupported Mongo method: {$parsed['method']}()"),
        };
    }

    private function runFind(Collection $collection, array $args, array $modifiers): array
    {
        $filter = $args[0] ?? [];
        $options = [];

        if (! empty($args[1])) {
            $options['projection'] = $args[1];
        }
        if ($modifiers['sort'] !== null) {
            $options['sort'] = $modifiers['sort'];
        }
        if ($modifiers['skip'] !== null) {
            $options['skip'] = $modifiers['skip'];
        }
        if ($modifiers['limit'] !== null) {
            $options['limit'] = $modifiers['limit'];
        }

        return $this->rowsFromDocuments(iterator_to_array($collection->find($filter, $options), false));
    }

    private function runFindOne(Collection $collection, array $args): array
    {
        $filter = $args[0] ?? [];
        $options = [];
        if (! empty($args[1])) {
            $options['projection'] = $args[1];
        }

        $doc = $collection->findOne($filter, $options);

        return $this->rowsFromDocuments($doc ? [$doc] : []);
    }

    private function runAggregate(Collection $collection, array $args): array
    {
        $pipeline = $args[0] ?? [];
        $options = $args[1] ?? [];

        return $this->rowsFromDocuments(iterator_to_array($collection->aggregate($pipeline, $options), false));
    }

    private function runDistinct(Collection $collection, array $args): array
    {
        $field = $args[0] ?? null;
        if (! is_string($field)) {
            throw new RuntimeException('distinct() requires a field name string as the first argument.');
        }

        $values = $collection->distinct($field, $args[1] ?? []);
        $rows = array_map(fn ($v) => [$this->bsonToArray($v)], $values);

        return ['columns' => [$field], 'rows' => $rows, 'rowCount' => count($rows)];
    }

    private function runInsertOne(Collection $collection, array $args): array
    {
        $result = $collection->insertOne($args[0] ?? []);

        return [
            'columns' => ['insertedId'],
            'rows' => [[$this->bsonToArray($result->getInsertedId())]],
            'rowCount' => 1,
        ];
    }

    private function runInsertMany(Collection $collection, array $args): array
    {
        $result = $collection->insertMany($args[0] ?? []);

        return [
            'columns' => ['insertedCount'],
            'rows' => [[$result->getInsertedCount()]],
            'rowCount' => $result->getInsertedCount(),
        ];
    }

    private function runUpdate(Collection $collection, string $method, array $args): array
    {
        $result = $collection->{$method}($args[0] ?? [], $args[1] ?? [], $args[2] ?? []);

        return [
            'columns' => ['matchedCount', 'modifiedCount'],
            'rows' => [[$result->getMatchedCount(), $result->getModifiedCount()]],
            'rowCount' => $result->getModifiedCount(),
        ];
    }

    private function runDelete(Collection $collection, string $method, array $args): array
    {
        $result = $collection->{$method}($args[0] ?? []);

        return [
            'columns' => ['deletedCount'],
            'rows' => [[$result->getDeletedCount()]],
            'rowCount' => $result->getDeletedCount(),
        ];
    }

    private function runDrop(Collection $collection): array
    {
        $collection->drop();

        return ['columns' => [], 'rows' => [], 'rowCount' => 0];
    }

    private function rowsFromScalar(string $column, mixed $value): array
    {
        return ['columns' => [$column], 'rows' => [[$value]], 'rowCount' => 1];
    }

    private function rowsFromDocuments(array $docs): array
    {
        $normalized = array_map(fn ($doc) => $this->bsonToArray($doc), $docs);

        $columns = [];
        foreach ($normalized as $doc) {
            foreach (array_keys($doc) as $key) {
                $columns[$key] = true;
            }
        }
        $columns = array_keys($columns);

        $rows = array_map(
            fn ($doc) => array_map(fn ($col) => $doc[$col] ?? null, $columns),
            $normalized
        );

        return ['columns' => $columns, 'rows' => $rows, 'rowCount' => count($rows)];
    }

    /**
     * Recursively convert BSON documents/scalars into plain, display-friendly
     * PHP values: ObjectId -> hex string, UTCDateTime -> ISO 8601, etc.
     */
    private function bsonToArray(mixed $value): mixed
    {
        if ($value instanceof ObjectId) {
            return (string) $value;
        }
        if ($value instanceof UTCDateTime) {
            return $value->toDateTime()->format(DATE_ATOM);
        }
        if ($value instanceof Decimal128) {
            return (string) $value;
        }
        if ($value instanceof Binary) {
            return base64_encode($value->getData());
        }
        if ($value instanceof Regex) {
            return (string) $value;
        }
        if ($value instanceof BSONDocument || $value instanceof BSONArray) {
            $out = [];
            foreach ($value as $k => $v) {
                $out[$k] = $this->bsonToArray($v);
            }

            return $out;
        }
        if (is_array($value)) {
            return array_map(fn ($v) => $this->bsonToArray($v), $value);
        }

        return $value;
    }

    public function getTables(?string $search = null): array
    {
        $tables = [];

        foreach ($this->database->listCollections() as $info) {
            $name = $info->getName();

            if ($search !== null && $search !== '' && stripos($name, $search) === false) {
                continue;
            }

            $sizeBytes = 0;
            try {
                $stats = iterator_to_array($this->database->command(['collStats' => $name]))[0] ?? null;
                $sizeBytes = (int) ($this->bsonToArray($stats)['size'] ?? 0);
            } catch (Throwable) {
                // collStats unavailable (e.g. views, restricted permissions); leave size at 0.
            }

            $tables[] = [
                'tableSchema' => $this->connection->database,
                'tableName' => $name,
                'tableKey' => $name,
                'sizeBytes' => $sizeBytes,
                'sizeHuman' => $this->formatBytes($sizeBytes),
            ];
        }

        return $tables;
    }

    public function getTableSchema(string $schema, string $table): array
    {
        $collection = $this->database->selectCollection($table);

        $fieldTypes = [];
        foreach ($collection->find([], ['limit' => 50]) as $doc) {
            foreach ($this->bsonToArray($doc) as $field => $value) {
                $fieldTypes[$field] ??= $this->typeName($value);
            }
        }

        $columns = [];
        foreach ($fieldTypes as $name => $type) {
            $columns[] = ['name' => $name, 'type' => $type, 'nullable' => 'YES', 'default' => null];
        }

        $indexes = [];
        foreach ($collection->listIndexes() as $index) {
            $indexes[] = [
                'name' => $index->getName(),
                'definition' => 'INDEX ('.implode(', ', array_keys($index->getKey())).')',
            ];
        }

        return ['columns' => $columns, 'indexes' => $indexes];
    }

    public function getAllColumnNames(): array
    {
        $names = [];

        foreach ($this->getTables() as $table) {
            $collection = $this->database->selectCollection($table['tableName']);
            foreach ($collection->find([], ['limit' => 20]) as $doc) {
                foreach (array_keys($this->bsonToArray($doc)) as $field) {
                    $names[$field] = true;
                }
            }
        }

        return array_keys($names);
    }

    private function typeName(mixed $value): string
    {
        return match (true) {
            is_null($value) => 'null',
            is_bool($value) => 'boolean',
            is_int($value) => 'int',
            is_float($value) => 'double',
            is_string($value) => 'string',
            is_array($value) && array_is_list($value) => 'array',
            is_array($value) => 'object',
            default => 'mixed',
        };
    }

    public function testConnection(): void
    {
        try {
            $this->database->command(['ping' => 1]);
        } catch (Throwable $e) {
            throw new RuntimeException($e->getMessage(), previous: $e);
        }
    }
}
