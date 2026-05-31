export async function trackServer(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const apiKey = process.env.AMPLITUDE_API_KEY;
  if (!apiKey) return;

  await fetch("https://api2.amplitude.com/2/httpapi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      events: [{ event_type: event, user_id: userId, event_properties: properties }],
    }),
  }).catch((e) => console.error("Amplitude error:", e));
}
