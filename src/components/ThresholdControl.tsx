import { useGalleryStore } from '@/store/store';

export function ThresholdControl() {
  const { threshold, setThreshold } = useGalleryStore();

  const increment = () => setThreshold(Math.min(threshold + 60, 9999));
  const decrement = () => setThreshold(Math.max(threshold - 60, 0));

  return (
    <div className="flex items-center space-x-2 font-mono text-sm">
      <span className="text-neutral-400">Threshold:</span>
      <button
        onClick={decrement}
        className="hover:opacity-60 transition-opacity"
        aria-label="Decrease threshold"
      >
        －
      </button>
      <span className="w-16 text-center tabular-nums">
        {threshold.toString().padStart(4, '0')}
      </span>
      <button
        onClick={increment}
        className="hover:opacity-60 transition-opacity"
        aria-label="Increase threshold"
      >
        ＋
      </button>
    </div>
  );
}
