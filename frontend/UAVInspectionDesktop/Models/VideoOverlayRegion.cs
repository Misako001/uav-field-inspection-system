namespace UAVInspectionDesktop.Models;

public sealed class VideoOverlayRegion
{
    public string Label { get; set; } = "";

    public double Left { get; set; }

    public double Top { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    public string StrokeColor { get; set; } = "#FF4D5A";

    public string FillColor { get; set; } = "#40FF4D5A";
}
