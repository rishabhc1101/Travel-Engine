using System.Text.Json;
using System.Threading.Channels;
using Google.Cloud.PubSub.V1;
using Google.Protobuf;

namespace TravelEngine.Api.Services;

public interface IPubSubService
{
    Task PublishWeatherAlertAsync(Guid tripId, WeatherInfo weather, CancellationToken ct = default);
    Task PublishTripUpdateAsync(Guid tripId, string message, CancellationToken ct = default);
    IAsyncEnumerable<string> SubscribeToTripEventsAsync(Guid tripId, CancellationToken ct);
}

public class PubSubService(IConfiguration config, ILogger<PubSubService> logger) : IPubSubService
{
    private readonly string _projectId = config["Gcp:ProjectId"]
        ?? throw new InvalidOperationException("Gcp:ProjectId not configured");

    private const string WeatherAlertTopic = "weather-alerts";
    private const string TripUpdatesTopic = "trip-updates";
    private const string WeatherAlertSub = "weather-alerts-sub";
    private const string TripUpdatesSub = "trip-updates-sub";

    public async Task PublishWeatherAlertAsync(Guid tripId, WeatherInfo weather, CancellationToken ct = default)
    {
        try
        {
            var topicName = TopicName.FromProjectTopic(_projectId, WeatherAlertTopic);
            var publisher = await PublisherClient.CreateAsync(topicName);

            var payload = JsonSerializer.Serialize(new
            {
                tripId = tripId.ToString(),
                type = "weather-alert",
                destination = weather.Destination,
                condition = weather.Condition,
                tempCelsius = weather.TempCelsius,
                windKph = weather.WindKph,
                icon = weather.Icon,
                alertDescription = weather.AlertDescription,
                timestamp = DateTime.UtcNow
            });

            var message = new PubsubMessage
            {
                Data = ByteString.CopyFromUtf8(payload),
                Attributes = { { "tripId", tripId.ToString() } }
            };

            var msgId = await publisher.PublishAsync(message);
            logger.LogInformation("Published weather alert {msgId} for trip {tripId}", msgId, tripId);
            await publisher.ShutdownAsync(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pub/Sub unavailable — skipping weather alert for trip {tripId}. Configure GCP ADC for real-time features.", tripId);
        }
    }

    public async Task PublishTripUpdateAsync(Guid tripId, string message, CancellationToken ct = default)
    {
        try
        {
            var topicName = TopicName.FromProjectTopic(_projectId, TripUpdatesTopic);
            var publisher = await PublisherClient.CreateAsync(topicName);

            var payload = JsonSerializer.Serialize(new
            {
                tripId = tripId.ToString(),
                type = "trip-update",
                message,
                timestamp = DateTime.UtcNow
            });

            var pubsubMessage = new PubsubMessage
            {
                Data = ByteString.CopyFromUtf8(payload),
                Attributes = { { "tripId", tripId.ToString() } }
            };

            await publisher.PublishAsync(pubsubMessage);
            await publisher.ShutdownAsync(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Pub/Sub unavailable — skipping trip update for trip {tripId}. Configure GCP ADC for real-time features.", tripId);
        }
    }

    public async IAsyncEnumerable<string> SubscribeToTripEventsAsync(
        Guid tripId, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var channel = Channel.CreateUnbounded<string>();

        var subscriptionName = SubscriptionName.FromProjectSubscription(_projectId, WeatherAlertSub);
        var subscriber = await SubscriberClient.CreateAsync(subscriptionName);

        var subscriberTask = subscriber.StartAsync((msg, _) =>
        {
            var msgTripId = msg.Attributes.TryGetValue("tripId", out var id) ? id : null;
            if (msgTripId == tripId.ToString())
            {
                channel.Writer.TryWrite(msg.Data.ToStringUtf8());
            }
            return Task.FromResult(SubscriberClient.Reply.Ack);
        });

        ct.Register(() =>
        {
            subscriber.StopAsync(TimeSpan.FromSeconds(3));
            channel.Writer.Complete();
        });

        await foreach (var item in channel.Reader.ReadAllAsync(ct))
        {
            yield return item;
        }
    }
}
