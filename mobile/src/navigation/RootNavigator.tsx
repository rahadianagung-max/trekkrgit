import React from "react";
import { ActivityIndicator, View, Text, useColorScheme } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme";
import LoginScreen from "@/screens/LoginScreen";
import PassportScreen from "@/screens/PassportScreen";
import RankingsScreen from "@/screens/RankingsScreen";

const Tab = createBottomTabNavigator();

// Emoji tab icon (keeps deps minimal — no vector-icons package needed for MVP).
function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color, opacity: 1 }}>{emoji}</Text>;
}

function AppTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: t.orange,
        tabBarInactiveTintColor: t.faint,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
      }}
    >
      <Tab.Screen
        name="Passport"
        component={PassportScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon emoji="🎾" color={color} /> }}
      />
      <Tab.Screen
        name="Rankings"
        component={RankingsScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon emoji="🏆" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { session, loading } = useAuth();
  const t = useTheme();
  const scheme = useColorScheme();

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: t.bg, card: t.card, border: t.line, primary: t.orange, text: t.ink },
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.orange} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {session ? <AppTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
