"use client";

import { Stage, Layer, Image, Transformer, Text } from "react-konva";
import { useImage } from "@/hooks/useImage";
import { useEffect, useRef, useState } from "react";

export default function Canvas({ content, onTransformChange }) {
  const [image] = useImage(content.type === "image" ? content.src : null);
  const [isSelected, setIsSelected] = useState(false);
  const shapeRef = useRef();
  const transformerRef = useRef();

  useEffect(() => {
    if (isSelected) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const onTransformEnd = (e) => {
    const node = e.target;
    const newTransform = {
      x: node.x(),
      y: node.y(),
      width: node.width() * node.scaleX(),
      height: node.height() * node.scaleY(),
      rotation: node.rotation(),
    };
    onTransformChange(newTransform);
  };

  return (
    <Stage width={500} height={700}>
      <Layer>
        {content.type === "image" && image && (
          <Image
            image={image}
            ref={shapeRef}
            draggable
            onClick={() => setIsSelected(!isSelected)}
            onTap={() => setIsSelected(!isSelected)}
            onTransformEnd={onTransformEnd}
            {...content.transform}
          />
        )}
        {content.type === "text" && (
          <Text
            text={content.text}
            ref={shapeRef}
            draggable
            onClick={() => setIsSelected(!isSelected)}
            onTap={() => setIsSelected(!isSelected)}
            onTransformEnd={onTransformEnd}
            {...content.transform}
          />
        )}
        {isSelected && <Transformer ref={transformerRef} />}
      </Layer>
    </Stage>
  );
}
