<?php

namespace App\DbAdapters;

trait FormatsBytes
{
    private function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = (int) floor(log($bytes, 1024));
        $i = min($i, count($units) - 1);

        $value = $bytes / (1024 ** $i);

        return number_format($value, $i === 0 ? 0 : 2).' '.$units[$i];
    }
}
