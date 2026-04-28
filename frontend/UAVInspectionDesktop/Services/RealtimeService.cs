using System;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using UAVInspectionDesktop.Models;

namespace UAVInspectionDesktop.Services;

public sealed class RealtimeService
{
    private readonly Uri _webSocketUri;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };

    public RealtimeService(string webSocketUrl = "ws://127.0.0.1:8000/ws/realtime")
    {
        _webSocketUri = new Uri(webSocketUrl);
    }

    public async Task ListenAsync(Func<RealtimePayload, Task> onMessage, CancellationToken cancellationToken)
    {
        using var socket = new ClientWebSocket();
        await socket.ConnectAsync(_webSocketUri, cancellationToken);

        var buffer = new byte[16 * 1024];
        while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            var result = await socket.ReceiveAsync(buffer, cancellationToken);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                break;
            }

            var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
            var payload = JsonSerializer.Deserialize<RealtimePayload>(json, _jsonOptions);
            if (payload is not null)
            {
                await onMessage(payload);
            }
        }
    }
}
