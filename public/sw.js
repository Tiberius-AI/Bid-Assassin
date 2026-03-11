/**
 * Bid Assassin Service Worker
 * Handles Web Push notifications for The Prospector hot alerts.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "Bid Assassin", body: event.data.text() };
  }

  const title = data.title ?? "Bid Assassin — New Opportunity";
  const options = {
    body: data.body ?? "A new federal contract matched your profile.",
    icon: data.icon ?? "/icon-192.png",
    badge: data.badge ?? "/badge-72.png",
    tag: data.data?.opportunity_id ?? "bid-assassin-alert",
    renotify: true,
    requireInteraction: false,
    data: data.data ?? {},
    actions: [
      { action: "view", title: "View Opportunity" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? "/opportunities";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
