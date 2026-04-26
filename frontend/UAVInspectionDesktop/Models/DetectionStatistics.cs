using System;
using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class DetectionStatistics
{
    [JsonPropertyName("total_count")]
    public int TotalCount { get; set; }

    [JsonPropertyName("current_minute_count")]
    public int CurrentMinuteCount { get; set; }

    [JsonPropertyName("risk_index")]
    public double RiskIndex { get; set; }

    [JsonPropertyName("recorded_at")]
    public DateTime RecordedAt { get; set; } = DateTime.Now;
}
