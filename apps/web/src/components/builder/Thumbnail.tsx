"use client";

export default function Thumbnail({ pageNumber, isSelected, onClick }) {
  return (
    <div
      className={`cursor-pointer border-2 rounded-md p-2 mb-2 ${
        isSelected ? "border-blue-500" : "border-gray-300"
      }`}
      onClick={onClick}
    >
      <div className="bg-white aspect-[8.5/11] flex items-center justify-center">
        <span className="text-gray-500">{pageNumber}</span>
      </div>
    </div>
  );
}
