<?php

namespace App\Support;

use App\DbAdapters\EditableAdapter;

/**
 * Works out which source tables of a SELECT can have rows deleted from the
 * result grid: every table whose full primary key is present in the result.
 * Each key column is reported by its position in the result, because joined
 * results often repeat column names (e.g. `sc.class_id` and `cr.id AS class_id`).
 */
class DeleteTargetResolver
{
    /**
     * @param  string[]  $resultColumns
     * @return array<int, array{schema: string, table: string, alias: ?string, keyColumns: array<int, array{name: string, index: int}>}>
     */
    public static function resolve(EditableAdapter $adapter, string $sql, array $resultColumns): array
    {
        $parsed = SqlUtils::parseSelectSources($sql);
        if ($parsed === null) {
            return [];
        }

        // Describe each source table (null when it isn't a plain table, e.g. a view or CTE).
        $sources = [];
        foreach ($parsed['tables'] as $t) {
            try {
                $schema = $t['schema'] ? $adapter->normalizeIdentifier($t['schema']['name'], $t['schema']['quoted']) : null;
                $table = $adapter->normalizeIdentifier($t['table']['name'], $t['table']['quoted']);
                $described = $adapter->describeTable($schema, $table);
            } catch (\Throwable) {
                $described = null;
            }

            $sources[] = [
                'ref' => strtolower($t['alias'] ?? $t['table']['name']),
                'alias' => $t['alias'],
                'described' => $described,
                'columns' => $described ? array_map('strtolower', $described['columns']) : null,
            ];
        }
        $allDescribed = ! in_array(null, array_column($sources, 'described'), true);

        // Expand the select list into one [sourceIndex, lowercase column] per result column.
        $map = [];
        foreach ($parsed['items'] as $item) {
            if ($item['type'] === 'expr') {
                $map[] = null;

                continue;
            }

            if ($item['type'] === 'star') {
                $targets = $item['qualifier'] === null
                    ? array_keys($sources)
                    : array_keys(array_filter($sources, fn ($s) => $s['ref'] === strtolower($item['qualifier'])));

                // Unqualified * with NATURAL/USING merges columns; unknown sources can't be expanded.
                if ($targets === [] || ($item['qualifier'] === null && $parsed['mergedJoin'])) {
                    return [];
                }
                foreach ($targets as $si) {
                    if ($sources[$si]['columns'] === null) {
                        return [];
                    }
                    foreach ($sources[$si]['columns'] as $col) {
                        $map[] = [$si, $col];
                    }
                }

                continue;
            }

            $col = strtolower($item['column']);
            if ($item['qualifier'] !== null) {
                $si = array_search(strtolower($item['qualifier']), array_column($sources, 'ref'), true);
                $map[] = $si !== false && $sources[$si]['columns'] !== null && in_array($col, $sources[$si]['columns'], true)
                    ? [$si, $col]
                    : null;

                continue;
            }

            // Unqualified column: only trust it when exactly one known table has it.
            $owners = array_keys(array_filter($sources, fn ($s) => $s['columns'] !== null && in_array($col, $s['columns'], true)));
            $map[] = $allDescribed && count($owners) === 1 ? [$owners[0], $col] : null;
        }

        if (count($map) !== count($resultColumns)) {
            return [];
        }

        $targets = [];
        foreach ($sources as $si => $source) {
            $described = $source['described'];
            if ($described === null || $described['primaryKey'] === []) {
                continue;
            }

            $keyColumns = [];
            foreach ($described['primaryKey'] as $pk) {
                $index = null;
                foreach ($map as $i => $entry) {
                    if ($entry !== null && $entry[0] === $si && $entry[1] === strtolower($pk)) {
                        $index = $i;
                        break;
                    }
                }
                if ($index === null) {
                    continue 2;
                }
                $keyColumns[] = ['name' => $pk, 'index' => $index];
            }

            $targets[] = [
                'schema' => $described['schema'],
                'table' => $described['table'],
                'alias' => $source['alias'],
                'keyColumns' => $keyColumns,
            ];
        }

        return $targets;
    }
}
