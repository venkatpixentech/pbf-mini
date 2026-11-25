// Small presentational pieces shared by the Last Man Standing screens.
import type { Fixture, Team } from './api/types';
import { favouriteLabel, tier } from './lib';

/** Card-tier style OVR badge. */
export function Badge({ team, small }: { team: Team; small?: boolean }) {
  return (
    <span className={`lms-ovr ${tier(team)}${small ? ' sm' : ''}`} aria-label={`OVR ${team.ovr}`}>
      {!small && <small>OVR</small>}
      {team.ovr}
    </span>
  );
}

/** Home win / draw / away win strength bar. */
export function HdaBar({ fixture, teams, thin }: { fixture: Fixture; teams: Map<string, Team>; thin?: boolean }) {
  const [h, d, a] = fixture.probs;
  return (
    <div className={`lms-hda${thin ? ' thin' : ''}`} role="img" aria-label={favouriteLabel(fixture, teams)}>
      <i className="h" style={{ width: `${h * 100}%` }} />
      <i className="d" style={{ width: `${d * 100}%` }} />
      <i className="a" style={{ width: `${a * 100}%` }} />
    </div>
  );
}

export function HdaKey() {
  return (
    <div className="lms-key">
      <span>
        <i className="h" />
        Home win
      </span>
      <span>
        <i className="d" />
        Draw
      </span>
      <span>
        <i className="a" />
        Away win
      </span>
    </div>
  );
}
