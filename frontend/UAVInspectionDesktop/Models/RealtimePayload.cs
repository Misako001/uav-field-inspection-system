using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class RealtimePayload
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "";

    [JsonPropertyName("emitted_at")]
    public DateTime EmittedAt { get; set; } = DateTime.Now;

    [JsonPropertyName("system")]
    public SystemStatus System { get; set; } = new();

    [JsonPropertyName("video")]
    public VideoStatus Video { get; set; } = new();

    [JsonPropertyName("detection")]
    public DetectionStatistics Detection { get; set; } = new();

    [JsonPropertyName("alerts")]
    public List<AlertEvent> Alerts { get; set; } = [];
}
