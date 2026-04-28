using System;
using System.Text.Json.Serialization;

namespace UAVInspectionDesktop.Models;

public sealed class AlertEvent : BindableModelBase
{
    private DateTime _occurredAt = DateTime.Now;
    private string _alertType = "";
    private string _content = "";
    private double _confidence;
    private string _status = "";
    private string _severity = "高风险";
    private string _accentColor = "#E91E63";

    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("occurred_at")]
    public DateTime OccurredAt
    {
        get => _occurredAt;
        set => SetProperty(ref _occurredAt, value);
    }

    [JsonPropertyName("alert_type")]
    public string AlertType
    {
        get => _alertType;
        set => SetProperty(ref _alertType, value);
    }

    [JsonPropertyName("content")]
    public string Content
    {
        get => _content;
        set => SetProperty(ref _content, value);
    }

    [JsonPropertyName("confidence")]
    public double Confidence
    {
        get => _confidence;
        set => SetProperty(ref _confidence, value);
    }

    [JsonPropertyName("status")]
    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }

    public string Severity
    {
        get => _severity;
        set => SetProperty(ref _severity, value);
    }

    public string AccentColor
    {
        get => _accentColor;
        set => SetProperty(ref _accentColor, value);
    }
}
