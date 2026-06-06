"use client";

import { useState } from "react";

/**
 * @param {object} props
 * @param {string} props.seasonLabel
 * @param {{ gp: string; g: string; a: string; p: string }} props.current
 * @param {Array<{ key: string; season: string; team: string; mj: string|number; goals: string|number; assists: string|number; points: string|number; ppg: string|number }>} props.history
 */
export default function PlayerStatsTabs({ seasonLabel, current, history }) {
  const [tab, setTab] = useState("season");

  return (
    <div className="pl-stats">
      <div className="pl-tabs" role="tablist" aria-label="Statistiques">
        <button
          type="button"
          role="tab"
          id="pl-tab-season"
          aria-selected={tab === "season"}
          aria-controls="pl-panel-season"
          className={`pl-tab${tab === "season" ? " pl-tab--active" : ""}`}
          onClick={() => setTab("season")}
        >
          Saison
        </button>
        <button
          type="button"
          role="tab"
          id="pl-tab-career"
          aria-selected={tab === "career"}
          aria-controls="pl-panel-career"
          className={`pl-tab${tab === "career" ? " pl-tab--active" : ""}`}
          onClick={() => setTab("career")}
        >
          Carrière
        </button>
      </div>

      {tab === "season" ? (
        <div
          id="pl-panel-season"
          role="tabpanel"
          aria-labelledby="pl-tab-season"
          className="pl-panel"
        >
          {seasonLabel ? (
            <p className="pl-panel__caption cn-mono">SAISON {seasonLabel}</p>
          ) : null}
          <div className="pl-statgrid">
            <div className="pl-stat">
              <span className="pl-stat__value cn-mono">{current.gp}</span>
              <span className="pl-stat__label cn-label">Matchs</span>
            </div>
            <div className="pl-stat">
              <span className="pl-stat__value cn-mono">{current.g}</span>
              <span className="pl-stat__label cn-label">Buts</span>
            </div>
            <div className="pl-stat">
              <span className="pl-stat__value cn-mono">{current.a}</span>
              <span className="pl-stat__label cn-label">Passes</span>
            </div>
            <div className="pl-stat pl-stat--accent">
              <span className="pl-stat__value cn-mono">{current.p}</span>
              <span className="pl-stat__label cn-label">Points</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          id="pl-panel-career"
          role="tabpanel"
          aria-labelledby="pl-tab-career"
          className="pl-panel"
        >
          {history.length === 0 ? (
            <p className="pl-empty">
              Aucune saison NHL (saison régulière) dans les données.
            </p>
          ) : (
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th scope="col">Saison</th>
                    <th scope="col">Équipe</th>
                    <th scope="col" className="pl-table__num">MJ</th>
                    <th scope="col" className="pl-table__num">B</th>
                    <th scope="col" className="pl-table__num">A</th>
                    <th scope="col" className="pl-table__num">PTS</th>
                    <th scope="col" className="pl-table__num">P/M</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        seasonLabel && row.season === seasonLabel
                          ? "pl-table__row--current"
                          : undefined
                      }
                    >
                      <td className="cn-mono">{row.season}</td>
                      <td className="pl-table__team">{row.team}</td>
                      <td className="pl-table__num cn-mono">{row.mj}</td>
                      <td className="pl-table__num cn-mono">{row.goals}</td>
                      <td className="pl-table__num cn-mono">{row.assists}</td>
                      <td className="pl-table__num cn-mono pl-table__pts">
                        {row.points}
                      </td>
                      <td className="pl-table__num cn-mono">{row.ppg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
