"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePrintCalculator } from "@/hooks/usePrintCalculator";
import { useCart } from "@/hooks/useCart";

export default function Estimator() {
  const [quantity, setQuantity] = useState(100);
  const [trimSize, setTrimSize] = useState("8.5x11");
  const [customTrimWidth, setCustomTrimWidth] = useState("");
  const [customTrimHeight, setCustomTrimHeight] = useState("");
  const [paperStock, setPaperStock] = useState("100lb Text");
  const [pages, setPages] = useState(16);

  const isCustomTrim = trimSize === "custom";

  const { price, calculatePrice } = usePrintCalculator();
  const { addToCart } = useCart();

  const handleCalculate = () => {
    const finalTrimSize = isCustomTrim
      ? `${customTrimWidth}x${customTrimHeight}`
      : trimSize;

    calculatePrice({
      quantity,
      trimSize: finalTrimSize,
      paperStock,
      pages,
    });
  };

  const handleAddToCart = () => {
    const finalTrimSize = isCustomTrim
      ? `${customTrimWidth}x${customTrimHeight}`
      : trimSize;

    const item = {
      name: "Custom Booklet",
      id: `custom-${Date.now()}`,
      price: price,
      quantity: quantity,
      details: {
        trimSize: finalTrimSize,
        paperStock,
        pages,
      },
    };
    addToCart(item);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Booklet Pricing</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="mb-4">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              min="1"
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="trim-size">Trim Size (inches)</Label>
            <Select value={trimSize} onValueChange={setTrimSize}>
              <SelectTrigger id="trim-size">
                <SelectValue placeholder="Select trim size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8.5x11">8.5 x 11 (Letter)</SelectItem>
                <SelectItem value="6x9">6 x 9 (Trade)</SelectItem>
                <SelectItem value="5.5x8.5">5.5 x 8.5 (Digest)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustomTrim && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="custom-width">Width</Label>
                <Input
                  id="custom-width"
                  value={customTrimWidth}
                  onChange={(e) => setCustomTrimWidth(e.target.value)}
                  placeholder="e.g., 8.25"
                />
              </div>
              <div>
                <Label htmlFor="custom-height">Height</Label>
                <Input
                  id="custom-height"
                  value={customTrimHeight}
                  onChange={(e) => setCustomTrimHeight(e.target.value)}
                  placeholder="e.g., 10.75"
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <Label htmlFor="pages">Total Pages (including cover)</Label>
            <Input
              id="pages"
              type="number"
              value={pages}
              onChange={(e) => setPages(parseInt(e.target.value))}
              min="4"
              step="4"
            />
             <p className="text-sm text-gray-500 mt-1">Must be a multiple of 4.</p>
          </div>

          <div className="mb-4">
            <Label htmlFor="paper-stock">Paper Stock</Label>
            <Select value={paperStock} onValueChange={setPaperStock}>
              <SelectTrigger id="paper-stock">
                <SelectValue placeholder="Select paper stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100lb Text">100lb Text</SelectItem>
                <SelectItem value="80lb Text">80lb Text</SelectItem>
                <SelectItem value="100lb Cover">100lb Cover</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col justify-between p-6 bg-gray-50 rounded-lg">
          <div>
            <h3 className="text-2xl font-bold text-center mb-4">Estimated Price</h3>
            <p className="text-5xl font-bold text-center mb-6">
              {price !== null ? `$${price.toFixed(2)}` : "N/A"}
            </p>
          </div>
          <Button onClick={handleCalculate} className="w-full mb-2">Calculate Price</Button>
          <Button onClick={handleAddToCart} className="w-full" variant="outline" disabled={!price}>Add to Cart</Button>
        </div>
      </CardContent>
    </Card>
  );
}
