// Channel status callback that runs `onReconnect` on every SUBSCRIBED after the
// first. A repeat SUBSCRIBED means the socket dropped (e.g. the PWA was
// suspended) and rejoined, so postgres_changes emitted in between were lost.
export function onResubscribe(onReconnect: () => void): (status: string) => void {
  let subscribed = false;
  return (status) => {
    if (status !== "SUBSCRIBED") return;
    if (subscribed) onReconnect();
    subscribed = true;
  };
}
