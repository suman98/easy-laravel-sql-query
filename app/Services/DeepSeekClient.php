<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Thin wrapper around DeepSeek's OpenAI-compatible chat completions endpoint.
 */
class DeepSeekClient
{
    private ?string $apiKey;

    private string $baseUrl;

    public function __construct()
    {
        $this->apiKey = config('services.deepseek.key');
        $this->baseUrl = rtrim(config('services.deepseek.base_url', 'https://api.deepseek.com'), '/');
    }

    public function complete(string $system, string $user): string
    {
        if (! $this->apiKey) {
            throw new RuntimeException('DEEPSEEK_API_KEY is not configured.');
        }

        $response = Http::withToken($this->apiKey)
            ->timeout(30)
            ->post("{$this->baseUrl}/chat/completions", [
                'model' => 'deepseek-chat',
                'temperature' => 0.2,
                'max_tokens' => 800,
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ],
            ]);

        if ($response->failed()) {
            $message = $response->json('error.message') ?? $response->body();

            throw new RuntimeException("DeepSeek request failed: {$message}");
        }

        $content = $response->json('choices.0.message.content');

        if (! $content) {
            throw new RuntimeException('DeepSeek returned an empty response.');
        }

        return trim($content);
    }
}
