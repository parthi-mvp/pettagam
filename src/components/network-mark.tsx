import { memo } from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { CardNetwork } from '@/catalog/networks';

/**
 * A card network's mark, drawn as simple vectors (not the official artwork) so it stays crisp at any
 * size. `tone="onCard"` is for the dark card faces (light wordmarks); `"surface"` for app backgrounds.
 * Width follows the mark's own proportions; give the height.
 */
export const NetworkMark = memo(function NetworkMark({
  network,
  height = 22,
  tone = 'onCard',
}: {
  network: CardNetwork;
  height?: number;
  tone?: 'onCard' | 'surface';
}) {
  const ink = tone === 'onCard' ? '#ffffff' : '#1a1f71';
  switch (network) {
    case 'visa':
      return (
        <Svg width={height * 2.6} height={height} viewBox="0 0 52 20">
          <SvgText x={26} y={16.5} fontSize={18} fontWeight="900" fontStyle="italic" letterSpacing={-0.5} fill={ink} textAnchor="middle">
            VISA
          </SvgText>
        </Svg>
      );
    case 'mastercard':
    case 'maestro': {
      const right = network === 'mastercard' ? '#f79e1b' : '#00a2e5';
      const left = network === 'mastercard' ? '#eb001b' : '#e7001a';
      return (
        <Svg width={height * 1.6} height={height} viewBox="0 0 32 20">
          <Circle cx={11} cy={10} r={9} fill={left} />
          <Circle cx={21} cy={10} r={9} fill={right} />
          {/* The overlap, in the blend the real mark shows. */}
          <Path d="M16 2.6a9 9 0 0 1 0 14.8a9 9 0 0 1 0-14.8z" fill={network === 'mastercard' ? '#ff5f00' : '#7375cf'} />
        </Svg>
      );
    }
    case 'rupay':
      return (
        <Svg width={height * 3} height={height} viewBox="0 0 60 20">
          <SvgText x={0} y={15.5} fontSize={16} fontWeight="900" fontStyle="italic" fill={ink}>
            RuPay
          </SvgText>
          <Path d="M50 3l6 7-6 7z" fill="#f47920" />
          <Path d="M45 3l6 7-6 7z" fill="#1b8e3f" />
        </Svg>
      );
    case 'amex':
      return (
        <Svg width={height * 1.6} height={height} viewBox="0 0 32 20">
          <Rect width={32} height={20} rx={3} fill="#2671b9" />
          <SvgText x={16} y={13.5} fontSize={8.5} fontWeight="900" fill="#ffffff" textAnchor="middle" letterSpacing={0.3}>
            AMEX
          </SvgText>
        </Svg>
      );
    case 'diners':
      return (
        <Svg width={height * 1.2} height={height} viewBox="0 0 24 20">
          <Circle cx={12} cy={10} r={9} fill="none" stroke={tone === 'onCard' ? '#ffffff' : '#0079be'} strokeWidth={2} />
          <Path d="M9 4.8v10.4M15 4.8v10.4" stroke={tone === 'onCard' ? '#ffffff' : '#0079be'} strokeWidth={2} />
        </Svg>
      );
    case 'discover':
      return (
        <Svg width={height * 3.4} height={height} viewBox="0 0 68 20">
          <SvgText x={0} y={14.5} fontSize={13} fontWeight="800" fill={ink} letterSpacing={0.5}>
            DISC
          </SvgText>
          <Circle cx={41} cy={10} r={5.5} fill="#f58220" />
          <SvgText x={47.5} y={14.5} fontSize={13} fontWeight="800" fill={ink} letterSpacing={0.5}>
            VER
          </SvgText>
        </Svg>
      );
    case 'unionpay':
      return (
        <Svg width={height * 1.6} height={height} viewBox="0 0 32 20">
          <G>
            <Path d="M4 1h9l-4 18H0z" fill="#e21836" />
            <Path d="M13 1h9l-4 18H9z" fill="#00447c" />
            <Path d="M22 1h10l-4 18h-10z" fill="#007b84" />
          </G>
          <SvgText x={17} y={13} fontSize={6.5} fontWeight="900" fill="#ffffff" textAnchor="middle">
            UP
          </SvgText>
        </Svg>
      );
  }
});
