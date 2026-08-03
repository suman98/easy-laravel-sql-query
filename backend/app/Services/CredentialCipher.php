<?php

namespace App\Services;

use RuntimeException;

/**
 * AES-256-GCM envelope: IV(12) || authTag(16) || ciphertext, base64-encoded.
 * Mirrors the Node crypto.ts scheme so the encrypted format is portable.
 */
class CredentialCipher
{
    private const CIPHER = 'aes-256-gcm';

    private string $key;

    public function __construct()
    {
        $hex = env('ENCRYPTION_KEY');

        if (! $hex || strlen($hex) !== 64) {
            throw new RuntimeException(
                'ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). Generate one with: openssl rand -hex 32'
            );
        }

        $this->key = hex2bin($hex);
    }

    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(12);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Encryption failed.');
        }

        return base64_encode($iv.$tag.$ciphertext);
    }

    public function decrypt(string $payload): string
    {
        $raw = base64_decode($payload, true);

        if ($raw === false || strlen($raw) < 28) {
            throw new RuntimeException('Malformed encrypted payload.');
        }

        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ciphertext = substr($raw, 28);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($plaintext === false) {
            throw new RuntimeException('Decryption failed (invalid key or tampered data).');
        }

        return $plaintext;
    }
}
