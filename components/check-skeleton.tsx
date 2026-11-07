// Placeholder rows shaped like the finished timeline.
//
// A spinner says "something is happening". Rows in the shape of the answer
// say "here is what is coming", so the screen does not jump when the first
// real step lands. The pulse is cosmetic, so reduced-motion users get the
// same rows, still.

export function CheckSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section aria-hidden className="space-y-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="border-l-2 border-line pl-4">
          <div
            className="h-4 rounded-full bg-surface-sunk"
            style={{ width: `${72 - index * 11}%` }}
          />
          <div
            className="mt-2.5 h-3 rounded-full bg-surface-sunk"
            style={{ width: `${52 - index * 7}%` }}
          />
        </div>
      ))}
    </section>
  );
}
