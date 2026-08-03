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
}
