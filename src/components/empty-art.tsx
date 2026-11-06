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
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { EASE_OUT } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

/**
 * Illustrations for empty lists, one small scene per kind of list: a soft backdrop, the main
 * object, a few supporting pieces and brass sparkles. Each plays once as it appears (an empty
 * state is seen now and then, so ~0.8s of choreography is fine), then holds still: no idle loops,
 * nothing running while you read. Reduced motion: the finished scene.
 * Only transform and opacity animate (plus SVG dash offsets), on the UI thread.
 */
export type EmptyArtKind = 'accounts' | 'transactions' | 'budgets' | 'goals' | 'investments' | 'tags' | 'search' | 'calendar' | 'chart';

const W = 240;
const H = 176;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** 0 → 1 after `delay` ms, eased out. With reduced motion it starts at 1. */
function useEnter(delay: number, duration = 460) {
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

function useInk() {
  const [primary, mid, soft, brass, brassSoft, brassFg, fill, line, surface, muted, canvas] = useThemeColors([
    'primary',
    'primary-mid',
    'primary-soft',
    'brass',
    'brass-soft',
    'brass-fg',
    'fill',
    'line',
    'surface',
    'fg-muted',
    'canvas',
  ] as const);
  return { primary, mid, soft, brass, brassSoft, brassFg, fill, line, surface, muted, canvas };
}
type Ink = ReturnType<typeof useInk>;

/** Four-point sparkle centred on (x, y). */
const sparkle = (x: number, y: number, s: number) => `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;

/** The shared stage: a soft disc, a ground shadow, and sparkles that twinkle in last. */
function Stage({ c, children, sparkles = [[34, 40, 7], [204, 30, 5], [214, 118, 6]] }: { c: Ink; children: ReactNode; sparkles?: number[][] }) {
  const disc = useEnter(0, 520);
  const glints = useEnter(620, 380);
  return (
    <View style={{ width: W, height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Layer p={disc} scale={0.86} style={{ left: 0, top: 0 }}>
        <Svg width={W} height={H}>
          <Circle cx={120} cy={86} r={78} fill={c.soft} opacity={0.55} />
          <Circle cx={120} cy={86} r={58} fill={c.soft} opacity={0.5} />
          <Ellipse cx={120} cy={160} rx={66} ry={6} fill={c.line} opacity={0.7} />
        </Svg>
      </Layer>
      {children}
      <Layer p={glints} scale={0.4} style={{ left: 0, top: 0 }}>
        <Svg width={W} height={H}>
          {sparkles.map(([x, y, s], i) => (
            <Path key={i} d={sparkle(x, y, s)} fill={i === 1 ? c.primary : c.brass} opacity={i === 1 ? 0.7 : 0.9} />
          ))}
          <Circle cx={52} cy={128} r={3} fill={c.brass} opacity={0.5} />
          <Circle cx={190} cy={56} r={2.5} fill={c.primary} opacity={0.5} />
        </Svg>
      </Layer>
    </View>
  );
}

/** A coin with a rim and ₹, `r` its radius. */
function Coin({ c, r = 13 }: { c: Ink; r?: number }) {
  return (
    <Svg width={r * 2 + 2} height={r * 2 + 4}>
      <Circle cx={r + 1} cy={r + 3} r={r} fill={c.brassFg} />
      <Circle cx={r + 1} cy={r + 1} r={r} fill={c.brass} />
      <Circle cx={r + 1} cy={r + 1} r={r * 0.7} fill="none" stroke="#ffffff" strokeOpacity={0.45} strokeWidth={1.4} />
      <SvgText x={r + 1} y={r + 1 + r * 0.36} fontSize={r * 1.05} fontWeight="700" fill="#ffffff" fillOpacity={0.9} textAnchor="middle">
        ₹
      </SvgText>
    </Svg>
  );
}

/* ---------- Accounts: three cards fan out of a stack, coins beside ---------- */

function Card({ w, h, color, children }: { w: number; h: number; color: string; children?: ReactNode }) {
  return (
    <Svg width={w} height={h}>
      <Rect x={0} y={0} width={w} height={h} rx={12} fill={color} />
      {children}
    </Svg>
  );
}

function AccountsArt() {
  const c = useInk();
  const cards = [useEnter(80, 520), useEnter(170, 520), useEnter(260, 560)];
  const coins = useEnter(520, 420);
  const CW = 116;
  const CH = 74;
  return (
    <Stage c={c}>
      <Layer p={cards[0]} y={18} rotate={12} origin="bottom left" style={{ left: 50, top: 40 }}>
        <View style={{ transform: [{ rotate: '-16deg' }] }}>
          <Card w={CW} h={CH} color={c.brassSoft}>
            <Rect x={12} y={52} width={40} height={6} rx={3} fill={c.brass} opacity={0.5} />
          </Card>
        </View>
      </Layer>
      <Layer p={cards[1]} y={18} rotate={8} origin="bottom left" style={{ left: 58, top: 46 }}>
        <View style={{ transform: [{ rotate: '-5deg' }] }}>
          <Card w={CW} h={CH} color={c.mid}>
            <Rect x={12} y={52} width={46} height={6} rx={3} fill="#ffffff" opacity={0.35} />
          </Card>
        </View>
      </Layer>
      <Layer p={cards[2]} y={24} rotate={-8} origin="bottom left" style={{ left: 66, top: 60 }}>
        <View style={{ transform: [{ rotate: '6deg' }] }}>
          <Card w={CW} h={CH} color={c.primary}>
            <Rect x={14} y={18} width={20} height={15} rx={3.5} fill={c.brass} />
            <Path d="M14 25.5h20M24 18v15" stroke={c.brassFg} strokeWidth={1} opacity={0.6} />
            <Path d="M42 20a6 6 0 0 1 0 11M47 17a10 10 0 0 1 0 17" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.5} />
            {[0, 1, 2, 3].map((g) => (
              <G key={g}>
                {[0, 1, 2, 3].map((d) => (
                  <Circle key={d} cx={16 + g * 24 + d * 4.5} cy={48} r={1.5} fill="#ffffff" opacity={g === 3 ? 0.85 : 0.45} />
                ))}
              </G>
            ))}
            <Rect x={14} y={58} width={36} height={5} rx={2.5} fill="#ffffff" opacity={0.4} />
            <Circle cx={88} cy={60} r={7} fill={c.brass} opacity={0.9} />
            <Circle cx={97} cy={60} r={7} fill="#ffffff" opacity={0.35} />
          </Card>
        </View>
      </Layer>
      <Layer p={coins} y={10} style={{ left: 170, top: 112 }}>
        <View>
          <View style={{ position: 'absolute', top: 10 }}>
            <Coin c={c} r={12} />
          </View>
          <View style={{ position: 'absolute', top: 4 }}>
            <Coin c={c} r={12} />
          </View>
          <Coin c={c} r={12} />
        </View>
      </Layer>
    </Stage>
  );
}

/* ---------- Transactions: a receipt prints its lines; a coin and a tick join ---------- */

function TransactionsArt() {
  const c = useInk();
  const paper = useEnter(60, 520);
  const rows = [useEnter(240), useEnter(310), useEnter(380), useEnter(450)];
  const total = useEnter(530);
  const coin = useEnter(600, 420);
  const tick = useEnter(680, 380);
  const dots = [c.brass, c.primary, '#C76B5B', c.mid];
  const widths = [34, 26, 38, 22];
  return (
    <Stage c={c}>
      <Layer p={paper} y={-16} style={{ left: 72, top: 18 }}>
        <Svg width={96} height={136}>
          <Path d="M0 10a10 10 0 0 1 10-10h76a10 10 0 0 1 10 10v124l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5z" fill={c.surface} stroke={c.line} strokeWidth={1.5} />
          <Circle cx={48} cy={20} r={9} fill={c.soft} />
          <Path d="M44 20h8M48 16v8" stroke={c.primary} strokeWidth={2} strokeLinecap="round" />
          <Rect x={30} y={34} width={36} height={4} rx={2} fill={c.fill} />
          <Line x1={12} y1={46} x2={84} y2={46} stroke={c.line} strokeWidth={1.2} />
          <Line x1={12} y1={104} x2={84} y2={104} stroke={c.line} strokeWidth={1.2} />
        </Svg>
      </Layer>
      {rows.map((p, i) => (
        <Layer key={i} p={p} x={-8} style={{ left: 84, top: 70 + i * 12 }}>
          <Svg width={72} height={8}>
            <Circle cx={4} cy={4} r={3.5} fill={dots[i]} />
            <Rect x={12} y={2} width={widths[i]} height={4} rx={2} fill={c.fill} />
            <Rect x={58} y={2} width={14} height={4} rx={2} fill={c.line} />
          </Svg>
        </Layer>
      ))}
      <Layer p={total} x={-8} style={{ left: 84, top: 128 }}>
        <Svg width={72} height={8}>
          <Rect x={0} y={1} width={24} height={6} rx={3} fill={c.muted} opacity={0.5} />
          <Rect x={46} y={0} width={26} height={8} rx={4} fill={c.primary} />
        </Svg>
      </Layer>
      <Layer p={coin} y={-14} scale={0.7} style={{ left: 160, top: 26 }}>
        <Coin c={c} r={15} />
      </Layer>
      <Layer p={tick} scale={0.5} style={{ left: 54, top: 104 }}>
        <Svg width={30} height={30}>
          <Circle cx={15} cy={15} r={14} fill={c.primary} />
          <Path d="M9 15.5l4 4 8-9" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Layer>
    </Stage>
  );
}

/* ---------- Budgets: a donut draws its slices in turn; a legend fills in ---------- */

function Slice({ p, start, frac, color, r, w }: { p: SharedValue<number>; start: number; frac: number; color: string; r: number; w: number }) {
  const len = 2 * Math.PI * r;
  const seg = len * frac;
  const props = useAnimatedProps(() => ({ strokeDashoffset: seg * (1 - p.get()) }));
  return (
    <AnimatedCircle
      cx={60}
      cy={60}
      r={r}
      stroke={color}
      strokeWidth={w}
      fill="none"
      strokeDasharray={`${seg} ${len}`}
      animatedProps={props}
      transform={`rotate(${-90 + start * 360} 60 60)`}
    />
  );
}

function BudgetsArt() {
  const c = useInk();
  const base = useEnter(40, 420);
  const s = [useEnter(160, 520), useEnter(420, 360), useEnter(600, 300)];
  const legend = [useEnter(500), useEnter(580), useEnter(660)];
  const slices = [
    { start: 0, frac: 0.42, color: c.primary },
    { start: 0.43, frac: 0.2, color: c.brass },
    { start: 0.64, frac: 0.12, color: c.mid },
  ];
  return (
    <Stage c={c}>
      <Layer p={base} scale={0.9} style={{ left: 44, top: 26 }}>
        <Svg width={120} height={120}>
          <Circle cx={60} cy={60} r={44} stroke={c.fill} strokeWidth={18} fill="none" />
          {slices.map((x, i) => (
            <Slice key={i} p={s[i]} {...x} r={44} w={18} />
          ))}
          <Circle cx={60} cy={60} r={28} fill={c.surface} />
          <SvgText x={60} y={68} fontSize={22} fontWeight="600" fill={c.muted} textAnchor="middle">
            ₹
          </SvgText>
        </Svg>
      </Layer>
      {legend.map((p, i) => (
        <Layer key={i} p={p} x={10} style={{ left: 168, top: 58 + i * 20 }}>
          <Svg width={44} height={12}>
            <Rect x={0} y={1} width={10} height={10} rx={3} fill={slices[i].color} />
            <Rect x={16} y={3.5} width={i === 0 ? 28 : i === 1 ? 20 : 14} height={5} rx={2.5} fill={c.line} />
          </Svg>
        </Layer>
      ))}
    </Stage>
  );
}

/* ---------- Goals: a coin drops into a jar of savings; a flag marks the target ---------- */

function GoalsArt() {
  const c = useInk();
  const jar = useEnter(60, 500);
  const level = useEnter(300, 600);
  const coin = useEnter(520, 520);
  const flag = useEnter(420, 520);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.2 + 0.8 * level.get() }] }));
  return (
    <Stage c={c} sparkles={[[40, 44, 7], [196, 24, 5], [206, 128, 6]]}>
      <Layer p={jar} y={10} style={{ left: 78, top: 32 }}>
        <View style={{ width: 84, height: 122 }}>
          <Animated.View style={[{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 54, borderRadius: 12, overflow: 'hidden', transformOrigin: 'bottom' }, fillStyle]}>
            <Svg width={68} height={54}>
              <Rect x={0} y={0} width={68} height={54} fill={c.soft} />
              {[
                [18, 42],
                [40, 44],
                [30, 32],
                [52, 34],
                [14, 22],
              ].map(([x, y], i) => (
                <G key={i}>
                  <Ellipse cx={x} cy={y + 2} rx={10} ry={4.5} fill={c.brassFg} />
                  <Ellipse cx={x} cy={y} rx={10} ry={4.5} fill={c.brass} />
                </G>
              ))}
            </Svg>
          </Animated.View>
          <Svg width={84} height={122} style={{ position: 'absolute' }}>
            <Rect x={2} y={14} width={80} height={106} rx={18} stroke={c.primary} strokeWidth={2.5} fill="none" />
            <Rect x={12} y={2} width={60} height={16} rx={5} fill={c.primary} />
            <Rect x={20} y={7} width={44} height={3} rx={1.5} fill="#ffffff" opacity={0.3} />
            <Rect x={14} y={36} width={56} height={20} rx={6} fill={c.brassSoft} />
            <Rect x={22} y={43.5} width={26} height={5} rx={2.5} fill={c.brass} />
            <Path d="M14 70v28" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" opacity={0.25} />
          </Svg>
        </View>
      </Layer>
      <Layer p={coin} y={-40} style={{ left: 106, top: 6 }}>
        <Coin c={c} r={14} />
      </Layer>
      <Layer p={flag} scale={0.6} origin="bottom left" style={{ left: 172, top: 58 }}>
        <Svg width={40} height={100}>
          <Rect x={2} y={0} width={3} height={98} rx={1.5} fill={c.muted} />
          <Path d="M5 4h28l-7 9 7 9H5z" fill={c.brass} />
          <Ellipse cx={4} cy={97} rx={10} ry={3} fill={c.line} />
        </Svg>
      </Layer>
    </Stage>
  );
}

/* ---------- Investments: a plant grows from a pot; bars rise behind it ---------- */

function InvestmentsArt() {
  const c = useInk();
  const bars = [useEnter(60), useEnter(130), useEnter(200)];
  const pot = useEnter(120, 480);
  const stem = useEnter(320, 520);
  const leaves = [useEnter(560, 460), useEnter(640, 460), useEnter(720, 460)];
  const coin = useEnter(700, 420);
  const heights = [44, 70, 96];
  return (
    <Stage c={c}>
      {bars.map((p, i) => (
        <Layer
          key={i}
          p={p}
          scale={0.15}
          origin="bottom"
          style={{ left: i < 2 ? 40 + i * 26 : 178, bottom: 18, width: 20, height: heights[i], borderRadius: 6, backgroundColor: i === 2 ? c.mid : c.soft, opacity: 0.9 }}>
          <View />
        </Layer>
      ))}
      <Layer p={stem} scale={0.05} origin="bottom" style={{ left: 104, top: 36 }}>
        <Svg width={32} height={84}>
          <Path d="M16 84C16 60 14 40 18 8" stroke={c.primary} strokeWidth={4} strokeLinecap="round" fill="none" />
        </Svg>
      </Layer>
      <Layer p={leaves[0]} scale={0.3} rotate={-40} origin="bottom right" style={{ left: 82, top: 74 }}>
        <Svg width={38} height={30}>
          <Path d="M38 28C24 30 4 24 0 6C16 0 34 8 38 28Z" fill={c.mid} />
          <Path d="M38 28C26 20 14 14 6 9" stroke="#ffffff" strokeWidth={1.4} opacity={0.5} fill="none" />
        </Svg>
      </Layer>
      <Layer p={leaves[1]} scale={0.3} rotate={40} origin="bottom left" style={{ left: 122, top: 54 }}>
        <Svg width={40} height={32}>
          <Path d="M0 30C14 32 36 26 40 6C24 0 4 8 0 30Z" fill={c.primary} />
          <Path d="M0 30C12 22 24 16 34 10" stroke="#ffffff" strokeWidth={1.4} opacity={0.5} fill="none" />
        </Svg>
      </Layer>
      <Layer p={leaves[2]} scale={0.3} origin="bottom" style={{ left: 108, top: 20 }}>
        <Svg width={28} height={24}>
          <Path d="M14 24C2 20 0 8 6 0C18 2 26 12 14 24Z" fill={c.brass} />
        </Svg>
      </Layer>
      <Layer p={pot} y={12} style={{ left: 84, top: 112 }}>
        <Svg width={72} height={50}>
          <Ellipse cx={36} cy={8} rx={30} ry={6} fill={c.brassFg} />
          <Path d="M4 6h64l-8 42a4 4 0 0 1-4 2H16a4 4 0 0 1-4-2z" fill={c.brass} />
          <Rect x={2} y={2} width={68} height={10} rx={4} fill={c.brass} />
          <Rect x={2} y={2} width={68} height={10} rx={4} fill="#ffffff" opacity={0.18} />
        </Svg>
      </Layer>
      <Layer p={coin} y={-10} scale={0.7} style={{ left: 158, top: 32 }}>
        <Coin c={c} r={12} />
      </Layer>
    </Stage>
  );
}

/* ---------- Tags: two tags swing in on their strings and come to rest ---------- */

function Swing({ from, delay, children, style }: { from: number; delay: number; children: ReactNode; style: ViewStyle }) {
  const reduced = useReducedMotion();
  const r = useSharedValue(reduced ? 0 : from);
  const show = useEnter(delay, 260);
  useEffect(() => {
    if (!reduced) r.set(withDelay(delay, withSpring(0, { duration: 1000, dampingRatio: 0.42, reduceMotion: ReduceMotion.System })));
  }, [delay, r, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={[{ position: 'absolute', transformOrigin: 'top center' }, style, a]}>{children}</Animated.View>;
}

function Tag({ c, color, ink, w, h }: { c: Ink; color: string; ink: string; w: number; h: number }) {
  const s = 34;
  return (
    <Svg width={w} height={h + s}>
      <Line x1={w / 2} y1={0} x2={w / 2} y2={s + 10} stroke={c.muted} strokeWidth={1.5} />
      <Path d={`M${w / 2} ${s}L${w - 2} ${s + 22}V${s + h - 8}A6 6 0 0 1 ${w - 8} ${s + h - 2}H8A6 6 0 0 1 2 ${s + h - 8}V${s + 22}Z`} fill={color} />
      <Circle cx={w / 2} cy={s + 16} r={5} fill={c.canvas} />
      <Circle cx={w / 2} cy={s + 16} r={5} fill="none" stroke={ink} strokeWidth={1.5} />
      <Rect x={12} y={s + 36} width={w - 24} height={6} rx={3} fill={ink} opacity={0.85} />
      <Rect x={12} y={s + 50} width={(w - 24) * 0.6} height={6} rx={3} fill={ink} opacity={0.45} />
    </Svg>
  );
}

function TagsArt() {
  const c = useInk();
  const pin = useEnter(0, 300);
  return (
    <Stage c={c} sparkles={[[38, 60, 7], [204, 40, 5], [200, 126, 6]]}>
      <Layer p={pin} scale={0.6} style={{ left: 110, top: 8 }}>
        <Svg width={20} height={20}>
          <Circle cx={10} cy={10} r={8} fill={c.primary} />
          <Circle cx={8} cy={8} r={2.5} fill="#ffffff" opacity={0.5} />
        </Svg>
      </Layer>
      <Swing from={-28} delay={120} style={{ left: 92, top: 16 }}>
        <View style={{ transform: [{ rotate: '24deg' }], transformOrigin: 'top center' }}>
          <Tag c={c} color={c.soft} ink={c.primary} w={56} h={78} />
        </View>
      </Swing>
      <Swing from={22} delay={260} style={{ left: 120 - 34, top: 16 }}>
        <View style={{ transform: [{ rotate: '-10deg' }], transformOrigin: 'top center' }}>
          <Tag c={c} color={c.brassSoft} ink={c.brass} w={68} h={96} />
        </View>
      </Swing>
    </Stage>
  );
}

/* ---------- Search: a magnifier passes over a page and finds nothing ---------- */

function SearchArt() {
  const c = useInk();
  const page = useEnter(40, 480);
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    x.set(withDelay(300, withSequence(withTiming(-46, { duration: 520, easing: IN_OUT }), withTiming(20, { duration: 560, easing: IN_OUT }), withTiming(0, { duration: 420, easing: IN_OUT }))));
    y.set(withDelay(300, withSequence(withTiming(-14, { duration: 520, easing: IN_OUT }), withTiming(18, { duration: 560, easing: IN_OUT }), withTiming(0, { duration: 420, easing: IN_OUT }))));
  }, [reduced, x, y]);
  const show = useEnter(200, 300);
  const glass = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  return (
    <Stage c={c}>
      <Layer p={page} y={12} style={{ left: 62, top: 22 }}>
        <Svg width={104} height={128}>
          <Rect x={0} y={0} width={104} height={128} rx={14} fill={c.surface} stroke={c.line} strokeWidth={1.5} />
          {[0, 1, 2, 3, 4].map((i) => (
            <G key={i}>
              <Circle cx={18} cy={24 + i * 21} r={5} fill={i === 1 ? c.brassSoft : c.fill} />
              <Rect x={30} y={21 + i * 21} width={i % 2 ? 40 : 58} height={6} rx={3} fill={c.fill} />
            </G>
          ))}
        </Svg>
      </Layer>
      <Animated.View style={[{ position: 'absolute', left: 116, top: 58 }, glass]}>
        <Svg width={80} height={90}>
          <Line x1={50} y1={52} x2={72} y2={80} stroke={c.brassFg} strokeWidth={11} strokeLinecap="round" />
          <Line x1={50} y1={52} x2={70} y2={78} stroke={c.brass} strokeWidth={9} strokeLinecap="round" />
          <Circle cx={32} cy={32} r={27} fill={c.canvas} fillOpacity={0.55} stroke={c.primary} strokeWidth={6} />
          <Path d="M18 26a15 15 0 0 1 12-10" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" opacity={0.5} fill="none" />
        </Svg>
      </Animated.View>
    </Stage>
  );
}

/* ---------- Calendar: a page settles, a day is marked with a pulse, a bell rings once ---------- */

function CalendarArt() {
  const c = useInk();
  const page = useEnter(40, 500);
  const mark = useEnter(420, 320);
  const reduced = useReducedMotion();
  const ring = useSharedValue(0);
  const bellR = useSharedValue(0);
  const bell = useEnter(300, 360);
  useEffect(() => {
    if (reduced) return;
    ring.set(withDelay(680, withRepeat(withTiming(1, { duration: 1000, easing: EASE_OUT }), 2, false)));
    bellR.set(withDelay(560, withSequence(...[16, -14, 10, -6, 3, 0].map((v) => withTiming(v, { duration: 110, easing: IN_OUT })))));
  }, [reduced, ring, bellR]);
  const pulse = useAnimatedStyle(() => ({ opacity: ring.get() === 0 ? 0 : 0.6 * (1 - ring.get()), transform: [{ scale: 1 + ring.get() * 1.1 }] }));
  const bellStyle = useAnimatedStyle(() => ({ opacity: bell.get(), transform: [{ rotate: `${bellR.get()}deg` }] }));
  const cell = (col: number, row: number) => ({ x: 12 + col * 17, y: 44 + row * 17 });
  const marked = cell(4, 1);
  const PX = 52;
  const PY = 26;
  return (
    <Stage c={c} sparkles={[[30, 50, 6], [212, 24, 5], [32, 132, 5]]}>
      <Layer p={page} y={12} style={{ left: PX, top: PY }}>
        <Svg width={134} height={128}>
          <Rect x={0} y={8} width={134} height={118} rx={16} fill={c.surface} stroke={c.line} strokeWidth={1.5} />
          <Path d="M0 24a16 16 0 0 1 16-16h102a16 16 0 0 1 16 16v8H0z" fill={c.primary} />
          <Rect x={30} y={0} width={7} height={18} rx={3.5} fill={c.muted} />
          <Rect x={97} y={0} width={7} height={18} rx={3.5} fill={c.muted} />
          <Rect x={46} y={17} width={42} height={6} rx={3} fill="#ffffff" opacity={0.5} />
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 7 }, (_, col) => {
              const p = cell(col, row);
              return <Rect key={`${row}-${col}`} x={p.x} y={p.y} width={11} height={10} rx={3} fill={col > 4 ? c.soft : c.fill} />;
            })
          )}
        </Svg>
      </Layer>
      <Animated.View
        style={[{ position: 'absolute', left: PX + marked.x - 5, top: PY + marked.y - 5, width: 21, height: 20, borderRadius: 8, borderWidth: 2, borderColor: c.brass }, pulse]}
      />
      <Layer p={mark} scale={0.5} style={{ left: PX + marked.x - 5, top: PY + marked.y - 5 }}>
        <View style={{ width: 21, height: 20, borderRadius: 7, backgroundColor: c.brass }} />
      </Layer>
      <Animated.View style={[{ position: 'absolute', left: 166, top: 10, transformOrigin: '50% 4px' }, bellStyle]}>
        <Svg width={48} height={52}>
          <Circle cx={24} cy={5} r={3.5} fill={c.brassFg} />
          <Path d="M24 7c-10 0-15 8-15 17v9l-4 6h38l-4-6v-9c0-9-5-17-15-17z" fill={c.brass} />
          <Path d="M15 24c0-6 3-10 7-11" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" opacity={0.45} fill="none" />
          <Circle cx={24} cy={44} r={5} fill={c.brassFg} />
        </Svg>
      </Animated.View>
    </Stage>
  );
}

/* ---------- Chart: a report card's bars rise in turn; this month in brass ---------- */

function ChartArt() {
  const c = useInk();
  const card = useEnter(40, 480);
  const bars = [useEnter(220), useEnter(270), useEnter(320), useEnter(370), useEnter(420), useEnter(470)];
  const coin = useEnter(640, 420);
  const heights = [34, 52, 28, 62, 44, 72];
  const CX = 44;
  const CY = 30;
  return (
    <Stage c={c}>
      <Layer p={card} y={12} style={{ left: CX, top: CY }}>
        <Svg width={152} height={120}>
          <Rect x={0} y={0} width={152} height={120} rx={16} fill={c.surface} stroke={c.line} strokeWidth={1.5} />
          <Rect x={14} y={14} width={40} height={6} rx={3} fill={c.muted} opacity={0.5} />
          <Rect x={14} y={26} width={64} height={9} rx={4.5} fill={c.fill} />
          {[0, 1, 2].map((i) => (
            <Line key={i} x1={14} y1={52 + i * 18} x2={138} y2={52 + i * 18} stroke={c.line} strokeWidth={1} opacity={0.8} />
          ))}
          <Line x1={14} y1={106} x2={138} y2={106} stroke={c.line} strokeWidth={1.5} />
        </Svg>
      </Layer>
      {bars.map((p, i) => (
        <Layer
          key={i}
          p={p}
          scale={0.1}
          origin="bottom"
          style={{ left: CX + 20 + i * 20, top: CY + 106 - heights[i], width: 12, height: heights[i], borderRadius: 4, backgroundColor: i === 5 ? c.brass : i === 3 ? c.mid : c.soft }}>
          <View />
        </Layer>
      ))}
      <Layer p={coin} y={-12} scale={0.7} style={{ left: 178, top: 14 }}>
        <Coin c={c} r={14} />
      </Layer>
    </Stage>
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
