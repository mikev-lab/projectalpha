"use client";

import { Button } from "@/components/ui/button";
import { useStorage } from "@/hooks/useStorage";

export default function FileUpload({ projectId, onUpload }) {
  const { uploadFile, progress } = useStorage();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const downloadURL = await uploadFile(projectId, file);
      onUpload(downloadURL);
    }
  };

  return (
    <div>
      <Button asChild>
        <label htmlFor="file-upload">Upload File</label>
      </Button>
      <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} />
      {progress > 0 && <p>Uploading: {progress}%</p>}
    </div>
  );
}
