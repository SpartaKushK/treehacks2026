"use client";

interface Props {
  data: unknown;
  maxHeight?: number;
}

export default function JsonView({ data, maxHeight = 400 }: Props) {
  return (
    <pre
      className="json-view"
      style={{ maxHeight }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
