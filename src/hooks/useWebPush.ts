import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushStatus =
  | "unsupported"   // browser doesn't support push
  | "loading"       // checking current state
  | "prompt"        // not yet asked
  | "denied"        // user blocked
  | "subscribed"    // active subscription
  | "error";        // something went wrong

export function useWebPush(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>("loading");

  // Check current permission state on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setStatus("unsupported");
      return;
    }

    const perm = Notification.permission;
    if (perm === "denied") {
      setStatus("denied");
      return;
    }

    if (perm === "granted") {
      // Check if we have an active subscription
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription()
      ).then((sub) => {
        setStatus(sub ? "subscribed" : "prompt");
      }).catch(() => setStatus("prompt"));
    } else {
      setStatus("prompt");
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY) return;

    try {
      // Register (or reuse) service worker
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const authKey = json.keys?.auth;

      if (!p256dh || !authKey) {
        throw new Error("Missing subscription keys");
      }

      // Save to Supabase
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          member_id: userId,
          endpoint: sub.endpoint,
          p256dh,
          auth_key: authKey,
          user_agent: navigator.userAgent.substring(0, 200),
        },
        { onConflict: "member_id,endpoint" }
      );

      if (error) throw error;

      // Enable push in notification_preferences
      await supabase
        .from("notification_preferences")
        .upsert({ member_id: userId, push_enabled: true }, { onConflict: "member_id" });

      setStatus("subscribed");
    } catch (err) {
      console.error("Push subscription failed:", err);
      setStatus("error");
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("member_id", userId)
          .eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }

      await supabase
        .from("notification_preferences")
        .upsert({ member_id: userId, push_enabled: false }, { onConflict: "member_id" });

      setStatus("prompt");
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    }
  }, [userId]);

  return { status, subscribe, unsubscribe };
}
