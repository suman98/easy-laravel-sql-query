<?php

namespace App\Support;

class ResultSerializer
{
    /**
     * Normalize DB driver output for JSON transport: binary strings -> hex,
     * everything else passes through since PDO already returns scalars/null.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    public static function rows(array $rows): array
    {
        return array_map(fn ($row) => array_map([self::class, 'value'], $row), $rows);
    }

    public static function value(mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        // JS numbers lose precision past 2^53; send big ints as strings so
        // they display (and round-trip as row keys) exactly.
        if (is_int($value) && abs($value) > 9007199254740991) {
            return (string) $value;
        }

        if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
            return '\\x'.bin2hex($value);
        }

        return $value;
    }
}
