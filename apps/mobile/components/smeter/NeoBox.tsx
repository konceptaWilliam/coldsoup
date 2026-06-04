import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { NB } from "./constants";

// Neo-brutalist container: 2px black border + a hard offset shadow rendered as
// a solid black block down-right (RN has no `4px 4px 0 black` box-shadow). The
// outer black layer plus bottom/right padding produces the offset; `pressed`
// collapses it (and the caller translates) to mimic the web hover/press.
interface NeoBoxProps {
  children: ReactNode;
  offset?: number;
  bg?: string;
  pressed?: boolean;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
}

export function NeoBox({ children, offset = 4, bg = NB.white, pressed = false, style, innerStyle }: NeoBoxProps) {
  const o = pressed ? 0 : offset;
  return (
    <View style={[{ backgroundColor: NB.black, paddingRight: o, paddingBottom: o }, style]}>
      <View style={[{ backgroundColor: bg, borderWidth: 2, borderColor: NB.black }, innerStyle]}>
        {children}
      </View>
    </View>
  );
}
