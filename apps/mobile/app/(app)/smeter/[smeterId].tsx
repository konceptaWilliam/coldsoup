import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import * as haptics from "@/lib/haptics";
import { NeoBox } from "@/components/smeter/NeoBox";
import { PainFace } from "@/components/smeter/PainFace";
import { VotingCard } from "@/components/smeter/VotingCard";
import { ProgressBar } from "@/components/smeter/ProgressBar";
import { DayDetail } from "@/components/smeter/DayDetail";
import { NB, clampScore } from "@/components/smeter/constants";
import { getDayLabel, getDayShort } from "@/components/smeter/labels";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc/router";

type GetData = inferRouterOutputs<AppRouter>["smeters"]["get"];

export default function SMeterScreen() {
  const { t } = useTranslation();
  const { smeterId } = useLocalSearchParams<{ smeterId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.smeters.get.useQuery({ smeterId }, { enabled: !!smeterId });
  const submit = trpc.smeters.submit.useMutation({
    onSuccess: () => {
      haptics.success();
      utils.smeters.get.invalidate({ smeterId });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t("smeter.submitFailed");
      if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg); }
      else Alert.alert(t("smeter.submitFailedTitle"), msg);
    },
  });

  // Live updates as other members vote (drives waiting → stats reveal).
  useEffect(() => {
    if (!smeterId) return;
    const channel = supabase
      .channel(`smeter-${smeterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "smeter_responses", filter: `smeter_id=eq.${smeterId}` },
        () => utils.smeters.get.invalidate({ smeterId })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [smeterId, utils]);

  return (
    <View style={{ flex: 1, backgroundColor: NB.surface }}>
      {/* Neo-brutal header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: NB.black, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(app)"); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Feather name="chevron-left" size={26} color={NB.black} />
        </Pressable>
        <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 18, fontWeight: "800", color: NB.black }} numberOfLines={1}>
          {data?.title || t("smeter.defaultTitle")}
        </Text>
      </View>

      {isLoading || !data ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={NB.black} />
        </View>
      ) : data.stats ? (
        <StatsView data={data} stats={data.stats} />
      ) : data.myResponses ? (
        <WaitingView data={data} />
      ) : (
        <VotingView data={data} isPending={submit.isPending} onSubmit={(responses) => submit.mutate({ smeterId, responses })} />
      )}
    </View>
  );
}

// ── Voting ────────────────────────────────────────────────────────────────
function VotingView({ data, isPending, onSubmit }: { data: GetData; isPending: boolean; onSubmit: (r: { dayIndex: number; painScore: number }[]) => void }) {
  const { t } = useTranslation();
  const total = data.mode === "dates" && data.customDates ? data.customDates.length : 7;
  const [day, setDay] = useState(0);
  const [scores, setScores] = useState<Record<number, number>>({});

  const currentScore = scores[day] ?? null;
  const isLast = day === total - 1;
  const allScored = Object.keys(scores).length === total;

  function handleSubmit() {
    if (!allScored || isPending) return;
    onSubmit(Object.entries(scores).map(([d, s]) => ({ dayIndex: Number(d), painScore: s })));
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <ProgressBar current={day} total={total} label={t("smeter.dayProgress", { current: day + 1, total })} />

      <VotingCard
        title={t("smeter.howFits", { day: getDayLabel(day, data.customDates, t) })}
        selectedScore={currentScore}
        onSelect={(s) => { haptics.selection(); setScores((prev) => ({ ...prev, [day]: s })); }}
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        {day > 0 && (
          <Pressable onPress={() => setDay((d) => d - 1)} style={{ flex: 1 }}>
            <NeoBox bg={NB.white}>
              <View style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "800", color: NB.black }}>{t("smeter.prevDay")}</Text>
              </View>
            </NeoBox>
          </Pressable>
        )}
        {isLast ? (
          <Pressable onPress={handleSubmit} disabled={!allScored || isPending} style={{ flex: 2 }}>
            <NeoBox bg={NB.yellow} pressed={!allScored || isPending}>
              <View style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "800", color: NB.black, opacity: allScored && !isPending ? 1 : 0.4 }}>
                  {isPending ? t("smeter.submitting") : t("smeter.submit")}
                </Text>
              </View>
            </NeoBox>
          </Pressable>
        ) : (
          <Pressable onPress={() => setDay((d) => d + 1)} disabled={!currentScore} style={{ flex: 2 }}>
            <NeoBox bg={NB.yellow} pressed={!currentScore}>
              <View style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "800", color: NB.black, opacity: currentScore ? 1 : 0.4 }}>
                  {t("smeter.nextDay")}
                </Text>
              </View>
            </NeoBox>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

// ── Waiting ───────────────────────────────────────────────────────────────
function WaitingView({ data }: { data: GetData }) {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <NeoBox bg={NB.white}>
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={{ fontFamily: "monospace", fontSize: 18, fontWeight: "800", color: NB.black }}>{t("smeter.waitingTitle")}</Text>
          <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "700", color: NB.muted }}>
            {t("smeter.votedOf", { voted: data.votedCount, total: data.memberCount })}
          </Text>
          <View style={{ gap: 8 }}>
            {data.members.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: NB.black, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: NB.white }}>
                <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "700", color: NB.black }} numberOfLines={1}>{m.display_name}</Text>
                <View style={{ borderWidth: 2, borderColor: NB.black, backgroundColor: m.hasVoted ? NB.green : NB.red, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "800", color: NB.black, letterSpacing: 0.5 }}>
                    {m.hasVoted ? t("smeter.voted") : t("smeter.pending")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </NeoBox>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
        {[1, 3, 5].map((v) => <PainFace key={v} value={v} size="sm" />)}
      </View>
    </ScrollView>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────
function StatsView({ data, stats }: { data: GetData; stats: NonNullable<GetData["stats"]> }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(stats.bestDay);
  const cd = data.customDates;
  const best = stats.days[stats.bestDay];
  const worst = stats.days[stats.worstDay];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
      {/* Best / worst */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <NeoBox bg={NB.green}>
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "800", color: NB.black, letterSpacing: 1, textTransform: "uppercase" }}>{t("smeter.bestDay")}</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "800", color: NB.black }}>{getDayLabel(best.dayIndex, cd, t)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <PainFace value={clampScore(best.avg)} size="md" />
                <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "800", color: NB.black }}>{best.avg.toFixed(1)}</Text>
              </View>
            </View>
          </NeoBox>
        </View>
        <View style={{ flex: 1 }}>
          <NeoBox bg={NB.red}>
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "800", color: NB.black, letterSpacing: 1, textTransform: "uppercase" }}>{t("smeter.worstDay")}</Text>
              <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "800", color: NB.black }}>{getDayLabel(worst.dayIndex, cd, t)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <PainFace value={clampScore(worst.avg)} size="md" />
                <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "800", color: NB.black }}>{worst.avg.toFixed(1)}</Text>
              </View>
            </View>
          </NeoBox>
        </View>
      </View>

      {/* Overview grid */}
      <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "800", color: NB.black, textTransform: "uppercase", letterSpacing: 1 }}>{t("smeter.overview")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {stats.days.map((d, idx) => {
          const active = idx === selected;
          return (
            <Pressable key={d.dayIndex} onPress={() => { haptics.selection(); setSelected(idx); }} style={{ width: "13.5%", minWidth: 44 }}>
              <NeoBox bg={active ? NB.yellow : NB.white} pressed={active} offset={3}>
                <View style={{ paddingVertical: 6, alignItems: "center", gap: 2 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "800", color: NB.black }} numberOfLines={1}>
                    {getDayShort(d.dayIndex, cd, t).slice(0, 6)}
                  </Text>
                  <PainFace value={clampScore(d.avg)} size="sm" />
                  <Text style={{ fontFamily: "monospace", fontSize: 9, fontWeight: "700", color: NB.black }}>{d.avg.toFixed(1)}</Text>
                </View>
              </NeoBox>
            </Pressable>
          );
        })}
      </View>

      {/* Selected day detail */}
      {stats.days[selected] && (
        <DayDetail day={stats.days[selected]} title={getDayLabel(stats.days[selected].dayIndex, cd, t)} />
      )}
    </ScrollView>
  );
}
