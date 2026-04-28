namespace UAVInspectionDesktop.Models;

public sealed class QuickAccessItem : BindableModelBase
{
    private bool _isSelected;

    public string Title { get; set; } = "";

    public string Subtitle { get; set; } = "";

    public string Description { get; set; } = "";

    public string Badge { get; set; } = "";

    public string AccentColor { get; set; } = "#22D27F";

    public string IconGlyph { get; set; } = "■";

    public bool IsSelected
    {
        get => _isSelected;
        set => SetProperty(ref _isSelected, value);
    }
}
