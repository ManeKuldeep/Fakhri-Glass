import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Canvas, Line, Rect, vec } from '@shopify/react-native-skia';
import { CuttingSheet, PlacedPiece } from '../types';
import InteractivePiece from './InteractivePiece';
import { ResultOffcut, WastedRect, KerfCut } from '../../../optimizer/types';

interface CutCanvasProps {
  sheet: CuttingSheet;
  placedPieces: PlacedPiece[];
  allSheets: CuttingSheet[];
  offcuts: ResultOffcut[];
  wastedRects: WastedRect[];
  kerfCuts: KerfCut[];
  kerfMm: number;
  onUpdatePosition: (pieceId: string, x_mm: number, y_mm: number) => void;
  onRotatePiece: (pieceId: string) => void;
  onMoveToSheet: (pieceId: string, targetSheetId: string) => void;
  onRemoveToTray: (pieceId: string) => void;
}

export default function CutCanvas({
  sheet,
  placedPieces,
  allSheets,
  offcuts,
  wastedRects,
  kerfCuts,
  kerfMm,
  onUpdatePosition,
  onRotatePiece,
  onMoveToSheet,
  onRemoveToTray,
}: CutCanvasProps) {
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }

  const { width: cW, height: cH } = containerSize;
  const padding = 24;

  const { scale, originX, originY, sheetPxW, sheetPxH } = useMemo(() => {
    if (cW <= 0 || cH <= 0 || sheet.width_mm <= 0 || sheet.height_mm <= 0) {
      return { scale: 1, originX: 0, originY: 0, sheetPxW: 0, sheetPxH: 0 };
    }

    const availableW = cW - padding * 2;
    const availableH = cH - padding * 2;

    const s = Math.min(availableW / sheet.width_mm, availableH / sheet.height_mm);
    const pxW = sheet.width_mm * s;
    const pxH = sheet.height_mm * s;
    const ox = (cW - pxW) / 2;
    const oy = (cH - pxH) / 2;

    return { scale: s, originX: ox, originY: oy, sheetPxW: pxW, sheetPxH: pxH };
  }, [cW, cH, sheet.width_mm, sheet.height_mm]);

  // Generate vertical flute lines if lining glass
  const fluteLines = useMemo(() => {
    if (!sheet.is_lining || sheetPxW <= 0) return [];
    const step = 20; // 20px intervals
    const lines: number[] = [];
    for (let x = originX + step; x < originX + sheetPxW; x += step) {
      lines.push(x);
    }
    return lines;
  }, [sheet.is_lining, originX, sheetPxW]);

  const isLining = sheet.is_lining ?? false;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {cW > 0 && cH > 0 && (
        <>
          {/* Skia Canvas for Sheet, Texture, Offcuts, and Cut lines */}
          <Canvas style={{ width: cW, height: cH }}>
            {/* Sheet Background Glass Rectangle */}
            <Rect
              x={originX}
              y={originY}
              width={sheetPxW}
              height={sheetPxH}
              color="#F8FAFC"
            />

            {/* Figured Glass Vertical Flutes Pattern */}
            {isLining &&
              fluteLines.map((lx, i) => (
                <Line
                  key={`flute-${i}`}
                  p1={vec(lx, originY)}
                  p2={vec(lx, originY + sheetPxH)}
                  color="#E2E8F0"
                  strokeWidth={1}
                />
              ))}

            {/* Offcut Regions (greenish transparent) */}
            {offcuts.map((o, idx) => (
              <Rect
                key={`offcut-${idx}`}
                x={originX + o.x_mm * scale}
                y={originY + o.y_mm * scale}
                width={Math.max(1, o.width_mm * scale)}
                height={Math.max(1, o.height_mm * scale)}
                color="rgba(16, 185, 129, 0.16)"
              />
            ))}

            {/* Wasted Regions (reddish-gray transparent) */}
            {wastedRects.map((w, idx) => (
              <Rect
                key={`waste-${idx}`}
                x={originX + w.x_mm * scale}
                y={originY + w.y_mm * scale}
                width={Math.max(1, w.width_mm * scale)}
                height={Math.max(1, w.height_mm * scale)}
                color="rgba(239, 68, 68, 0.12)"
              />
            ))}

            {/* Kerf Cut Score Lines (amber blade loss) */}
            {kerfCuts.map((k, idx) => (
              <Rect
                key={`kerf-${idx}`}
                x={originX + k.x_mm * scale}
                y={originY + k.y_mm * scale}
                width={Math.max(1.5, k.width_mm * scale)}
                height={Math.max(1.5, k.height_mm * scale)}
                color="#F59E0B"
              />
            ))}
          </Canvas>

          {/* Border around the Sheet with mm dimension tags */}
          <View
            style={[
              styles.sheetBorder,
              {
                left: originX,
                top: originY,
                width: sheetPxW,
                height: sheetPxH,
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.sheetTopTag}>
              <Text style={styles.sheetTagText}>
                {sheet.source === 'offcut' ? 'Offcut Sheet' : 'Full Sheet'} ·{' '}
                {sheet.width_mm} × {sheet.height_mm} mm
              </Text>
            </View>
          </View>

          {/* Interactive Placed Pieces on this Sheet */}
          {placedPieces.map((piece) => {
            const others = placedPieces.filter((p) => p.id !== piece.id);
            return (
              <InteractivePiece
                key={piece.id}
                piece={piece}
                sheet={sheet}
                scale={scale}
                originX={originX}
                originY={originY}
                kerfMm={kerfMm}
                allSheets={allSheets}
                otherPiecesOnSheet={others}
                onUpdatePosition={onUpdatePosition}
                onRotatePiece={onRotatePiece}
                onMoveToSheet={onMoveToSheet}
                onRemoveToTray={onRemoveToTray}
              />
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Dark slate workshop background makes glass sheets pop!
    position: 'relative',
    overflow: 'hidden',
  },
  sheetBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderRadius: 8,
  },
  sheetTopTag: {
    position: 'absolute',
    top: -24,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sheetTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
});
