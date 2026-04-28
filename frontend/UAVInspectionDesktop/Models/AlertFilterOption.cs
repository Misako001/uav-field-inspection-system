namespace UAVInspectionDesktop.Models;

public sealed class AlertFilterOption : BindableModelBase
{
    private bool _isActive;
    private int _count;

    public string Key { get; set; } = "";

    public string Label { get; set; } = "";

    public int Count
    {
        get => _count;
        set => SetProperty(ref _count, value);
    }

    public bool IsActive
    {
        get => _isActive;
        set => SetProperty(ref _isActive, value);
    }
}
