using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
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
    private readonly List<AlertEvent> _allAlerts = [];

    private string _clockTime = DateTime.Now.ToString("HH:mm:ss");
    private string _clockDate = DateTime.Now.ToString("yyyy/MM/dd ddd");
    private string _operationMessage = "系统已进入演示模式，可直接进行界面展示。";
    private string _headerStatusText = "演示模式";
    private string _headerStatusDetail = "未连接后端时使用本地 mock 数据，避免界面空白。";
    private string _headerStatusColor = "#F5B942";
    private string _refreshModeText = "演示刷新";
    private string _activeAlertFilter = "全部";
    private string _selectedDetailTitle = "直播详情";
    private string _selectedDetailDescription = "查看实时流媒体信息、巡检状态和检测叠加效果。";
    private bool _isBackendOnline;
    private bool _isPollingPaused;
    private bool _isOverlayEnabled = true;
    private bool _isFillMode = true;
    private AlertEvent? _selectedAlert;
    private QuickAccessItem? _selectedQuickAccessItem;
    private SystemStatus _systemStatus = new();
    private VideoStatus _videoStatus = new();
    private DetectionStatistics _detectionStatistics = new();

    public MainViewModel()
    {
        Alerts = [];
        AlertFilters = [];
        StatusChips = [];
        QuickAccessItems = [];
        OverlayRegions = [];
        DetailMetrics = [];

        RefreshCommand = new RelayCommand(async _ => await RefreshAsync(force: true));
        TogglePauseCommand = new RelayCommand(_ => TogglePause());
        ToggleOverlayCommand = new RelayCommand(_ => ToggleOverlay());
        ToggleDisplayModeCommand = new RelayCommand(_ => ToggleDisplayMode());
        FilterAlertsCommand = new RelayCommand(parameter => SetActiveFilter(parameter?.ToString() ?? "全部"));
        SelectQuickAccessCommand = new RelayCommand(parameter => SelectQuickAccess(parameter as QuickAccessItem));
        MarkSelectedAlertHandledCommand = new RelayCommand(_ => MarkSelectedAlertHandled(), _ => SelectedAlert is not null);
        ClearHandledAlertsCommand = new RelayCommand(_ => ClearHandledAlerts());

        InitializeCollections();
        ApplyMockState();
        UpdateClock();

        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clockTimer.Tick += (_, _) => UpdateClock();
        _clockTimer.Start();

        _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _refreshTimer.Tick += async (_, _) => await RefreshAsync();
        _refreshTimer.Start();

        _ = RefreshAsync(force: true);
        _ = StartRealtimeAsync();
    }

    public ObservableCollection<AlertEvent> Alerts { get; }

    public ObservableCollection<AlertFilterOption> AlertFilters { get; }

    public ObservableCollection<DashboardStatusChip> StatusChips { get; }

    public ObservableCollection<QuickAccessItem> QuickAccessItems { get; }

    public ObservableCollection<VideoOverlayRegion> OverlayRegions { get; }

    public ObservableCollection<DetailMetric> DetailMetrics { get; }

    public ICommand RefreshCommand { get; }

    public ICommand TogglePauseCommand { get; }

    public ICommand ToggleOverlayCommand { get; }

    public ICommand ToggleDisplayModeCommand { get; }

    public ICommand FilterAlertsCommand { get; }

    public ICommand SelectQuickAccessCommand { get; }

    public ICommand MarkSelectedAlertHandledCommand { get; }

    public ICommand ClearHandledAlertsCommand { get; }

    public string ClockTime
    {
        get => _clockTime;
        private set => SetProperty(ref _clockTime, value);
    }

    public string ClockDate
    {
        get => _clockDate;
        private set => SetProperty(ref _clockDate, value);
    }

    public string OperationMessage
    {
        get => _operationMessage;
        private set => SetProperty(ref _operationMessage, value);
    }

    public string HeaderStatusText
    {
        get => _headerStatusText;
        private set => SetProperty(ref _headerStatusText, value);
    }

    public string HeaderStatusDetail
    {
        get => _headerStatusDetail;
        private set => SetProperty(ref _headerStatusDetail, value);
    }

    public string HeaderStatusColor
    {
        get => _headerStatusColor;
        private set => SetProperty(ref _headerStatusColor, value);
    }

    public string RefreshModeText
    {
        get => _refreshModeText;
        private set => SetProperty(ref _refreshModeText, value);
    }

    public string ActiveAlertFilter
    {
        get => _activeAlertFilter;
        private set => SetProperty(ref _activeAlertFilter, value);
    }

    public string SelectedDetailTitle
    {
        get => _selectedDetailTitle;
        private set => SetProperty(ref _selectedDetailTitle, value);
    }

    public string SelectedDetailDescription
    {
        get => _selectedDetailDescription;
        private set => SetProperty(ref _selectedDetailDescription, value);
    }

    public bool IsBackendOnline
    {
        get => _isBackendOnline;
        private set => SetProperty(ref _isBackendOnline, value);
    }

    public bool IsPollingPaused
    {
        get => _isPollingPaused;
        private set
        {
            if (SetProperty(ref _isPollingPaused, value))
            {
                OnPropertyChanged(nameof(PauseButtonText));
                RefreshModeText = value ? "手动刷新" : IsBackendOnline ? "实时刷新" : "演示刷新";
                UpdateStatusChips();
                UpdateDetailMetrics();
            }
        }
    }

    public bool IsOverlayEnabled
    {
        get => _isOverlayEnabled;
        private set
        {
            if (SetProperty(ref _isOverlayEnabled, value))
            {
                OnPropertyChanged(nameof(OverlayButtonText));
                OnPropertyChanged(nameof(VideoStatusBanner));
            }
        }
    }

    public bool IsFillMode
    {
        get => _isFillMode;
        private set
        {
            if (SetProperty(ref _isFillMode, value))
            {
                OnPropertyChanged(nameof(DisplayModeText));
                OnPropertyChanged(nameof(VideoSceneTitle));
            }
        }
    }

    public AlertEvent? SelectedAlert
    {
        get => _selectedAlert;
        set
        {
            if (SetProperty(ref _selectedAlert, value))
            {
                if (MarkSelectedAlertHandledCommand is RelayCommand command)
                {
                    command.RaiseCanExecuteChanged();
                }

                UpdateDetailMetrics();
            }
        }
    }

    public QuickAccessItem? SelectedQuickAccessItem
    {
        get => _selectedQuickAccessItem;
        set
        {
            if (SetProperty(ref _selectedQuickAccessItem, value))
            {
                UpdateQuickAccessSelection();
                UpdateDetailContent();
            }
        }
    }

    public SystemStatus SystemStatus
    {
        get => _systemStatus;
        private set => SetProperty(ref _systemStatus, value);
    }

    public VideoStatus VideoStatus
    {
        get => _videoStatus;
        private set
        {
            if (SetProperty(ref _videoStatus, value))
            {
                OnPropertyChanged(nameof(FpsText));
                OnPropertyChanged(nameof(LatencyText));
                UpdateStatusChips();
                UpdateDetailMetrics();
            }
        }
    }

    public DetectionStatistics DetectionStatistics
    {
        get => _detectionStatistics;
        private set
        {
            if (SetProperty(ref _detectionStatistics, value))
            {
                OnPropertyChanged(nameof(RiskLevel));
                OnPropertyChanged(nameof(RiskDescription));
                OnPropertyChanged(nameof(RiskProgressWidth));
                OnPropertyChanged(nameof(DetectionDeltaText));
                UpdateDetailMetrics();
            }
        }
    }

    public string FpsText => $"{VideoStatus.Fps:F0}";

    public string LatencyText => $"{VideoStatus.LatencyMs}";

    public string PauseButtonText => IsPollingPaused ? "继续刷新" : "暂停刷新";

    public string OverlayButtonText => IsOverlayEnabled ? "检测叠加已开" : "检测叠加已关";

    public string DisplayModeText => IsFillMode ? "铺满画面" : "辅助画面";

    public string VideoSceneTitle => $"UAV FIELD LIVE · {DisplayModeText}";

    public string VideoStatusBanner => IsOverlayEnabled ? "检测叠加已启用，已标注疑似风险区域" : "检测叠加已关闭，仅展示巡检视频画面";

    public string DetectionDeltaText => DetectionStatistics.CurrentMinuteCount >= 15 ? "较上一周期活跃 +12%" : "当前检测波动平稳";

    public string RiskLevel => DetectionStatistics.RiskIndex >= 70 ? "高风险" : DetectionStatistics.RiskIndex >= 40 ? "中风险" : "低风险";

    public string RiskDescription => DetectionStatistics.RiskIndex >= 70 ? "建议立即调度重点巡检区域" : DetectionStatistics.RiskIndex >= 40 ? "建议重点巡检 3 号、7 号与 A 区" : "当前风险稳定，可按计划巡检";

    public double RiskProgressWidth => Math.Clamp(DetectionStatistics.RiskIndex, 0, 100) * 3.1;

    public int AlertCount => _allAlerts.Count;

    public int VisibleAlertCount => Alerts.Count;

    public int UnhandledAlertCount => _allAlerts.Count(alert => !IsHandled(alert));

    private void InitializeCollections()
    {
        AlertFilters.Add(new AlertFilterOption { Key = "全部", Label = "全部", IsActive = true });
        AlertFilters.Add(new AlertFilterOption { Key = "高风险", Label = "高风险" });
        AlertFilters.Add(new AlertFilterOption { Key = "中风险", Label = "中风险" });
        AlertFilters.Add(new AlertFilterOption { Key = "处理中", Label = "处理中" });
        AlertFilters.Add(new AlertFilterOption { Key = "已处理", Label = "已处理" });

        StatusChips.Add(new DashboardStatusChip { Label = "RTMP" });
        StatusChips.Add(new DashboardStatusChip { Label = "HLS" });
        StatusChips.Add(new DashboardStatusChip { Label = "刷新" });

        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "直播详情",
            Subtitle = "视频链路",
            Description = "查看实时流媒体信息与巡检轨迹状态。",
            Badge = "在线",
            AccentColor = "#22D27F",
            IconGlyph = "▶"
        });
        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "系统诊断",
            Subtitle = "健康检查",
            Description = "检查后端、数据库和实时刷新链路状态。",
            Badge = "健康",
            AccentColor = "#2BB3FF",
            IconGlyph = "⌘"
        });
        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "配置管理",
            Subtitle = "参数设置",
            Description = "调整阈值、视频源地址和联动策略。",
            Badge = "v2.1.3",
            AccentColor = "#F5B942",
            IconGlyph = "⚙"
        });
        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "病虫害预测",
            Subtitle = "AI 预测",
            Description = "结合当前态势预测病虫害风险变化。",
            Badge = "AI",
            AccentColor = "#7A5CFF",
            IconGlyph = "◎"
        });
        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "烟田数字孪生",
            Subtitle = "地块态势",
            Description = "展示地块数量、覆盖率和三维入口。",
            Badge = "12 地块",
            AccentColor = "#22D27F",
            IconGlyph = "▣"
        });
        QuickAccessItems.Add(new QuickAccessItem
        {
            Title = "数据分析",
            Subtitle = "统计报告",
            Description = "分析检测趋势、风险变化和告警闭环。",
            Badge = "报表",
            AccentColor = "#FF4D5A",
            IconGlyph = "▤"
        });

        OverlayRegions.Add(new VideoOverlayRegion { Label = "病害疑似", Left = 168, Top = 180, Width = 158, Height = 104, StrokeColor = "#FF4D5A", FillColor = "#30FF4D5A" });
        OverlayRegions.Add(new VideoOverlayRegion { Label = "视频干扰", Left = 610, Top = 292, Width = 176, Height = 122, StrokeColor = "#F5B942", FillColor = "#30F5B942" });

        SelectedQuickAccessItem = QuickAccessItems.FirstOrDefault();
    }

    private void ApplyMockState()
    {
        SystemStatus = new SystemStatus
        {
            SystemName = "大田无人机巡检监控系统",
            Status = "系统正常",
            Running = true,
            ServerTime = DateTime.Now,
            Health = "healthy"
        };

        VideoStatus = new VideoStatus
        {
            RtmpStatus = "connected",
            HlsStatus = "available",
            Fps = 30,
            LatencyMs = 92,
            Resolution = "1920x1080"
        };

        DetectionStatistics = new DetectionStatistics
        {
            TotalCount = 1286,
            CurrentMinuteCount = 17,
            RiskIndex = 64,
            RecordedAt = DateTime.Now
        };

        ReplaceAlerts(CreateMockAlerts());
        IsBackendOnline = false;
        HeaderStatusText = "演示模式";
        HeaderStatusDetail = "未连接后端，使用本地演示数据与交互流程。";
        HeaderStatusColor = "#F5B942";
        RefreshModeText = "演示刷新";
        UpdateStatusChips();
        UpdateDetailContent();
    }

    private void UpdateClock()
    {
        var now = DateTime.Now;
        ClockTime = now.ToString("HH:mm:ss");
        ClockDate = now.ToString("yyyy/MM/dd ddd");
    }

    private async Task RefreshAsync(bool force = false)
    {
        if (IsPollingPaused && !force)
        {
            return;
        }

        try
        {
            var system = await _apiService.GetSystemStatusAsync();
            var video = await _apiService.GetVideoStatusAsync();
            var detection = await _apiService.GetDetectionStatisticsAsync();
            var alerts = await _apiService.GetAlertsAsync();

            if (system is not null)
            {
                SystemStatus = system;
            }

            if (video is not null)
            {
                VideoStatus = video;
            }

            if (detection is not null)
            {
                DetectionStatistics = detection;
            }

            ReplaceAlerts(alerts);
            IsBackendOnline = true;
            HeaderStatusText = SystemStatus.Status;
            HeaderStatusDetail = $"后端已连接 · 最近刷新 {DateTime.Now:HH:mm:ss} · 当前筛选 {ActiveAlertFilter}";
            HeaderStatusColor = "#22D27F";
            RefreshModeText = IsPollingPaused ? "手动刷新" : "实时刷新";
            OperationMessage = $"数据已刷新，当前共有 {AlertCount} 条告警，未处理 {UnhandledAlertCount} 条。";
            UpdateStatusChips();
            UpdateDetailContent();
        }
        catch
        {
            IsBackendOnline = false;
            HeaderStatusText = "演示模式";
            HeaderStatusDetail = "后端暂不可达，界面继续使用本地 mock 数据演示。";
            HeaderStatusColor = "#F5B942";
            RefreshModeText = IsPollingPaused ? "手动刷新" : "演示刷新";
            OperationMessage = "接口连接异常，已自动切换到演示数据，界面功能仍可正常操作。";
            UpdateStatusChips();
            UpdateDetailContent();
        }
    }

    private async Task StartRealtimeAsync()
    {
        try
        {
            await _realtimeService.ListenAsync(
                payload =>
                {
                    if (IsPollingPaused)
                    {
                        return Task.CompletedTask;
                    }

                    App.Current.Dispatcher.Invoke(() =>
                    {
                        SystemStatus = payload.System;
                        VideoStatus = payload.Video;
                        DetectionStatistics = payload.Detection;
                        ReplaceAlerts(payload.Alerts);
                        IsBackendOnline = true;
                        HeaderStatusText = payload.System.Status;
                        HeaderStatusDetail = $"WebSocket 已连接 · 最近推送 {DateTime.Now:HH:mm:ss}";
                        HeaderStatusColor = "#22D27F";
                        RefreshModeText = "实时推送";
                        OperationMessage = $"实时推送已更新，当前共有 {AlertCount} 条告警。";
                        UpdateStatusChips();
                        UpdateDetailContent();
                    });

                    return Task.CompletedTask;
                },
                _realtimeCts.Token);
        }
        catch
        {
            if (!IsBackendOnline)
            {
                OperationMessage = "WebSocket 未连接，当前继续使用轮询或演示数据。";
            }
        }
    }

    private void TogglePause()
    {
        IsPollingPaused = !IsPollingPaused;
        OperationMessage = IsPollingPaused ? "已暂停自动刷新，可以继续进行本地交互演示。" : "已恢复自动刷新和实时联动。";
    }

    private void ToggleOverlay()
    {
        IsOverlayEnabled = !IsOverlayEnabled;
        OperationMessage = IsOverlayEnabled ? "已开启检测叠加，主画面会标注疑似风险区域。" : "已关闭检测叠加，主画面回到纯视频视图。";
    }

    private void ToggleDisplayMode()
    {
        IsFillMode = !IsFillMode;
        OperationMessage = IsFillMode ? "已切换为铺满画面模式。" : "已切换为辅助画面模式。";
    }

    private void SetActiveFilter(string filterKey)
    {
        ActiveAlertFilter = filterKey;
        foreach (var option in AlertFilters)
        {
            option.IsActive = option.Key == filterKey;
        }

        ApplyAlertFilter();
        OperationMessage = $"已切换告警筛选：{filterKey}。";
    }

    private void SelectQuickAccess(QuickAccessItem? item)
    {
        if (item is null)
        {
            return;
        }

        SelectedQuickAccessItem = item;
        OperationMessage = $"已打开功能入口：{item.Title}。";
    }

    private void UpdateQuickAccessSelection()
    {
        foreach (var item in QuickAccessItems)
        {
            item.IsSelected = item == SelectedQuickAccessItem;
        }
    }

    private void MarkSelectedAlertHandled()
    {
        if (SelectedAlert is null)
        {
            return;
        }

        SelectedAlert.Status = "已处理";
        SelectedAlert.Severity = "已处理";
        SelectedAlert.AccentColor = "#2BB3FF";
        ApplyAlertFilter();
        OperationMessage = $"已将告警“{SelectedAlert.AlertType}”标记为已处理。";
    }

    private void ClearHandledAlerts()
    {
        _allAlerts.RemoveAll(IsHandled);
        ApplyAlertFilter();
        OperationMessage = "已清理所有已处理告警。";
    }

    private void ReplaceAlerts(IEnumerable<AlertEvent> alerts)
    {
        _allAlerts.Clear();
        foreach (var alert in alerts)
        {
            EnrichAlert(alert);
            _allAlerts.Add(alert);
        }

        ApplyAlertFilter();
    }

    private void ApplyAlertFilter()
    {
        Alerts.Clear();

        foreach (var alert in _allAlerts.Where(MatchesActiveFilter))
        {
            Alerts.Add(alert);
        }

        UpdateFilterCounts();
        if (SelectedAlert is null || !Alerts.Contains(SelectedAlert))
        {
            SelectedAlert = Alerts.FirstOrDefault();
        }

        OnPropertyChanged(nameof(AlertCount));
        OnPropertyChanged(nameof(VisibleAlertCount));
        OnPropertyChanged(nameof(UnhandledAlertCount));
        UpdateDetailMetrics();
    }

    private void UpdateFilterCounts()
    {
        foreach (var option in AlertFilters)
        {
            option.Count = option.Key switch
            {
                "全部" => _allAlerts.Count,
                "高风险" => _allAlerts.Count(alert => alert.Severity == "高风险"),
                "中风险" => _allAlerts.Count(alert => alert.Severity == "中风险"),
                "处理中" => _allAlerts.Count(alert => alert.Status.Contains("处理", StringComparison.OrdinalIgnoreCase) && !IsHandled(alert)),
                "已处理" => _allAlerts.Count(IsHandled),
                _ => 0,
            };
        }
    }

    private bool MatchesActiveFilter(AlertEvent alert)
    {
        return ActiveAlertFilter switch
        {
            "全部" => true,
            "处理中" => alert.Status.Contains("处理", StringComparison.OrdinalIgnoreCase) && !IsHandled(alert),
            "已处理" => IsHandled(alert),
            _ => alert.Severity == ActiveAlertFilter,
        };
    }

    private void UpdateStatusChips()
    {
        if (StatusChips.Count < 3)
        {
            return;
        }

        StatusChips[0].Value = VideoStatus.RtmpStatus;
        StatusChips[0].AccentColor = VideoStatus.RtmpStatus.Contains("connected", StringComparison.OrdinalIgnoreCase) ? "#22D27F" : "#FF4D5A";
        StatusChips[1].Value = VideoStatus.HlsStatus;
        StatusChips[1].AccentColor = VideoStatus.HlsStatus.Contains("available", StringComparison.OrdinalIgnoreCase) ? "#22D27F" : "#FF4D5A";
        StatusChips[2].Value = RefreshModeText;
        StatusChips[2].AccentColor = IsPollingPaused ? "#F5B942" : IsBackendOnline ? "#2BB3FF" : "#7A5CFF";
    }

    private void UpdateDetailContent()
    {
        if (SelectedQuickAccessItem is null)
        {
            return;
        }

        SelectedDetailTitle = SelectedQuickAccessItem.Title;
        SelectedDetailDescription = SelectedQuickAccessItem.Title switch
        {
            "直播详情" => "查看流媒体链路状态、叠加模式、帧率、延迟和主画面运行概况。",
            "系统诊断" => "检查后端连接、数据库就绪状态、WebSocket 刷新与命令响应结果。",
            "配置管理" => "集中展示阈值、刷新周期、数据库策略和流媒体入口配置。",
            "病虫害预测" => "结合当前风险指数与告警分布，生成重点巡检建议。",
            "烟田数字孪生" => "展示地块数量、巡检覆盖率、三维场景入口和重点区域。",
            "数据分析" => "汇总检测数量、风险变化、告警处理闭环与趋势摘要。",
            _ => SelectedQuickAccessItem.Description,
        };

        UpdateDetailMetrics();
    }

    private void UpdateDetailMetrics()
    {
        DetailMetrics.Clear();

        switch (SelectedQuickAccessItem?.Title)
        {
            case "直播详情":
                DetailMetrics.Add(new DetailMetric { Label = "分辨率", Value = VideoStatus.Resolution });
                DetailMetrics.Add(new DetailMetric { Label = "帧率", Value = $"{VideoStatus.Fps:F1} FPS" });
                DetailMetrics.Add(new DetailMetric { Label = "延迟", Value = $"{VideoStatus.LatencyMs} ms" });
                break;
            case "系统诊断":
                DetailMetrics.Add(new DetailMetric { Label = "后端状态", Value = IsBackendOnline ? "已连接" : "演示模式" });
                DetailMetrics.Add(new DetailMetric { Label = "刷新模式", Value = RefreshModeText });
                DetailMetrics.Add(new DetailMetric { Label = "系统健康", Value = SystemStatus.Health });
                break;
            case "配置管理":
                DetailMetrics.Add(new DetailMetric { Label = "数据库", Value = "SQLite / MySQL 预留" });
                DetailMetrics.Add(new DetailMetric { Label = "刷新周期", Value = "2 秒" });
                DetailMetrics.Add(new DetailMetric { Label = "模型版本", Value = "v2.1.3" });
                break;
            case "病虫害预测":
                DetailMetrics.Add(new DetailMetric { Label = "风险等级", Value = RiskLevel });
                DetailMetrics.Add(new DetailMetric { Label = "风险指数", Value = $"{DetectionStatistics.RiskIndex:F0}" });
                DetailMetrics.Add(new DetailMetric { Label = "重点区域", Value = "3 号、7 号、A 区" });
                break;
            case "烟田数字孪生":
                DetailMetrics.Add(new DetailMetric { Label = "地块数量", Value = "12 个" });
                DetailMetrics.Add(new DetailMetric { Label = "巡检覆盖", Value = "86%" });
                DetailMetrics.Add(new DetailMetric { Label = "重点区域", Value = "东南角烟田群" });
                break;
            case "数据分析":
                DetailMetrics.Add(new DetailMetric { Label = "总检测数", Value = DetectionStatistics.TotalCount.ToString() });
                DetailMetrics.Add(new DetailMetric { Label = "未处理告警", Value = UnhandledAlertCount.ToString() });
                DetailMetrics.Add(new DetailMetric { Label = "当前筛选", Value = ActiveAlertFilter });
                break;
            default:
                DetailMetrics.Add(new DetailMetric { Label = "当前状态", Value = OperationMessage });
                break;
        }

        if (SelectedAlert is not null)
        {
            DetailMetrics.Add(new DetailMetric { Label = "当前选中告警", Value = $"{SelectedAlert.AlertType} · {SelectedAlert.Status}" });
        }
    }

    private static void EnrichAlert(AlertEvent alert)
    {
        if (IsHandled(alert))
        {
            alert.Severity = "已处理";
            alert.AccentColor = "#2BB3FF";
            return;
        }

        if (alert.Status.Contains("处理", StringComparison.OrdinalIgnoreCase))
        {
            alert.Severity = "处理中";
            alert.AccentColor = "#2BB3FF";
            return;
        }

        if (alert.AlertType.Contains("视频", StringComparison.OrdinalIgnoreCase) || alert.Content.Contains("RTMP", StringComparison.OrdinalIgnoreCase) || alert.Content.Contains("HLS", StringComparison.OrdinalIgnoreCase))
        {
            alert.Severity = "中风险";
            alert.AccentColor = "#F5B942";
            return;
        }

        if (alert.AlertType.Contains("虫害", StringComparison.OrdinalIgnoreCase))
        {
            alert.Severity = "高风险";
            alert.AccentColor = "#FF4D5A";
            return;
        }

        alert.Severity = "高风险";
        alert.AccentColor = "#FF4D5A";
    }

    private static bool IsHandled(AlertEvent alert)
    {
        return alert.Status.Contains("已处理", StringComparison.OrdinalIgnoreCase);
    }

    private static List<AlertEvent> CreateMockAlerts()
    {
        var now = DateTime.Now;
        return
        [
            new AlertEvent
            {
                Id = 1,
                OccurredAt = now.AddMinutes(-9),
                AlertType = "病害疑似",
                Content = "3 号烟田东侧发现疑似赤星病斑块，建议派发重点复核。",
                Confidence = 0.91,
                Status = "待处理"
            },
            new AlertEvent
            {
                Id = 2,
                OccurredAt = now.AddMinutes(-5),
                AlertType = "虫害风险",
                Content = "2 号航线中段检测到虫害密度升高，建议提高巡检频率。",
                Confidence = 0.86,
                Status = "处理中"
            },
            new AlertEvent
            {
                Id = 3,
                OccurredAt = now.AddMinutes(-3),
                AlertType = "视频链路",
                Content = "HLS 延迟高于预设阈值，已切换备用缓冲策略。",
                Confidence = 0.78,
                Status = "待处理"
            },
            new AlertEvent
            {
                Id = 4,
                OccurredAt = now.AddMinutes(-1),
                AlertType = "病害疑似",
                Content = "A 区叶片边缘出现疑似病害扩散特征，建议结合历史图谱分析。",
                Confidence = 0.84,
                Status = "已处理"
            }
        ];
    }
}
