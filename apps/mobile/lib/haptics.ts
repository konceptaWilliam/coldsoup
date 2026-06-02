import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Thin wrapper over expo-haptics. Every call is fire-and-forget and swallows
// errors so unsupported platforms (web, some Android devices) are a silent no-op.
const enabled = Platform.OS === "ios" || Platform.OS === "android";

function run(fn: () => Promise<void>) {
  if (!enabled) return;
  fn().catch(() => {});
}

/** Light tap — confirm a routine action (e.g. sending a message). */
export function tapLight() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium tap — a more deliberate action (e.g. opening the message action sheet). */
export function tapMedium() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Selection tick — toggling among discrete options (e.g. reactions, poll votes). */
export function selection() {
  run(() => Haptics.selectionAsync());
}

/** Success notification — a completed/positive change (e.g. marking a thread DONE). */
export function success() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification — a state needing attention (e.g. marking a thread URGENT). */
export function warning() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
