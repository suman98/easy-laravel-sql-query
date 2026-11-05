<?php

namespace App\Support;

class SqlUtils
{
    public const WRITE_PATTERNS = [
        'INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'TRUNCATE ', 'ALTER ', 'CREATE ', 'RENAME ', 'REPLACE ',
    ];

    public const DDL_PATTERNS = [
        'DROP ', 'TRUNCATE ', 'ALTER ', 'CREATE ', 'RENAME ',
    ];

    public const SQL_KEYWORDS = [
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
        'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'USING',
        'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
        'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
        'DISTINCT', 'AS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
        'COALESCE', 'NULLIF', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
        'EXISTS', 'UNION', 'ALL', 'WITH', 'RECURSIVE', 'CAST',
    ];

    public static function normalize(string $sql): string
    {
        return strtoupper(preg_replace('/\s+/', ' ', trim($sql)));
    }

    public static function isWriteQuery(string $sql): bool
    {
        $normalized = self::normalize($sql);

        foreach (self::WRITE_PATTERNS as $pattern) {
            if (str_starts_with($normalized, $pattern)) {
                return true;
            }
        }

        return false;
    }

    public static function isDdlQuery(string $sql): bool
    {
        $normalized = self::normalize($sql);

        foreach (self::DDL_PATTERNS as $pattern) {
            if (str_starts_with($normalized, $pattern)) {
                return true;
            }
        }

        return false;
    }

    public static function injectLimit(string $sql, int $limit): string
    {
        $trimmed = rtrim($sql, "; \t\n\r\0\x0B");
        $cap = min($limit, 1000);

        if (preg_match('/\bLIMIT\s+(\d+)/i', $trimmed, $matches)) {
            if ((int) $matches[1] > $cap) {
                return preg_replace('/\bLIMIT\s+\d+/i', "LIMIT {$cap}", $trimmed);
            }

            return $trimmed;
        }

        return "{$trimmed} LIMIT {$cap}";
    }

    public static function stripTrailing(string $sql): string
    {
        return rtrim($sql, "; \t\n\r\0\x0B");
    }

    private const IDENT = '(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)';

    private const RESERVED_ALIASES = [
        'WHERE', 'ORDER', 'LIMIT', 'OFFSET', 'GROUP', 'HAVING', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
        'FULL', 'CROSS', 'NATURAL', 'UNION', 'FETCH', 'FOR', 'WINDOW', 'ON', 'USING',
    ];

    /**
     * Recognise a plain single-table SELECT (no joins, grouping, unions or
     * DISTINCT) so its result grid can be edited. Returns null for anything
     * more complex.
     *
     * @return null|array{
     *     schema: ?array{name: string, quoted: bool},
     *     table: array{name: string, quoted: bool},
     *     hasStar: bool,
     *     plainColumns: string[],
     *     aliases: string[],
     * }
     */
    public static function parseSimpleSelect(string $sql): ?array
    {
        $sql = preg_replace(['~/\*.*?\*/~s', '/--[^\n]*/'], ' ', $sql);
        $sql = trim(self::stripTrailing(trim($sql)));

        if (! preg_match('/^SELECT\s+(.*?)\s+FROM\s+(.+)$/is', $sql, $m)) {
            return null;
        }

        [$selectList, $rest] = [trim($m[1]), trim($m[2])];

        if (preg_match('/^(DISTINCT|ALL|TOP)\b/i', $selectList) || substr_count($selectList, '(') !== substr_count($selectList, ')')) {
            return null;
        }

        $id = self::IDENT;
        if (! preg_match("/^({$id})(?:\s*\.\s*({$id}))?(?:\s+(?:AS\s+)?({$id}))?(?:\s+(.*))?$/is", $rest, $fm)) {
            return null;
        }

        $first = $fm[1];
        $second = $fm[2] ?? '';
        $alias = $fm[3] ?? '';
        $tail = trim($fm[4] ?? '');

        if ($alias !== '' && in_array(strtoupper($alias), self::RESERVED_ALIASES, true)) {
            $tail = trim($alias.' '.$tail);
            $alias = '';
        }

        if ($tail !== '' && ! preg_match('/^(WHERE|ORDER\s+BY|LIMIT|OFFSET|FETCH|FOR\s+UPDATE)\b/i', $tail)) {
            return null;
        }

        // Ignore string contents when hunting for disqualifying keywords.
        $tailNoStrings = preg_replace("/'(?:[^']|'')*'/", "''", $tail);
        if (preg_match('/\b(JOIN|UNION|INTERSECT|EXCEPT|GROUP\s+BY|HAVING)\b/i', $tailNoStrings)) {
            return null;
        }

        $schema = $second !== '' ? self::identifier($first) : null;
        $table = self::identifier($second !== '' ? $second : $first);

        $hasStar = false;
        $plainColumns = [];
        $aliases = [];

        foreach (self::splitTopLevel($selectList) as $item) {
            $item = trim($item);

            if (preg_match("/^(?:{$id}\s*\.\s*)*\*$/", $item)) {
                $hasStar = true;

                continue;
            }

            if (preg_match("/^(?:{$id}\s*\.\s*){0,2}({$id})(?:\s+(?:AS\s+)?({$id}))?$/is", $item, $cm)) {
                $col = self::identifier($cm[1])['name'];
                $as = isset($cm[2]) && $cm[2] !== '' ? self::identifier($cm[2])['name'] : null;

                if ($as === null || strcasecmp($as, $col) === 0) {
                    $plainColumns[] = $col;
                } else {
                    $aliases[] = $as;
                }

                continue;
            }

            // Expression: its result column (if aliased) is not a real column.
            if (preg_match("/\s(?:AS\s+)?({$id})$/is", $item, $am)) {
                $aliases[] = self::identifier($am[1])['name'];
            }
        }

        return [
            'schema' => $schema,
            'table' => $table,
            'hasStar' => $hasStar,
            'plainColumns' => $plainColumns,
            'aliases' => $aliases,
        ];
    }

    /**
     * @return array{name: string, quoted: bool}
     */
    private static function identifier(string $raw): array
    {
        $first = $raw[0] ?? '';
        if (in_array($first, ['`', '"', '['], true)) {
            return ['name' => substr($raw, 1, -1), 'quoted' => true];
        }

        return ['name' => $raw, 'quoted' => false];
    }

    /**
     * Split on commas that are not inside parentheses or quotes.
     *
     * @return string[]
     */
    private static function splitTopLevel(string $list): array
    {
        $parts = [];
        $depth = 0;
        $quote = null;
        $buf = '';

        for ($i = 0, $len = strlen($list); $i < $len; $i++) {
            $ch = $list[$i];

            if ($quote !== null) {
                if ($ch === $quote) {
                    $quote = null;
                }
            } elseif (in_array($ch, ["'", '"', '`'], true)) {
                $quote = $ch;
            } elseif ($ch === '(') {
                $depth++;
            } elseif ($ch === ')') {
                $depth--;
            } elseif ($ch === ',' && $depth === 0) {
                $parts[] = $buf;
                $buf = '';

                continue;
            }

            $buf .= $ch;
        }

        $parts[] = $buf;

        return $parts;
    }
}
