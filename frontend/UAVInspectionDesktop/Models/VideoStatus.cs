using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class VideoStatus
{
    [JsonPropertyName("rtmp_status")]
    public string RtmpStatus { get; set; } = "offline";

    [JsonPropertyName("hls_status")]
    public string HlsStatus { get; set; } = "offline";

    [JsonPropertyName("fps")]
    public double Fps { get; set; }

    [JsonPropertyName("latency_ms")]
    public int LatencyMs { get; set; }

    [JsonPropertyName("resolution")]
    public string Resolution { get; set; } = "1920x1080";
}
