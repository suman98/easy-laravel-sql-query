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
     * Break a SELECT (joins allowed) into its source tables and select items, so
     * result columns can be traced back to table columns. Returns null for
     * anything it can't follow reliably: unions, grouping, derived tables,
     * table hints, or a missing FROM.
     *
     * @return null|array{
     *     tables: array<int, array{schema: ?array{name: string, quoted: bool}, table: array{name: string, quoted: bool}, alias: ?string}>,
     *     items: array<int, array{type: 'star'|'column'|'expr', qualifier?: ?string, column?: string}>,
     *     mergedJoin: bool,
     * }
     */
    public static function parseSelectSources(string $sql): ?array
    {
        $sql = preg_replace(['~/\*.*?\*/~s', '/--[^\n]*/'], ' ', $sql);
        $sql = trim(self::stripTrailing(trim($sql)));
        $masked = self::maskNested($sql);

        if (! preg_match('/^SELECT\s+/i', $masked, $sm)) {
            return null;
        }
        $listStart = strlen($sm[0]);

        if (! preg_match('/\bFROM\b/i', $masked, $fm, PREG_OFFSET_CAPTURE, $listStart)) {
            return null;
        }
        $fromPos = $fm[0][1];
        $fromStart = $fromPos + 4;

        $end = strlen($sql);
        $clauseEnd = '/\b(WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|FETCH|FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+IN|WINDOW|UNION|INTERSECT|EXCEPT)\b/i';
        if (preg_match($clauseEnd, $masked, $em, PREG_OFFSET_CAPTURE, $fromStart)) {
            $end = $em[0][1];
        }

        // Grouped or combined results don't map rows back to table rows.
        if (preg_match('/\b(GROUP\s+BY|HAVING|UNION|INTERSECT|EXCEPT)\b/i', substr($masked, $fromStart))) {
            return null;
        }

        $selectList = trim(substr($sql, $listStart, $fromPos - $listStart));
        if (preg_match('/^TOP\b/i', $selectList)) {
            return null;
        }
        $selectList = preg_replace('/^(DISTINCT|ALL)\s+/i', '', $selectList);

        $tables = self::parseFromClause(substr($sql, $fromStart, $end - $fromStart), substr($masked, $fromStart, $end - $fromStart));
        if ($tables === null) {
            return null;
        }

        $id = self::IDENT;
        $items = [];
        foreach (self::splitTopLevel($selectList) as $item) {
            $item = trim($item);

            if ($item === '*') {
                $items[] = ['type' => 'star', 'qualifier' => null];

                continue;
            }

            if (preg_match("/^(?:{$id}\s*\.\s*)?({$id})\s*\.\s*\*$/", $item, $qm)) {
                $items[] = ['type' => 'star', 'qualifier' => self::identifier($qm[1])['name']];

                continue;
            }

            if (preg_match("/^(?:({$id})\s*\.\s*)?(?:({$id})\s*\.\s*)?({$id})(?:\s+(?:AS\s+)?({$id}))?$/is", $item, $cm)) {
                $qualifier = ($cm[2] ?? '') !== '' ? $cm[2] : (($cm[1] ?? '') !== '' ? $cm[1] : null);
                $items[] = [
                    'type' => 'column',
                    'qualifier' => $qualifier !== null ? self::identifier($qualifier)['name'] : null,
                    'column' => self::identifier($cm[3])['name'],
                ];

                continue;
            }

            $items[] = ['type' => 'expr'];
        }

        return ['tables' => $tables['tables'], 'items' => $items, 'mergedJoin' => $tables['merged']];
    }

    /**
     * @return null|array{tables: array<int, array{schema: ?array{name: string, quoted: bool}, table: array{name: string, quoted: bool}, alias: ?string}>, merged: bool}
     */
    private static function parseFromClause(string $raw, string $masked): ?array
    {
        $joinRe = '/,|\b(?:(NATURAL)\s+)?(?:(?:INNER|CROSS|LEFT|RIGHT|FULL)(?:\s+OUTER)?\s+)?(?:STRAIGHT_)?JOIN\b/i';
        preg_match_all($joinRe, $masked, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);

        $segments = [];
        $merged = false;
        $pos = 0;
        foreach ($matches as $match) {
            $segments[] = substr($raw, $pos, $match[0][1] - $pos);
            $pos = $match[0][1] + strlen($match[0][0]);
            if (! empty($match[1][0])) {
                $merged = true;
            }
        }
        $segments[] = substr($raw, $pos);

        $id = self::IDENT;
        $tables = [];
        foreach ($segments as $segment) {
            $segment = trim($segment);
            // Derived tables / table functions: their columns are unknown.
            if ($segment === '' || $segment[0] === '(') {
                return null;
            }
            if (! preg_match("/^({$id})(?:\s*\.\s*({$id}))?(?:\s+(?:AS\s+)?({$id}))?(?:\s+(ON|USING)\b.*)?$/is", $segment, $m)) {
                return null;
            }
            $alias = $m[3] ?? '';
            if ($alias !== '' && in_array(strtoupper($alias), self::RESERVED_ALIASES, true)) {
                return null;
            }
            if (strtoupper($m[4] ?? '') === 'USING') {
                $merged = true;
            }
            $hasSchema = ($m[2] ?? '') !== '';
            $tables[] = [
                'schema' => $hasSchema ? self::identifier($m[1]) : null,
                'table' => self::identifier($hasSchema ? $m[2] : $m[1]),
                'alias' => $alias !== '' ? self::identifier($alias)['name'] : null,
            ];
        }

        return ['tables' => $tables, 'merged' => $merged];
    }

    /**
     * Same-length copy of the SQL with string literals and parenthesised parts
     * blanked out, so keyword searches only see the top level.
     */
    private static function maskNested(string $sql): string
    {
        $out = '';
        $depth = 0;
        $quote = null;

        for ($i = 0, $len = strlen($sql); $i < $len; $i++) {
            $ch = $sql[$i];

            if ($quote !== null) {
                $out .= $ch === $quote ? $ch : '_';
                if ($ch === $quote) {
                    $quote = null;
                }

                continue;
            }

            if ($ch === "'") {
                $quote = $ch;
                $out .= $ch;

                continue;
            }

            if ($ch === '(') {
                $depth++;
                $out .= $ch;

                continue;
            }

            if ($ch === ')') {
                $depth = max(0, $depth - 1);
                $out .= $ch;

                continue;
            }

            $out .= $depth > 0 ? '_' : $ch;
        }

        return $out;
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
