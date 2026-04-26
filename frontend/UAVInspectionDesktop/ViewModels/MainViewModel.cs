using System;
using System.Collections.ObjectModel;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using UAVInspectionDesktop.Models;
using UAVInspectionDesktop.Services;

namespace UAVInspectionDesktop.ViewModels;

public sealed class MainViewModel : ViewModelBase
{
    private readonly ApiService _apiService = new();
    private readonly RealtimeService _realtimeService = new();
    private readonly CancellationTokenSource _realtimeCts = new();
    private readonly DispatcherTimer _clockTimer;
    private readonly DispatcherTimer _refreshTimer;

    private string _currentTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
    private string _detectionStatus = "待连接";
    private SystemStatus _systemStatus = new();
    private VideoStatus _videoStatus = new();
    private DetectionStatistics _detectionStatistics = new();

    public MainViewModel()
    {
        Alerts = new ObservableCollection<AlertEvent>
        {
            new() { AlertType = "系统", Content = "等待后端服务连接", Confidence = 1, Status = "本地" },
        };

        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clockTimer.Tick += (_, _) => CurrentTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        _clockTimer.Start();

        _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _refreshTimer.Tick += async (_, _) => await RefreshAsync();
        _refreshTimer.Start();

        _ = RefreshAsync();
        _ = StartRealtimeAsync();
    }

    public string CurrentTime
    {
        get => _currentTime;
        private set => SetProperty(ref _currentTime, value);
    }

    public string DetectionStatus
    {
        get => _detectionStatus;
        private set => SetProperty(ref _detectionStatus, value);
    }

    public SystemStatus SystemStatus
    {
        get => _systemStatus;
        private set => SetProperty(ref _systemStatus, value);
    }

    public VideoStatus VideoStatus
    {
        get => _videoStatus;
        private set => SetProperty(ref _videoStatus, value);
    }

    public DetectionStatistics DetectionStatistics
    {
        get => _detectionStatistics;
        private set => SetProperty(ref _detectionStatistics, value);
    }

    public ObservableCollection<AlertEvent> Alerts { get; }

    private async Task RefreshAsync()
    {
        try
        {
            SystemStatus = await _apiService.GetSystemStatusAsync() ?? SystemStatus;
            VideoStatus = await _apiService.GetVideoStatusAsync() ?? VideoStatus;
            DetectionStatistics = await _apiService.GetDetectionStatisticsAsync() ?? DetectionStatistics;
            DetectionStatus = "运行中";
            ReplaceAlerts(await _apiService.GetAlertsAsync());
        }
        catch
        {
            SystemStatus = new SystemStatus { Status = "后端离线", Health = "offline" };
            DetectionStatus = "离线";
        }
    }

    private async Task StartRealtimeAsync()
    {
        try
        {
            await _realtimeService.ListenAsync(
                payload =>
                {
                    App.Current.Dispatcher.Invoke(() =>
                    {
                        SystemStatus = payload.System;
                        VideoStatus = payload.Video;
                        DetectionStatistics = payload.Detection;
                        DetectionStatus = "实时刷新";
                        ReplaceAlerts(payload.Alerts);
                    });
                    return Task.CompletedTask;
                },
                _realtimeCts.Token);
        }
        catch
        {
            // REST polling remains the fallback when WebSocket is not available.
        }
    }

    private void ReplaceAlerts(System.Collections.Generic.IEnumerable<AlertEvent> alerts)
    {
        Alerts.Clear();
        foreach (var alert in alerts)
        {
            Alerts.Add(alert);
        }
    }
}
