<?php

namespace App\Support;

use InvalidArgumentException;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\UTCDateTime;

/**
 * Parses mongosh-style query text ("db.collection.method(...).chain(...)")
 * into a collection name, method name, arguments, and chained modifiers
 * (limit/skip/sort). Arguments are decoded from a lenient, JS-object-like
 * syntax into plain PHP values, with ObjectId(...)/ISODate(...) hydrated
 * into their BSON equivalents.
 */
class MongoQueryParser
{
    public const WRITE_METHODS = [
        'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne',
        'deleteOne', 'deleteMany', 'drop', 'findOneAndUpdate', 'findOneAndDelete',
        'findOneAndReplace', 'renameCollection', 'createIndex', 'dropIndex',
    ];

    public const DDL_METHODS = ['drop', 'createIndex', 'dropIndex', 'renameCollection'];

    public const METHOD_NAMES = [
        'find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'distinct',
        'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne',
        'deleteOne', 'deleteMany', 'drop', 'limit', 'skip', 'sort',
    ];

    /**
     * @return array{collection: string, method: string, args: array<int, mixed>, modifiers: array{limit: ?int, skip: ?int, sort: ?array}}
     */
    public static function parse(string $query): array
    {
        $query = trim($query);

        if (! preg_match(
            '/^db\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/',
            $query,
            $m,
            PREG_OFFSET_CAPTURE
        )) {
            throw new InvalidArgumentException('Query must look like db.<collection>.<method>(...)');
        }

        $collection = $m[1][0];
        $method = $m[2][0];
        $openParenPos = strpos($query, '(', $m[0][1]);

        [$argsRaw, $afterArgsPos] = self::extractBalanced($query, $openParenPos);
        $args = array_map([self::class, 'jsLikeToPhp'], self::splitTopLevelArgs($argsRaw));

        $modifiers = ['limit' => null, 'skip' => null, 'sort' => null];
        $pos = $afterArgsPos;

        while (preg_match('/\G\s*\.(limit|skip|sort)\s*\(/', $query, $cm, 0, $pos)) {
            $name = $cm[1];
            $callParenPos = strpos($query, '(', $pos);
            [$raw, $next] = self::extractBalanced($query, $callParenPos);
            $modifiers[$name] = self::jsLikeToPhp(trim($raw));
            $pos = $next;
        }

        return compact('collection', 'method', 'args', 'modifiers');
    }

    public static function methodOf(string $query): ?string
    {
        return preg_match(
            '/^\s*db\.[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/',
            $query,
            $m
        ) ? $m[1] : null;
    }

    public static function isWriteQuery(string $query): bool
    {
        return in_array(self::methodOf($query), self::WRITE_METHODS, true);
    }

    public static function isDdlQuery(string $query): bool
    {
        return in_array(self::methodOf($query), self::DDL_METHODS, true);
    }

    public static function injectLimit(string $query, int $limit): string
    {
        $trimmed = self::stripTrailing($query);
        $cap = min($limit, 1000);

        if (preg_match('/\.limit\s*\(/', $trimmed)) {
            return $trimmed;
        }

        if (preg_match('/^db\.[A-Za-z_][A-Za-z0-9_]*\.find\s*\(/', $trimmed)) {
            return "{$trimmed}.limit({$cap})";
        }

        return $trimmed;
    }

    public static function stripTrailing(string $query): string
    {
        return rtrim(trim($query), "; \t\n\r\0\x0B");
    }

    /**
     * Extract the content between the bracket at $openIndex and its matching
     * close, tracking (), [], {} depth as one counter and skipping over
     * quoted string contents so brackets inside strings don't throw off depth.
     *
     * @return array{0: string, 1: int} [inner content, index right after the closing bracket]
     */
    private static function extractBalanced(string $str, int $openIndex): array
    {
        $depth = 0;
        $len = strlen($str);
        $start = $openIndex + 1;
        $inString = null;

        for ($i = $openIndex; $i < $len; $i++) {
            $ch = $str[$i];

            if ($inString !== null) {
                if ($ch === '\\') {
                    $i++;
                } elseif ($ch === $inString) {
                    $inString = null;
                }

                continue;
            }

            if ($ch === '"' || $ch === "'") {
                $inString = $ch;

                continue;
            }

            if ($ch === '(' || $ch === '[' || $ch === '{') {
                $depth++;

                continue;
            }

            if ($ch === ')' || $ch === ']' || $ch === '}') {
                $depth--;
                if ($depth === 0) {
                    return [substr($str, $start, $i - $start), $i + 1];
                }
            }
        }

        throw new InvalidArgumentException('Unbalanced brackets in query.');
    }

    /**
     * @return string[]
     */
    private static function splitTopLevelArgs(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') {
            return [];
        }

        $parts = [];
        $depth = 0;
        $inString = null;
        $start = 0;
        $len = strlen($raw);

        for ($i = 0; $i < $len; $i++) {
            $ch = $raw[$i];

            if ($inString !== null) {
                if ($ch === '\\') {
                    $i++;
                } elseif ($ch === $inString) {
                    $inString = null;
                }

                continue;
            }

            if ($ch === '"' || $ch === "'") {
                $inString = $ch;

                continue;
            }

            if ($ch === '(' || $ch === '[' || $ch === '{') {
                $depth++;

                continue;
            }

            if ($ch === ')' || $ch === ']' || $ch === '}') {
                $depth--;

                continue;
            }

            if ($ch === ',' && $depth === 0) {
                $parts[] = substr($raw, $start, $i - $start);
                $start = $i + 1;
            }
        }

        $parts[] = substr($raw, $start);

        return array_map('trim', $parts);
    }

    public static function jsLikeToPhp(?string $expr): mixed
    {
        $expr = trim((string) $expr);
        if ($expr === '') {
            return null;
        }

        $expr = preg_replace_callback(
            '/ObjectId\s*\(\s*([\'"])(.*?)\1\s*\)/',
            fn ($m) => json_encode(['$oid' => $m[2]]),
            $expr
        );

        $expr = preg_replace_callback(
            '/(?:ISODate|new\s+Date)\s*\(\s*([\'"])(.*?)\1\s*\)/',
            fn ($m) => json_encode(['$date' => $m[2]]),
            $expr
        );

        $expr = preg_replace_callback(
            "/'((?:[^'\\\\]|\\\\.)*)'/",
            fn ($m) => '"'.str_replace(["\\'", '"'], ["'", '\\"'], $m[1]).'"',
            $expr
        );

        $expr = preg_replace('/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/', '$1"$2":', $expr);
        $expr = preg_replace('/,(\s*[}\]])/', '$1', $expr);

        $decoded = json_decode($expr, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new InvalidArgumentException('Could not parse query argument: '.json_last_error_msg());
        }

        return self::hydrateBson($decoded);
    }

    private static function hydrateBson(mixed $value): mixed
    {
        if (is_array($value)) {
            if (array_key_exists('$oid', $value) && count($value) === 1) {
                return new ObjectId($value['$oid']);
            }

            if (array_key_exists('$date', $value) && count($value) === 1) {
                $raw = $value['$date'];
                $ms = is_numeric($raw) ? (int) $raw : strtotime((string) $raw) * 1000;

                return new UTCDateTime($ms);
            }

            return array_map([self::class, 'hydrateBson'], $value);
        }

        return $value;
    }
}
