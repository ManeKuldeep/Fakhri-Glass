import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import FakhriLogo from '../../src/components/common/FakhriLogo';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: IconName;
  focusedIcon: IconName;
}

const TABS: TabConfig[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', focusedIcon: 'home' },
  { name: 'inventory', title: 'Inventory', icon: 'package-variant', focusedIcon: 'package-variant-closed' },
  { name: 'orders', title: 'Orders', icon: 'clipboard-text-outline', focusedIcon: 'clipboard-text' },
  { name: 'cut', title: 'Cut', icon: 'content-cut', focusedIcon: 'content-cut' },
  { name: 'settings', title: 'Settings', icon: 'cog-outline', focusedIcon: 'cog' },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#FFFFFF', elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: '#0F172A' },
        tabBarActiveTintColor: '#1A73E8',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          height: 60 + (insets.bottom > 0 ? insets.bottom : 0),
          paddingBottom: bottomPadding,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            ...(tab.name === 'index'
              ? {
                  headerTitle: () => <FakhriLogo variant="horizontal" size={26} />,
                }
              : {}),
            tabBarIcon: ({ color, focused, size }) => (
              <MaterialCommunityIcons
                name={focused ? tab.focusedIcon : tab.icon}
                color={color}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
