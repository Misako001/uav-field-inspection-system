using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using UAVInspectionDesktop.Models;

namespace UAVInspectionDesktop.Services;

public sealed class ApiService
{
    private readonly HttpClient _httpClient;

    public ApiService(string baseUrl = "http://127.0.0.1:8000")
    {
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(3),
        };
    }

    public async Task<SystemStatus?> GetSystemStatusAsync(CancellationToken cancellationToken = default)
    {
        return await _httpClient.GetFromJsonAsync<SystemStatus>("/api/system/status", cancellationToken);
    }

    public async Task<VideoStatus?> GetVideoStatusAsync(CancellationToken cancellationToken = default)
    {
        return await _httpClient.GetFromJsonAsync<VideoStatus>("/api/video/status", cancellationToken);
    }

    public async Task<DetectionStatistics?> GetDetectionStatisticsAsync(CancellationToken cancellationToken = default)
    {
        return await _httpClient.GetFromJsonAsync<DetectionStatistics>("/api/detection/statistics", cancellationToken);
    }

    public async Task<IReadOnlyList<AlertEvent>> GetAlertsAsync(CancellationToken cancellationToken = default)
    {
        return await _httpClient.GetFromJsonAsync<List<AlertEvent>>("/api/alerts", cancellationToken) ?? [];
    }
}
