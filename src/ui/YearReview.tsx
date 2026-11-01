import { useState } from 'react';
import { type ReviewRow, reviewSummary, setInclude, setYear } from '../host/review';

export function YearReview({
  rows,
  onChange,
  onDone,
}: {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  const summary = reviewSummary(rows);
  const shown = all ? rows : rows.filter((r) => r.flag !== 'ok');
  return (
    <section className="panel">
      <div className="row">
        <div className="rows">
          <h2>Year review</h2>
          <span className="muted">
            {summary.total} tracks · {summary.total - summary.toCheck} confirmed by MusicBrainz · {summary.toCheck} to
            check
          </span>
        </div>
        <div className="actions">
          <button type="button" className={all ? 'btn small' : 'btn small selected'} aria-pressed={!all} onClick={() => setAll(false)}>
            To check ({summary.toCheck})
          </button>
          <button type="button" className={all ? 'btn small selected' : 'btn small'} aria-pressed={all} onClick={() => setAll(true)}>
            All ({summary.total})
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="review">
          <thead>
            <tr>
              <th>Track</th>
              <th>Spotify date</th>
              <th>Earliest found</th>
              <th>Use year</th>
              <th>Include</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.title}</b> · {r.artists.join(', ')}
                </td>
                <td>{r.sourceYear}</td>
                <td className={r.flag === 'ok' ? undefined : 'warn'}>{r.mbYear ?? 'No match'}</td>
                <td>
                  <input
                    key={r.chosenYear}
                    className="input narrow"
                    type="number"
                    inputMode="numeric"
                    defaultValue={r.chosenYear}
                    aria-label={`Year for ${r.title}`}
                    onBlur={(e) => {
                      onChange(setYear(rows, r.id, Number(e.target.value)));
                      e.target.value = String(r.chosenYear);
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.include}
                    aria-label={`Include ${r.title}`}
                    onChange={(e) => onChange(setInclude(rows, r.id, e.target.checked))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted">Nothing left to check.</p>}
      <button type="button" className="btn primary" onClick={onDone}>
        Done · {summary.included} songs
      </button>
    </section>
  );
}
