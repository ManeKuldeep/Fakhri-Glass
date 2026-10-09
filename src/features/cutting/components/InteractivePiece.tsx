import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CuttingSheet, PlacedPiece } from '../types';

interface InteractivePieceProps {
  piece: PlacedPiece;
  sheet: CuttingSheet;
  scale: number;
  originX: number;
  originY: number;
  kerfMm: number;
  otherPiecesOnSheet: PlacedPiece[];
  isSelected: boolean;
  onSelect: () => void;
  onUpdatePosition: (pieceId: string, x_mm: number, y_mm: number) => void;
}

export default function InteractivePiece({
  piece,
  sheet,
  scale,
  originX,
  originY,
  kerfMm,
  otherPiecesOnSheet,
  isSelected,
  onSelect,
  onUpdatePosition,
}: InteractivePieceProps) {
  // Position offsets during dragging
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Check if lining
  const isLining = (piece.is_lining ?? false) || (sheet.is_lining ?? false);

  function handleDragEnd(dx: number, dy: number) {
    const rawX_mm = Math.round(piece.x_mm + dx / scale);
    const rawY_mm = Math.round(piece.y_mm + dy / scale);

    let finalX = rawX_mm;
    let finalY = rawY_mm;

    // Snap threshold: 25 mm
    const snapThreshold = 25;

    // 1. Snap to sheet boundaries
    if (Math.abs(finalX) < snapThreshold) finalX = 0;
    if (Math.abs(finalX + piece.w_mm - sheet.width_mm) < snapThreshold) {
      finalX = sheet.width_mm - piece.w_mm;
    }
    if (Math.abs(finalY) < snapThreshold) finalY = 0;
    if (Math.abs(finalY + piece.h_mm - sheet.height_mm) < snapThreshold) {
      finalY = sheet.height_mm - piece.h_mm;
    }

    // 2. Snap to other pieces
    for (const other of otherPiecesOnSheet) {
      // Snap right of other (with kerf)
      if (Math.abs(finalX - (other.x_mm + other.w_mm + kerfMm)) < snapThreshold) {
        finalX = other.x_mm + other.w_mm + kerfMm;
      }
      // Snap left of other (with kerf)
      if (Math.abs(finalX + piece.w_mm + kerfMm - other.x_mm) < snapThreshold) {
        finalX = other.x_mm - piece.w_mm - kerfMm;
      }
      // Snap below other (with kerf)
      if (Math.abs(finalY - (other.y_mm + other.h_mm + kerfMm)) < snapThreshold) {
        finalY = other.y_mm + other.h_mm + kerfMm;
      }
      // Snap above other (with kerf)
      if (Math.abs(finalY + piece.h_mm + kerfMm - other.y_mm) < snapThreshold) {
        finalY = other.y_mm - piece.h_mm - kerfMm;
      }
      // Edge alignments
      if (Math.abs(finalX - other.x_mm) < snapThreshold) finalX = other.x_mm;
      if (Math.abs(finalY - other.y_mm) < snapThreshold) finalY = other.y_mm;
    }

    // Clamp inside sheet
    finalX = Math.max(0, Math.min(sheet.width_mm - piece.w_mm, finalX));
    finalY = Math.max(0, Math.min(sheet.height_mm - piece.h_mm, finalY));

    translateX.value = 0;
    translateY.value = 0;

    onUpdatePosition(piece.id, finalX, finalY);
  }

  const panGesture = Gesture.Pan()
    .minDistance(6)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(handleDragEnd)(event.translationX, event.translationY);
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(350)
    .onEnd(() => {
      runOnJS(onSelect)();
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  const pxX = originX + piece.x_mm * scale;
  const pxY = originY + piece.y_mm * scale;
  const pxW = Math.max(piece.w_mm * scale, 2);
  const pxH = Math.max(piece.h_mm * scale, 2);

  const hasCollision = piece.hasCollision;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.pieceBox,
          {
            left: pxX,
            top: pxY,
            width: pxW,
            height: pxH,
          },
          hasCollision && styles.collisionBox,
          isSelected && styles.selectedBox,
          animatedStyle,
        ]}
      >
        <View style={styles.innerContent}>
          <View style={styles.topRow}>
            <Text
              style={[
                styles.orderNumber,
                hasCollision && styles.collisionText,
                isSelected && styles.selectedText,
              ]}
              numberOfLines={1}
            >
              #{piece.order_no} ({piece.piece_index}/{piece.total_qty})
            </Text>
            {hasCollision ? (
              <MaterialCommunityIcons name="alert" size={14} color="#EF4444" />
            ) : null}
          </View>

          <Text
            style={[styles.dimensionText, hasCollision && styles.collisionText]}
            numberOfLines={1}
          >
            {piece.w_mm} × {piece.h_mm}
          </Text>

          {isLining ? (
            <MaterialCommunityIcons
              name="arrow-up-down"
              size={12}
              color="#B45309"
              style={styles.grainIcon}
            />
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pieceBox: {
    position: 'absolute',
    backgroundColor: '#DBEAFE',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 6,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  collisionBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
    borderWidth: 2,
  },
  selectedBox: {
    borderColor: '#10B981',
    borderWidth: 2.5,
    backgroundColor: '#D1FAE5',
    elevation: 6,
    zIndex: 999,
  },
  innerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  orderNumber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  dimensionText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#1E3A8A',
    marginTop: 1,
  },
  collisionText: {
    color: '#991B1B',
  },
  selectedText: {
    color: '#065F46',
  },
  grainIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});
