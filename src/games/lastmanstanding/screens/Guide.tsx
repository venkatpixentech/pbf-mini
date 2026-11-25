import type { Game } from '../api/types';

const EXAMPLES: Array<[string, string, string, string]> = [
  ['Two 80-rated sides', '41%', '24%', '35%'],
  ['81 at home to 80', '45%', '23%', '32%'],
  ['87 at home to 80', '65%', '18%', '17%'],
  ['88 at home to 78', '74%', '14%', '12%'],
  ['74 at home to 88', '9%', '12%', '79%'],
];

/** "How results and prizes work": static explainer, plus the live ladder maths once a game is running. */
export function Guide({ game }: { game?: Game | null }) {
  return (
    <details className="pbf-card lms-guide">
      <summary>How results and prizes work</summary>
      <h4>Match results</h4>
      <p>
        Every match is settled by a random draw weighted by the two teams&apos; ratings, so the stronger side wins more
        often but upsets still happen. The odds are fitted to the results of about 15 million Playbook Football matches.
      </p>
      <p>First the game works out an OVR-equivalent gap. Attack, defence and creativity count alongside OVR:</p>
      <p className="lms-formula">
        Gap = [(home OVR - away OVR) + 0.25 x ((home ATT - away DEF) - (away ATT - home DEF)) + 0.1 x (home CRE - away
        CRE)] / 1.6 + 0.96 for home advantage
      </p>
      <div className="lms-table">
        <table>
          <thead>
            <tr>
              <th>Example</th>
              <th>Home win</th>
              <th>Draw</th>
              <th>Away win</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((r) => (
              <tr key={r[0]}>
                {r.map((c) => (
                  <td key={c}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Prizes and return to player</h4>
      <p>
        The match odds carry no margin. The margin sits in the prize ladder, the same way it does in a crash game.
        Because you can see the whole fixture list before you play, the ladder is priced against the best possible play
        on the fixture list you are dealt. The three difficulty levels use the same clubs and match odds; only the order
        of the fixtures changes.
      </p>
      {game ? (
        <div className="lms-table">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Multiplier</th>
                <th>Best chance of getting there</th>
                <th>Return, best play</th>
                <th>Return, biggest OVR gap</th>
              </tr>
            </thead>
            <tbody>
              {game.best.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{game.ladder[i]}x</td>
                  <td>{(p * 100).toFixed(p < 0.1 ? 2 : 1)}%</td>
                  <td>{(p * game.ladder[i] * 100).toFixed(1)}%</td>
                  <td>{(game.gap[i] * game.ladder[i] * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Start a game to see the exact ladder maths for your fixture list.</p>
      )}
      <h4>Ratings</h4>
      <p>
        Ratings come from the Playbook Football player database. A club&apos;s ratings are its best XI in a 4-3-3: OVR
        is the average player OVR; ATT, DEF and CRE weight each line&apos;s attacking, defensive and creative ratings.
      </p>
    </details>
  );
}
