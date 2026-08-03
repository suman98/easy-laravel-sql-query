<?php

namespace App\Support;

class Exporter
{
    /**
     * @param string[] $columns
     * @param array<int, array<int, mixed>> $rows positional values matching $columns order
     */
    public static function toCsv(array $columns, array $rows): string
    {
        $lines = [implode(',', array_map([self::class, 'csvField'], $columns))];

        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(
                fn ($value) => self::csvField(self::stringify($value)),
                $row
            ));
        }

        return implode("\n", $lines);
    }

    private static function csvField(string $value): string
    {
        if (preg_match('/[",\n]/', $value)) {
            return '"'.str_replace('"', '""', $value).'"';
        }

        return $value;
    }

    /**
     * @param string[] $columns
     * @param array<int, array<int, mixed>> $rows positional values matching $columns order
     */
    public static function toMarkdownTable(array $columns, array $rows): string
    {
        $escape = fn (string $v) => str_replace("\n", '<br>', str_replace('|', '\\|', $v));

        $lines = [];
        $lines[] = '| '.implode(' | ', array_map($escape, $columns)).' |';
        $lines[] = '| '.implode(' | ', array_fill(0, count($columns), '---')).' |';

        foreach ($rows as $row) {
            $lines[] = '| '.implode(' | ', array_map(
                fn ($value) => $escape(self::stringify($value)),
                $row
            )).' |';
        }

        return implode("\n", $lines);
    }

    private static function stringify(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_array($value)) {
            return json_encode($value);
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        return (string) $value;
    }
}
