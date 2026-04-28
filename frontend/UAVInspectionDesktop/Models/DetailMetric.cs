namespace UAVInspectionDesktop.Models;

public sealed class DetailMetric : BindableModelBase
{
    private string _value = "";

    public string Label { get; set; } = "";

    public string Value
    {
        get => _value;
        set => SetProperty(ref _value, value);
    }
}
