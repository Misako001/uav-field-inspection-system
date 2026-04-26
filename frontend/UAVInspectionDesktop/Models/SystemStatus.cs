using System;
using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class SystemStatus
{
    [JsonPropertyName("system_name")]
    public string SystemName { get; set; } = "大田无人机巡检监控系统";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "离线";

    [JsonPropertyName("running")]
    public bool Running { get; set; }

    [JsonPropertyName("server_time")]
    public DateTime ServerTime { get; set; } = DateTime.Now;

    [JsonPropertyName("health")]
    public string Health { get; set; } = "unknown";
}
