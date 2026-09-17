"use client";

export type CandidateDateFieldProps = {
  /** 表示用の連番（0始まり） */
  index: number;
  /** labelとinputを結びつけるid。候補日ごとに一意 */
  fieldId: string;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  /** 最低1件は残すため、候補日が1件だけのときはfalse */
  removable: boolean;
};

export function CandidateDateField({
  index,
  fieldId,
  value,
  onChange,
  onRemove,
  removable,
}: CandidateDateFieldProps) {
  const label = `候補日 ${index + 1}`;

  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm text-ink-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          name="candidate"
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-rule bg-surface px-2 text-ink"
        />
        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${label}を消す`}
            className="h-11 min-w-11 shrink-0 rounded-lg border border-rule px-4 text-sm text-ink-muted"
          >
            消す
          </button>
        ) : null}
      </div>
    </div>
  );
}
