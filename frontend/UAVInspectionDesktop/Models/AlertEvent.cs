using System;
using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class AlertEvent
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("occurred_at")]
    public DateTime OccurredAt { get; set; } = DateTime.Now;

    [JsonPropertyName("alert_type")]
    public string AlertType { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";
}
