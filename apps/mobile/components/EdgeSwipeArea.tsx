import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

/**
 * A thin left-edge strip that opens a drawer on a rightward swipe.
 * Sits below the header (default top: 100) so it doesn't capture taps on
 * header controls. Only activates on horizontal drags.
 */
export function EdgeSwipeArea({ onOpen, top = 100 }: { onOpen: () => void; top?: number }) {
  const pan = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-30, 30])
    .onEnd((e) => {
      if (e.translationX > 45) runOnJS(onOpen)();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ position: "absolute", left: 0, top, bottom: 0, width: 26, zIndex: 30 }} />
    </GestureDetector>
  );
}
