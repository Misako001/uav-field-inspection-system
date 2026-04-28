namespace UAVInspectionDesktop.Models;

public sealed class DashboardStatusChip : BindableModelBase
{
    private string _value = "";
    private string _accentColor = "#22D27F";

    public string Label { get; set; } = "";

    public string Value
    {
        get => _value;
        set => SetProperty(ref _value, value);
    }

    public string AccentColor
    {
        get => _accentColor;
        set => SetProperty(ref _accentColor, value);
    }
}
