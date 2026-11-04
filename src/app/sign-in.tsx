import { Redirect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/session';
import { ChestMark, Icon } from '@/components/icons';
import { BackButton, Button, Field, HeroBackdrop, SegmentedControl, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useWelcomeSeen } from '@/onboarding/welcome-seen';
import { DURATION } from '@/theme/motion';
import { useThemeColors } from '@/theme/useThemeColor';

/** Signed out, the app always opens on the welcome screens; sign-in is reached from there. */
export default function SignIn() {
  const welcomeSeen = useWelcomeSeen((st) => st.seen);
  if (!welcomeSeen) return <Redirect href="/welcome" />;
  return <SignInForm />;
}

function SignInForm() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [accent, muted] = useThemeColors(['brass', 'fg-muted'] as const);
  // The welcome screen opens this in either mode ("Create your account" / "I already have one").
  const params = useLocalSearchParams<{ mode?: 'signIn' | 'signUp' }>();
  const [mode, setMode] = useState<'signIn' | 'signUp'>(params.mode === 'signUp' ? 'signUp' : 'signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signingUp = mode === 'signUp';

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (signingUp && !name.trim()) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      if (signingUp) await signUp(e, password, name.trim());
      else await signIn(e, password);
      haptic.success();
    } catch (err) {
      haptic.error();
      const msg = err instanceof Error ? err.message : String(err);
      setError(/network/i.test(msg) ? 'No internet connection. Signing in needs to be online once.' : msg);
    } finally {
      setBusy(false);
    }
  };

  const pickMode = (m: 'signIn' | 'signUp') => {
    setMode(m);
    setError(null);
  };

  // Back to the welcome screens: sign-in redirects there while they're "unseen".
  const back = () => useWelcomeSeen.setState({ seen: false });

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="grow" bounces={false}>
        {/* Hero: brand and what this screen is for; the welcome screens already told the story. */}
        <Animated.View entering={FadeIn.duration(DURATION.sheet)} className="overflow-hidden bg-hero px-6 pb-14" style={{ paddingTop: insets.top + 12 }}>
          <HeroBackdrop />
          <View className="h-10 flex-row items-center justify-between">
            <BackButton tone="hero" onPress={back} />
            <View className="flex-row items-center gap-2">
              <ChestMark size={20} color={accent} />
              <Text variant="label" tone="onHero">
                Pettagam
              </Text>
            </View>
            <View className="w-10" />
          </View>

          <Text variant="display" tone="onHero" accessibilityRole="header" className="mt-9 text-[30px] leading-[36px]" style={{ letterSpacing: -0.6 }}>
            {signingUp ? 'Create your\naccount' : 'Welcome\nback'}
          </Text>
          <Text variant="body" className="mt-2 text-on-hero-muted">
            {signingUp ? 'Takes a minute. Your strongbox is backed up only to your account.' : 'Sign in to open your strongbox.'}
          </Text>
        </Animated.View>

        {/* Panel: overlaps the hero, like the add-transaction screen. */}
        <Animated.View
          entering={FadeInDown.duration(DURATION.release).delay(80)}
          layout={LinearTransition.duration(DURATION.release)}
          className="-mt-7 grow gap-5 rounded-t-[28px] bg-canvas px-6 pt-6"
          style={{ paddingBottom: insets.bottom + 20 }}>
          <SegmentedControl
            options={[
              { value: 'signIn', label: 'Sign in' },
              { value: 'signUp', label: 'Create account' },
            ]}
            value={mode}
            onChange={pickMode}
          />

          <View className="gap-3">
            {signingUp ? (
              <Animated.View entering={FadeInDown.duration(DURATION.release)}>
                <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Priya" />
              </Animated.View>
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              textContentType={signingUp ? 'newPassword' : 'password'}
              placeholder={signingUp ? 'At least 8 characters' : 'Your password'}
              onSubmitEditing={submit}
              returnKeyType="go"
              accessory={
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  className="active:opacity-60">
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} color={muted} />
                </Pressable>
              }
            />
          </View>

          {error ? (
            <Animated.View entering={FadeIn.duration(DURATION.release)} className="rounded-[12px] bg-danger-soft px-3.5 py-3" accessibilityLiveRegion="polite">
              <Text variant="small" tone="danger">
                {error}
              </Text>
            </Animated.View>
          ) : null}

          <Button
            size="lg"
            title={busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}
            trailingIcon={busy ? undefined : 'arrowRight'}
            disabled={busy}
            onPress={submit}
          />

          <View className="mt-auto flex-row items-center justify-center gap-2 pt-4">
            <Icon name="lock" size={14} color={muted} strokeWidth={2} />
            <Text variant="caption" align="center">
              Your data stays on this phone, backed up only to your account
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
