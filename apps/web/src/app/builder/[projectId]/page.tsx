"use client";

import Thumbnail from "@/components/builder/Thumbnail";
import { Label } from "@/components/ui/label";
import FileUpload from "@/components/builder/FileUpload";
import { Switch } from "@/components/ui/switch";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Canvas from "@/components/builder/Canvas";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { useMedusa } from "@/hooks/useMedusa";

export default function BuilderPage() {
  const { projectId } = useParams();
  const { project, loadProject, saveProject, updatePage } = useProject();
  const { addItem } = useCart();
  const { createProduct } = useMedusa();
  const [selectedPage, setSelectedPage] = useState(1);
  const [isSpreadView, setIsSpreadView] = useState(true);
  const [isRtl, setIsRtl] = useState(false);

  const handleAddToCart = async () => {
    const product = await createProduct(project);
    await addItem(product.variants[0].id, 1);
  };

  useEffect(() => {
    loadProject(projectId);
  }, [projectId, loadProject]);

  const pages = project ? project.pages : [];

  const isPageInSpread = (pageNumber) => {
    if (!isSpreadView) {
      return pageNumber === selectedPage;
    }

    if (selectedPage === 1 && pageNumber === 1) return true;
    if (selectedPage === pages.length && pageNumber === pages.length) return true;

    if (selectedPage % 2 === 0) {
      return pageNumber === selectedPage || pageNumber === selectedPage + 1;
    } else {
      return pageNumber === selectedPage || pageNumber === selectedPage - 1;
    }
  };

  const renderPage = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > pages.length) {
      return <div className="aspect-[8.5/11] mx-auto" />;
    }

    const page = pages.find((p) => p.id === pageNumber);

    return (
      <div className="bg-white aspect-[8.5/11] mx-auto shadow-lg flex items-center justify-center">
        {page.content ? (
          <Canvas
            content={page.content}
            onTransformChange={(newTransform) =>
              updatePage(pageNumber, { content: { ...page.content, transform: newTransform } })
            }
          />
        ) : (
          <span className="text-gray-500 text-4xl">{pageNumber}</span>
        )}
      </div>
    );
  };

  const renderSpread = () => {
    let leftPage, rightPage;

    if (selectedPage === 1) {
      return renderPage(1);
    }

    if (selectedPage === pages.length && pages.length % 2 === 0) {
      return renderPage(pages.length);
    }

    if (selectedPage % 2 === 0) {
      leftPage = selectedPage;
      rightPage = selectedPage + 1;
    } else {
      leftPage = selectedPage - 1;
      rightPage = selectedPage;
    }

    if (isRtl) {
      [leftPage, rightPage] = [rightPage, leftPage];
    }

    return (
      <div className="flex space-x-8">
        {renderPage(leftPage)}
        {renderPage(rightPage)}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Thumbnail Sidebar */}
      <div className="w-64 bg-white p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Pages</h2>
          <div className="flex space-x-2">
            <FileUpload
              projectId={projectId}
              onUpload={(url) => updatePage(selectedPage, { content: { type: "image", src: url } })}
            />
            <Button
              onClick={() =>
                updatePage(selectedPage, {
                  content: {
                    type: "text",
                    text: "Hello, World!",
                    transform: { x: 50, y: 50 },
                  },
                })
              }
            >
              Add Text
            </Button>
          </div>
        </div>
        {pages.map((page) => (
          <Thumbnail
            key={page.id}
            pageNumber={page.id}
            isSelected={isPageInSpread(page.id)}
            onClick={() => setSelectedPage(page.id)}
          />
        ))}
      </div>

      {/* Main Viewer */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Project: {project ? project.name : ""}</h1>
          <div className="flex items-center space-x-4">
            <Button onClick={saveProject}>Save</Button>
            <Button onClick={handleAddToCart}>Add to Cart</Button>
            <div className="flex items-center space-x-2">
              <Switch id="rtl-toggle" checked={isRtl} onCheckedChange={setIsRtl} />
              <Label htmlFor="rtl-toggle">RTL</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="spread-toggle" checked={isSpreadView} onCheckedChange={setIsSpreadView} />
              <Label htmlFor="spread-toggle">Spread View</Label>
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          {isSpreadView ? renderSpread() : renderPage(selectedPage)}
        </div>
      </div>
    </div>
  );
}
