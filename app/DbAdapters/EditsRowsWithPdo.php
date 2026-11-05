<?php

namespace App\DbAdapters;

use PDO;

/**
 * Shared EditableAdapter pieces for PDO-backed adapters.
 */
trait EditsRowsWithPdo
{
    public function quoteLiteral(mixed $value): string
    {
        return match (true) {
            $value === null => 'NULL',
            is_bool($value) => $value ? 'TRUE' : 'FALSE',
            is_int($value), is_float($value) => (string) $value,
            default => $this->pdo->quote((string) $value),
        };
    }

    public function executeStatements(array $statements): int
    {
        $affected = 0;
        $this->pdo->beginTransaction();

        try {
            foreach ($statements as $statement) {
                $stmt = $this->pdo->prepare($statement['sql']);

                foreach (array_values($statement['params']) as $i => $value) {
                    $stmt->bindValue($i + 1, $value, match (true) {
                        $value === null => PDO::PARAM_NULL,
                        is_bool($value) => PDO::PARAM_BOOL,
                        is_int($value) => PDO::PARAM_INT,
                        default => PDO::PARAM_STR,
                    });
                }

                $stmt->execute();
                $affected += $stmt->rowCount();
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();

            throw $e;
        }

        return $affected;
    }
}
