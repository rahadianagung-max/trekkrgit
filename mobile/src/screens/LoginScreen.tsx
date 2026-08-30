import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, Linking, ScrollView,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme";

export default function LoginScreen() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    setErr("");
    if (!email.trim() || password.length < 1) {
      setErr("Isi email dan password.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e: any) {
      setErr(e?.message === "Invalid login credentials" ? "Email atau password salah." : (e?.message || "Gagal masuk."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={[s.brand, { color: t.ink }]}>Trekk<Text style={{ color: t.orange }}>r</Text></Text>
        <Text style={[s.sub, { color: t.mu }]}>Masuk ke akun pemainmu.</Text>

        <View style={{ height: 28 }} />

        <Text style={[s.label, { color: t.mu }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="email@contoh.com"
          placeholderTextColor={t.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.card }]}
        />

        <Text style={[s.label, { color: t.mu, marginTop: 14 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={t.faint}
          secureTextEntry
          autoComplete="password"
          style={[s.input, { color: t.ink, borderColor: t.line, backgroundColor: t.card }]}
        />

        {!!err && <Text style={[s.err, { color: t.red }]}>{err}</Text>}

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={[s.btn, { backgroundColor: t.orange, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Masuk</Text>}
        </Pressable>

        <Pressable onPress={() => Linking.openURL("https://trekkr.online/join")} style={s.link}>
          <Text style={[s.linkText, { color: t.mu }]}>
            Belum punya akun? <Text style={{ color: t.orange, fontWeight: "700" }}>Daftar / klaim profil</Text>
          </Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("https://trekkr.online/reset")} style={s.link}>
          <Text style={[s.linkText, { color: t.faint }]}>Lupa password?</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 480, width: "100%", alignSelf: "center" },
  brand: { fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  sub: { fontSize: 15, marginTop: 6 },
  label: { fontSize: 12.5, fontWeight: "700", marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15.5 },
  err: { fontSize: 13.5, fontWeight: "600", marginTop: 14 },
  btn: { marginTop: 20, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  link: { marginTop: 18, alignItems: "center" },
  linkText: { fontSize: 14 },
});
