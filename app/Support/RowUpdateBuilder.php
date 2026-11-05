<?php

namespace App\Support;

use App\DbAdapters\EditableAdapter;
use InvalidArgumentException;

class RowUpdateBuilder
{
    /**
     * Work out which result columns can be edited for a parsed SELECT.
     *
     * @param  array{columns: string[], primaryKey: string[]}  $target
     * @param  array{hasStar: bool, plainColumns: string[], aliases: string[]}  $parsed
     * @param  string[]  $resultColumns
     * @return array{editable: ?array{columns: string[], primaryKey: string[]}, reason: ?string}
     */
    public static function editableColumns(array $target, array $parsed, array $resultColumns): array
    {
        if ($target['primaryKey'] === []) {
            return ['editable' => null, 'reason' => 'Table has no primary key.'];
        }

        if (count(array_unique(array_map('strtolower', $resultColumns))) !== count($resultColumns)) {
            return ['editable' => null, 'reason' => 'Result has duplicate column names.'];
        }

        $tableColumns = self::lowerMap($target['columns']);
        $plain = array_map('strtolower', $parsed['plainColumns']);
        $aliases = array_map('strtolower', $parsed['aliases']);

        // Result columns that map straight onto a table column.
        $real = [];
        foreach ($resultColumns as $col) {
            $lower = strtolower($col);
            if (isset($tableColumns[$lower])
                && ($parsed['hasStar'] || in_array($lower, $plain, true))
                && ! in_array($lower, $aliases, true)) {
                $real[$lower] = $col;
            }
        }

        $primaryKey = [];
        foreach ($target['primaryKey'] as $pk) {
            if (! isset($real[strtolower($pk)])) {
                return ['editable' => null, 'reason' => "Select the primary key column ({$pk}) to edit rows."];
            }
            $primaryKey[] = $real[strtolower($pk)];
        }

        $editable = array_values(array_filter(
            $real,
            fn ($col) => ! in_array($col, $primaryKey, true)
        ));

        if ($editable === []) {
            return ['editable' => null, 'reason' => 'No editable columns in result.'];
        }

        return ['editable' => ['columns' => $editable, 'primaryKey' => $primaryKey], 'reason' => null];
    }

    /**
     * Build one parameterized UPDATE per changed row.
     *
     * @param  array{schema: string, table: string, columns: string[], primaryKey: string[]}  $target
     * @param  array<int, array{key: array<string, mixed>, values: array<string, mixed>}>  $changes
     * @return array<int, array{sql: string, params: array<int, mixed>, preview: string}>
     */
    public static function build(EditableAdapter $adapter, array $target, array $changes): array
    {
        $columns = self::lowerMap($target['columns']);
        $pkLower = array_map('strtolower', $target['primaryKey']);
        $tableRef = $adapter->quoteIdentifier($target['schema']).'.'.$adapter->quoteIdentifier($target['table']);

        $statements = [];

        foreach ($changes as $i => $change) {
            $key = self::resolve($change['key'] ?? [], $columns, "Row {$i} key");
            $values = self::resolve($change['values'] ?? [], $columns, "Row {$i}");

            $keyCols = array_map('strtolower', array_keys($key));
            sort($keyCols);
            $expected = $pkLower;
            sort($expected);
            if ($keyCols !== $expected) {
                throw new InvalidArgumentException("Row {$i} must be identified by the full primary key.");
            }

            if ($values === []) {
                throw new InvalidArgumentException("Row {$i} has no changes.");
            }

            foreach (array_keys($values) as $col) {
                if (in_array(strtolower($col), $pkLower, true)) {
                    throw new InvalidArgumentException("Primary key column {$col} cannot be edited.");
                }
            }

            $set = $setPreview = $where = $wherePreview = $params = [];

            foreach ($values as $col => $value) {
                $ident = $adapter->quoteIdentifier($col);
                $set[] = "{$ident} = ?";
                $setPreview[] = "{$ident} = ".$adapter->quoteLiteral($value);
                $params[] = $value;
            }

            foreach ($key as $col => $value) {
                if ($value === null) {
                    throw new InvalidArgumentException("Row {$i} has a NULL primary key value.");
                }
                $ident = $adapter->quoteIdentifier($col);
                $where[] = "{$ident} = ?";
                $wherePreview[] = "{$ident} = ".$adapter->quoteLiteral($value);
                $params[] = $value;
            }

            $statements[] = [
                'sql' => "UPDATE {$tableRef} SET ".implode(', ', $set).' WHERE '.implode(' AND ', $where),
                'params' => $params,
                'preview' => "UPDATE {$tableRef} SET ".implode(', ', $setPreview).' WHERE '.implode(' AND ', $wherePreview).';',
            ];
        }

        return $statements;
    }

    /**
     * Map user-supplied column names onto the table's real column names.
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, string>  $columns  lowercase => real name
     * @return array<string, mixed>
     */
    private static function resolve(mixed $input, array $columns, string $label): array
    {
        if (! is_array($input)) {
            throw new InvalidArgumentException("{$label}: expected an object of column values.");
        }

        $out = [];
        foreach ($input as $col => $value) {
            $real = $columns[strtolower((string) $col)] ?? null;
            if ($real === null) {
                throw new InvalidArgumentException("{$label}: unknown column {$col}.");
            }
            if (is_array($value)) {
                $value = json_encode($value);
            }
            $out[$real] = $value;
        }

        return $out;
    }

    /**
     * @param  string[]  $names
     * @return array<string, string>
     */
    private static function lowerMap(array $names): array
    {
        $map = [];
        foreach ($names as $name) {
            $map[strtolower($name)] = $name;
        }

        return $map;
    }
}
