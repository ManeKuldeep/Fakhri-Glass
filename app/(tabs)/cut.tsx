import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from 'expo-router';
import OrderQueueList from '../../src/features/cutting/components/OrderQueueList';
import CutWorkspace from '../../src/features/cutting/components/CutWorkspace';
import CutSettingsModal from '../../src/features/cutting/components/CutSettingsModal';
import { CuttingQueueTask } from '../../src/features/cutting/types';

export default function CutScreen() {
  const navigation = useNavigation();
  const [selectedTask, setSelectedTask] = useState<CuttingQueueTask | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerShown: !selectedTask,
      tabBarStyle: selectedTask ? { display: 'none' } : undefined,
    });
  }, [selectedTask, navigation]);

  return (
    <View style={styles.container}>
      {selectedTask ? (
        <CutWorkspace
          task={selectedTask}
          onBack={() => setSelectedTask(null)}
        />
      ) : (
        <OrderQueueList
          onSelectTask={(task) => setSelectedTask(task)}
          onOpenSettings={() => setSettingsModalVisible(true)}
        />
      )}

      <CutSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
