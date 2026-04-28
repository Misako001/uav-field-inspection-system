using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace UAVInspectionDesktop.Views;

public partial class HeaderBarView : UserControl
{
    public HeaderBarView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is Window window)
        {
            window.StateChanged += HostWindow_StateChanged;
            UpdateMaximizeButton(window);
        }
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is Window window)
        {
            window.StateChanged -= HostWindow_StateChanged;
        }
    }

    private void HostWindow_StateChanged(object? sender, EventArgs e)
    {
        if (sender is Window window)
        {
            UpdateMaximizeButton(window);
        }
    }

    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (Window.GetWindow(this) is not Window window || e.ChangedButton != MouseButton.Left)
        {
            return;
        }

        if (e.ClickCount == 2)
        {
            ToggleWindowState(window);
            return;
        }

        if (window.WindowState == WindowState.Maximized)
        {
            window.WindowState = WindowState.Normal;
        }

        window.DragMove();
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is Window window)
        {
            window.WindowState = WindowState.Minimized;
        }
    }

    private void MaximizeButton_Click(object sender, RoutedEventArgs e)
    {
        if (Window.GetWindow(this) is Window window)
        {
            ToggleWindowState(window);
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Window.GetWindow(this)?.Close();
    }

    private void ToggleWindowState(Window window)
    {
        window.WindowState = window.WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void UpdateMaximizeButton(Window window)
    {
        MaximizeButton.Content = window.WindowState == WindowState.Maximized ? "❐" : "□";
        MaximizeButton.ToolTip = window.WindowState == WindowState.Maximized ? "还原" : "最大化";
    }
}
