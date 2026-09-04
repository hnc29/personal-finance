import React, { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { DashboardScreen } from "../screens/DashboardScreen";
import { LedgerScreen } from "../screens/LedgerScreen";
import { AssetsScreen } from "../screens/AssetsScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { useAuth } from "../context/AuthContext";

const Tab = createBottomTabNavigator();

export const RootNavigator = () => {
  const { user, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === "android" ? 14 : 10);
  const tabHeight = 58 + bottomInset;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    if (authMode === "register") {
      return <RegisterScreen onNavigateToLogin={() => setAuthMode("login")} />;
    }
    return <LoginScreen onNavigateToRegister={() => setAuthMode("register")} />;
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";

          if (route.name === "Dashboard") {
            iconName = focused ? "pie-chart" : "pie-chart-outline";
          } else if (route.name === "Ledger") {
            iconName = focused ? "wallet" : "wallet-outline";
          } else if (route.name === "Assets") {
            iconName = focused ? "sparkles" : "sparkles-outline";
          } else if (route.name === "Settings") {
            iconName = focused ? "settings" : "settings-outline";
          }

          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: "Tổng quan" }}
      />
      <Tab.Screen
        name="Ledger"
        component={LedgerScreen}
        options={{ tabBarLabel: "Sổ cái" }}
      />
      <Tab.Screen
        name="Assets"
        component={AssetsScreen}
        options={{ tabBarLabel: "Tài sản" }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: "Cài đặt" }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
