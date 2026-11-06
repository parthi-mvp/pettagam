import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { EASE_OUT } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

/**
 * Small illustrations for empty lists, one per kind of list. Each plays once when it appears
 * (an empty state is seen now and then, so it may take ~0.6s), then holds still: no idle loops,
 * nothing running while you read. Reduced motion: the finished picture, faded in.
 * Only transform and opacity animate, on the UI thread; the drawings are static SVG.
 */
export type EmptyArtKind = 'accounts' | 'transactions' | 'budgets' | 'goals' | 'investments' | 'tags' | 'search' | 'calendar' | 'chart';

const W = 128;
const H = 96;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** 0 → 1 after `delay` ms, eased out. With reduced motion it starts at 1. */
function useEnter(delay: number, duration = 420) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT, reduceMotion: ReduceMotion.System })));
  }, [delay, duration, p, reduced]);
  return p;
}

/** A positioned layer that rises / scales / turns into place as `p` goes 0 → 1. */
function Layer({
  p,
  children,
  style,
  y = 0,
  x = 0,
  scale = 1,
  rotate = 0,
  origin,
}: {
  p: SharedValue<number>;
  children: ReactNode;
  style: ViewStyle;
  y?: number;
  x?: number;
  scale?: number;
  rotate?: number;
  origin?: ViewStyle['transformOrigin'];
}) {
  const a = useAnimatedStyle(() => {
    const v = p.get();
    const k = 1 - v;
    return {
      opacity: Math.min(v * 1.6, 1),
      transform: [{ translateX: x * k }, { translateY: y * k }, { scale: 1 - (1 - scale) * k }, { rotate: `${rotate * k}deg` }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', transformOrigin: origin }, style, a]}>{children}</Animated.View>;
}

const Box = ({ children }: { children: ReactNode }) => (
  <View style={{ width: W, height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {children}
  </View>
);

function useInk() {
  const [primary, soft, brass, brassSoft, fill, line, surface, muted] = useThemeColors([
    'primary',
    'primary-soft',
    'brass',
    'brass-soft',
    'fill',
    'line',
    'surface',
    'fg-muted',
  ] as const);
  return { primary, soft, brass, brassSoft, fill, line, surface, muted };
}

/** Two cards: the back one settles, the front one slides up over it and straightens. */
function AccountsArt() {
  const c = useInk();
  const back = useEnter(0);
  const front = useEnter(120, 520);
  return (
    <Box>
      <Layer p={back} y={8} style={{ left: 14, top: 14 }}>
        <Svg width={84} height={54} style={{ transform: [{ rotate: '-7deg' }] }}>
          <Rect x={0} y={0} width={84} height={54} rx={9} fill={c.soft} />
        </Svg>
      </Layer>
      <Layer p={front} y={18} rotate={6} style={{ left: 30, top: 30 }}>
        <Svg width={86} height={56}>
          <Rect x={0} y={0} width={86} height={56} rx={9} fill={c.primary} />
          <Rect x={10} y={14} width={14} height={11} rx={2.5} fill={c.brass} />
          <Rect x={10} y={37} width={30} height={4} rx={2} fill="#ffffff" opacity={0.55} />
          <Rect x={46} y={37} width={14} height={4} rx={2} fill="#ffffff" opacity={0.35} />
          <Circle cx={68} cy={16} r={6} fill="#ffffff" opacity={0.25} />
          <Circle cx={76} cy={16} r={6} fill="#ffffff" opacity={0.18} />
        </Svg>
      </Layer>
    </Box>
  );
}

/** A receipt drops in, then its lines write themselves one after another. */
function TransactionsArt() {
  const c = useInk();
  const paper = useEnter(0);
  const rows = [useEnter(160), useEnter(230), useEnter(300)];
  const total = useEnter(380);
  const dots = [c.brass, c.primary, c.muted];
  return (
    <Box>
      <Layer p={paper} y={-10} style={{ left: 32, top: 6 }}>
        <Svg width={64} height={84}>
          <Path d="M0 6a6 6 0 0 1 6-6h52a6 6 0 0 1 6 6v74l-8-4-8 4-8-4-8 4-8-4-8 4-8-4-8 4z" fill={c.surface} stroke={c.line} strokeWidth={1.5} />
        </Svg>
      </Layer>
      {rows.map((p, i) => (
        <Layer key={i} p={p} x={-6} style={{ left: 42, top: 18 + i * 14 }}>
          <Svg width={44} height={8}>
            <Circle cx={4} cy={4} r={3.5} fill={dots[i]} />
            <Rect x={12} y={2} width={i === 1 ? 18 : 22} height={4} rx={2} fill={c.fill} />
            <Rect x={36} y={2} width={8} height={4} rx={2} fill={c.line} />
          </Svg>
        </Layer>
      ))}
      <Layer p={total} x={-6} style={{ left: 42, top: 64 }}>
        <Svg width={44} height={6}>
          <Rect x={0} y={0} width={16} height={5} rx={2.5} fill={c.line} />
          <Rect x={28} y={0} width={16} height={5} rx={2.5} fill={c.primary} />
        </Svg>
      </Layer>
    </Box>
  );
}

/** A ring fills to about two thirds: a limit with room left. */
function BudgetsArt() {
  const c = useInk();
  const ring = useEnter(80, 700);
  const r = 32;
  const len = 2 * Math.PI * r;
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - 0.64 * ring.get()) }));
  const hub = useEnter(0);
  return (
    <Box>
      <Layer p={hub} scale={0.92} style={{ left: (W - 84) / 2, top: (H - 84) / 2 }}>
        <Svg width={84} height={84}>
          <Circle cx={42} cy={42} r={r} stroke={c.fill} strokeWidth={10} fill="none" />
          <AnimatedCircle
            cx={42}
            cy={42}
            r={r}
            stroke={c.primary}
            strokeWidth={10}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${len} ${len}`}
            animatedProps={props}
            transform="rotate(-90 42 42)"
          />
          <Circle cx={42} cy={42} r={9} fill={c.brassSoft} />
          <Circle cx={42} cy={42} r={4} fill={c.brass} />
        </Svg>
      </Layer>
    </Box>
  );
}

/** A coin drops into a jar and the jar fills a little. */
function GoalsArt() {
  const c = useInk();
  const jar = useEnter(0);
  const coin = useEnter(140, 460);
  const level = useEnter(460, 520);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.25 + 0.75 * level.get() }] }));
  return (
    <Box>
      <Layer p={jar} y={6} style={{ left: 40, top: 22 }}>
        <View style={{ width: 48, height: 66 }}>
          <Animated.View
            style={[{ position: 'absolute', left: 5, right: 5, bottom: 5, height: 26, borderRadius: 7, backgroundColor: c.soft, transformOrigin: 'bottom' }, fillStyle]}
          />
          <Svg width={48} height={66} style={{ position: 'absolute' }}>
            <Rect x={1} y={8} width={46} height={57} rx={11} stroke={c.primary} strokeWidth={2} fill="none" />
            <Rect x={8} y={1} width={32} height={9} rx={3} fill={c.primary} />
          </Svg>
        </View>
      </Layer>
      <Layer p={coin} y={-30} style={{ left: 55, top: 39 }}>
        <Svg width={18} height={18}>
          <Circle cx={9} cy={9} r={8} fill={c.brass} />
          <Circle cx={9} cy={9} r={4.5} fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.6} />
        </Svg>
      </Layer>
    </Box>
  );
}

/** Three bars grow from the ground; a leaf opens on the tallest. */
function InvestmentsArt() {
  const c = useInk();
  const bars = [useEnter(0), useEnter(70), useEnter(140)];
  const leaf = useEnter(380, 480);
  const heights = [26, 40, 58];
  return (
    <Box>
      <View style={{ position: 'absolute', left: 22, right: 22, bottom: 10, height: 1.5, backgroundColor: c.line }} />
      {bars.map((p, i) => (
        <Layer key={i} p={p} scale={0.2} origin="bottom" style={{ left: 34 + i * 22, bottom: 11.5, width: 16, height: heights[i], borderRadius: 5, backgroundColor: i === 2 ? c.primary : c.soft }}>
          <View />
        </Layer>
      ))}
      <Layer p={leaf} scale={0.5} rotate={-30} origin="bottom left" style={{ left: 86, top: 4 }}>
        <Svg width={22} height={22}>
          <Path d="M2 20C2 9 9 2 20 2C20 13 13 20 2 20Z" fill={c.brass} />
          <Path d="M2 20L12 10" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
        </Svg>
      </Layer>
    </Box>
  );
}

/** A tag swings in on its string and comes to rest. */
function TagsArt() {
  const c = useInk();
  const reduced = useReducedMotion();
  const swing = useSharedValue(reduced ? 0 : -24);
  const show = useEnter(0, 240);
  useEffect(() => {
    if (!reduced) swing.set(withSpring(0, { duration: 900, dampingRatio: 0.45, reduceMotion: ReduceMotion.System }));
  }, [reduced, swing]);
  const a = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ rotate: `${swing.get()}deg` }] }));
  return (
    <Box>
      <Svg width={W} height={24} style={{ position: 'absolute', top: 0 }}>
        <Line x1={64} y1={0} x2={64} y2={16} stroke={c.line} strokeWidth={1.5} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 64 - 30, top: 14, width: 60, height: 76, transformOrigin: '50% 6px' }, a]}>
        <Svg width={60} height={76}>
          <Path d="M30 0L56 22V68A6 6 0 0 1 50 74H10A6 6 0 0 1 4 68V22Z" fill={c.brassSoft} stroke={c.brass} strokeWidth={1.5} strokeLinejoin="round" />
          <Circle cx={30} cy={20} r={4.5} fill={c.surface} stroke={c.brass} strokeWidth={1.5} />
          <Rect x={16} y={38} width={28} height={5} rx={2.5} fill={c.brass} opacity={0.8} />
          <Rect x={16} y={50} width={18} height={5} rx={2.5} fill={c.brass} opacity={0.45} />
        </Svg>
      </Animated.View>
    </Box>
  );
}

/** A magnifier passes over faint lines and finds nothing. */
function SearchArt() {
  const c = useInk();
  const lines = useEnter(0);
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const e = Easing.bezier(0.77, 0, 0.175, 1);
    x.set(withDelay(120, withSequence(withTiming(-18, { duration: 360, easing: e }), withTiming(10, { duration: 420, easing: e }), withTiming(0, { duration: 300, easing: e }))));
  }, [reduced, x]);
  const glass = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Box>
      <Layer p={lines} y={4} style={{ left: 20, top: 18 }}>
        <Svg width={88} height={60}>
          {[0, 1, 2, 3].map((i) => (
            <Rect key={i} x={0} y={i * 15} width={i % 2 ? 60 : 88} height={6} rx={3} fill={c.fill} />
          ))}
        </Svg>
      </Layer>
      <Animated.View style={[{ position: 'absolute', left: 44, top: 14 }, glass]}>
        <Svg width={48} height={56}>
          <Circle cx={20} cy={20} r={15} fill={c.surface} fillOpacity={0.7} stroke={c.primary} strokeWidth={3} />
          <Line x1={31} y1={31} x2={43} y2={45} stroke={c.primary} strokeWidth={5} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Box>
  );
}

/** A calendar page settles; one day is marked, and a ring pulses out from it twice. */
function CalendarArt() {
  const c = useInk();
  const page = useEnter(0);
  const mark = useEnter(260, 300);
  const reduced = useReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!reduced) ring.set(withDelay(520, withRepeat(withTiming(1, { duration: 900, easing: EASE_OUT }), 2, false)));
  }, [reduced, ring]);
  const pulse = useAnimatedStyle(() => ({ opacity: ring.get() === 0 ? 0 : 0.5 * (1 - ring.get()), transform: [{ scale: 1 + ring.get() * 0.9 }] }));
  const cell = (col: number, row: number) => ({ x: 9 + col * 13, y: 26 + row * 12 });
  const marked = cell(3, 1);
  return (
    <Box>
      <Layer p={page} y={8} style={{ left: 26, top: 8 }}>
        <Svg width={76} height={80}>
          <Rect x={0} y={4} width={76} height={74} rx={10} fill={c.surface} stroke={c.line} strokeWidth={1.5} />
          <Path d="M0 14a10 10 0 0 1 10-10h56a10 10 0 0 1 10 10v4H0z" fill={c.primary} />
          <Rect x={18} y={0} width={4} height={10} rx={2} fill={c.muted} />
          <Rect x={54} y={0} width={4} height={10} rx={2} fill={c.muted} />
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 5 }, (_, col) => {
              const p = cell(col, row);
              return <Rect key={`${row}-${col}`} x={p.x} y={p.y} width={7} height={6} rx={2} fill={c.fill} />;
            })
          )}
        </Svg>
      </Layer>
      <Animated.View
        style={[{ position: 'absolute', left: 26 + marked.x - 4.5, top: 8 + marked.y - 5, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.brass }, pulse]}
      />
      <Layer p={mark} scale={0.6} style={{ left: 26 + marked.x - 4.5, top: 8 + marked.y - 5 }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c.brass }} />
      </Layer>
    </Box>
  );
}

/** Five bars rise in turn; the last one, this month, in the accent. */
function ChartArt() {
  const c = useInk();
  const bars = [useEnter(0), useEnter(50), useEnter(100), useEnter(150), useEnter(200)];
  const heights = [30, 46, 22, 52, 38];
  return (
    <Box>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ position: 'absolute', left: 14, right: 14, top: 22 + i * 22, height: 1, backgroundColor: c.line, opacity: 0.6 }} />
      ))}
      {bars.map((p, i) => (
        <Layer
          key={i}
          p={p}
          scale={0.15}
          origin="bottom"
          style={{ left: 22 + i * 18, bottom: 18, width: 12, height: heights[i], borderRadius: 4, backgroundColor: i === 4 ? c.brass : c.soft }}>
          <View />
        </Layer>
      ))}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 17, height: 1.5, backgroundColor: c.line }} />
    </Box>
  );
}

const ART: Record<EmptyArtKind, () => ReactNode> = {
  accounts: AccountsArt,
  transactions: TransactionsArt,
  budgets: BudgetsArt,
  goals: GoalsArt,
  investments: InvestmentsArt,
  tags: TagsArt,
  search: SearchArt,
  calendar: CalendarArt,
  chart: ChartArt,
};

export function EmptyArt({ kind }: { kind: EmptyArtKind }) {
  const Art = ART[kind];
  return <Art />;
}
